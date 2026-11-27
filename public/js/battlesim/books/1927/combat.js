const attributes = ['strength', 'endurance', 'dexterity', 'charisma', 'mentality', 'brawling'];
const bonuses = ['bluff', 'surprise', 'clueZ'];

function integer(number, min, max) {
  if (!Number.isInteger(number) || number < min || number > max) throw new RangeError('Invalid combat value');
  return number;
}

function fields(stats) {
  return Object.fromEntries(attributes.map(key => [key, integer(stats[key], 2, 12)]));
}

function attribute(key) {
  if (!attributes.includes(key)) throw new RangeError('Unknown attribute');
  return key;
}

function destinations(value) {
  const source = Array.isArray(value) ? value : [value];
  if (source.some(id => typeof id !== 'string' && !Number.isSafeInteger(id))) throw new RangeError('Invalid printed destination');
  const list = source.map(String);
  if (!list.length || list.length > 3 || list.some(id => !/^(?:[1-5]\d\d|[A-Za-z][A-Za-z0-9]{0,20})$/.test(id))) {
    throw new RangeError('Invalid printed destination');
  }
  return list;
}

function statChanges(values) {
  return Object.fromEntries(Object.entries(values ?? {}).map(([key, value]) => [attribute(key), integer(value, -12, 0)]));
}

export function normalizeEncounter(spec) {
  const name = typeof spec.name === 'string' ? spec.name.trim() : '';
  if (!name || name.length > 120 || !Array.isArray(spec.saves) || !spec.saves.length || spec.saves.length > 2
      || !Array.isArray(spec.targetStats) || !spec.targetStats.length || spec.targetStats.length > 2) throw new RangeError('Invalid encounter');
  const encounter = {
    key: spec.key ?? '', section: spec.section ?? null, name,
    saves: spec.saves.map(save => ({ stat: attribute(save.stat), onPass: integer(save.onPass, -12, 12), onFail: integer(save.onFail, -12, 12) })),
    targetStats: spec.targetStats.map(attribute), opponentDice: integer(spec.opponentDice, 1, 2),
    opponentModifier: integer(spec.opponentModifier, -12, 12), strictTie: spec.strictTie === true,
    win: spec.section == null ? [] : destinations(spec.win), loss: spec.section == null ? [] : destinations(spec.loss),
    openingChanges: statChanges(spec.openingChanges), lossChanges: statChanges(spec.lossChanges),
  };
  if (spec.bonus) {
    if (!bonuses.includes(spec.bonus.key)) throw new RangeError('Invalid combat bonus');
    encounter.bonus = { key: spec.bonus.key, modifier: integer(spec.bonus.modifier, -12, 0) };
  }
  if (spec.continuation) {
    if (spec.continuation.kind !== 'disarmThenAttack') throw new RangeError('Invalid combat sequence');
    encounter.continuation = { kind: spec.continuation.kind, pickupStat: attribute(spec.continuation.pickupStat),
      attackOpponentModifier: integer(spec.continuation.attackOpponentModifier, -12, 12) };
  }
  if (spec.failureSave) {
    const [onPass] = destinations(spec.failureSave.onPass);
    const [onFail] = destinations(spec.failureSave.onFail);
    if (!encounter.loss.includes(onPass) || !encounter.loss.includes(onFail)) throw new RangeError('Invalid injury destinations');
    encounter.failureSave = { stat: attribute(spec.failureSave.stat), onPass, onFail };
  }
  if (spec.destinationLabel) encounter.destinationLabel = String(spec.destinationLabel);
  return encounter;
}

function applyChanges(player, changes) {
  for (const [key, amount] of Object.entries(changes)) player[key] = Math.max(2, player[key] + amount);
}

export function startFight(attributes, spec, useBonus = false) {
  const opponent = normalizeEncounter(spec);
  const initial = fields(attributes);
  const player = { ...initial };
  applyChanges(player, opponent.openingChanges);
  return { rulesVersion: 1, initial, player, opponent, useBonus: Boolean(useBonus && opponent.bonus),
    status: 'fighting', phase: 'save', round: 1, saveIndex: 0, armed: false,
    modifier: useBonus && opponent.bonus ? opponent.bonus.modifier : 0,
    target: null, destinations: [], rolls: [] };
}

export function diceFor(fight) {
  return fight.phase === 'opponent' ? fight.opponent.opponentDice : 2;
}

function finish(fight, outcome, destination = fight.opponent[outcome]) {
  fight.status = outcome;
  fight.phase = 'complete';
  fight.destinations = destination ?? [];
  if (outcome === 'loss') applyChanges(fight.player, fight.opponent.lossChanges);
  // A printed strict comparison leaves equality unresolved and awards nothing.
  if (outcome === 'tie') fight.recorded = true;
}

function advance(fight, dice) {
  if (fight.status !== 'fighting') throw new RangeError('Encounter has ended');
  if (!Array.isArray(dice) || dice.length !== diceFor(fight)) throw new RangeError('Invalid number of dice');
  const total = dice.reduce((sum, value) => sum + integer(value, 1, 6), 0);
  const { phase, opponent, player } = fight;
  const roll = { phase, dice: [...dice], total };
  fight.rolls.push(roll);
  if (phase === 'save') {
    const save = opponent.saves[fight.saveIndex++];
    roll.stat = save.stat;
    roll.limit = player[save.stat];
    roll.modifier = total <= roll.limit ? save.onPass : save.onFail;
    fight.modifier += roll.modifier;
    if (fight.saveIndex === opponent.saves.length) fight.phase = 'opponent';
  } else if (phase === 'opponent') {
    roll.modifier = fight.armed ? opponent.continuation.attackOpponentModifier : opponent.opponentModifier;
    roll.limit = opponent.targetStats.reduce((sum, key) => sum + player[key], 0) - total - roll.modifier;
    fight.target = roll.limit;
    fight.phase = 'attack';
  } else if (phase === 'attack') {
    roll.modifier = fight.modifier;
    roll.limit = fight.target;
    const result = total + fight.modifier;
    if (result === fight.target && opponent.strictTie) finish(fight, 'tie');
    else if (result <= fight.target) {
      if (opponent.continuation && !fight.armed) fight.phase = 'pickup';
      else finish(fight, 'win');
    } else if (opponent.failureSave) fight.phase = 'failure';
    else finish(fight, 'loss');
  } else if (phase === 'pickup') {
    roll.stat = opponent.continuation.pickupStat;
    roll.limit = player[roll.stat];
    if (total <= roll.limit) {
      fight.armed = true;
      fight.round++;
      fight.phase = 'opponent';
    } else finish(fight, 'loss');
  } else if (phase === 'failure') {
    const { stat, onPass, onFail } = opponent.failureSave;
    roll.stat = stat;
    roll.limit = player[stat];
    finish(fight, 'loss', [total <= roll.limit ? onPass : onFail]);
  } else throw new RangeError('Invalid saved phase');
}

export function validateFight(fight) {
  if (fight?.rulesVersion !== 1 || !Array.isArray(fight.rolls) || fight.rolls.length > 10) throw new RangeError('Invalid saved encounter');
  const replay = startFight(fight.initial, fight.opponent, fight.useBonus);
  for (const roll of fight.rolls) advance(replay, roll.dice);
  for (const key of ['player', 'status', 'phase', 'round', 'saveIndex', 'armed', 'modifier', 'target', 'destinations', 'rolls']) {
    if (JSON.stringify(replay[key]) !== JSON.stringify(fight[key])) throw new RangeError('Invalid saved combat result');
  }
  return fight;
}

export function rollFight(fight, dice) {
  validateFight(fight);
  const next = structuredClone(fight);
  advance(next, dice ?? Array.from({ length: diceFor(fight) }, () => 1 + Math.floor(Math.random() * 6)));
  return validateFight(next);
}
