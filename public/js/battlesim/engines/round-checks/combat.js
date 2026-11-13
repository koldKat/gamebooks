// Resolve finite combat rounds from explicit stat formulas and encounter exceptions.
const integer = (value, min = -1000000, max = 1000000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
const field = value => {
  if (typeof value !== 'string' || !/^[a-z][a-zA-Z0-9]{0,39}$/.test(value)) throw new RangeError('Invalid combat field');
  return value;
};
const values = record => Object.fromEntries(Object.entries(record ?? {}).map(([key, value]) => [field(key), integer(value)]));
const dice = (input, count, roll) => {
  if (input !== undefined && (!Array.isArray(input) || input.length !== count)) throw new RangeError('Invalid dice');
  return Array.from({length:count}, (_, i) => integer(input?.[i] ?? roll(), 1, 6));
};
const sum = list => list.reduce((a, b) => a + b, 0);
function validateEffects(effects = []) {
  if (!Array.isArray(effects)) throw new RangeError('Invalid combat effects');
  for (const effect of effects) {values(effect.changes); values(effect.perLossChanges); values(effect.setParams);}
}

export function normalizeEncounter(input) {
  if (!input || !Array.isArray(input.rounds) || !input.rounds.length || input.rounds.length > 20) throw new RangeError('Missing combat rounds');
  const encounter = structuredClone(input);
  encounter.key = String(input.key ?? ''); encounter.name = String(input.name ?? 'Opponent').slice(0, 300);
  encounter.section = String(input.section ?? '');
  encounter.rules ??= {}; encounter.rules.goal ??= {kind:'manual'};
  const goal = encounter.rules.goal;
  if (!['manual', 'always', 'last', 'atLeast'].includes(goal.kind)) throw new RangeError('Invalid result rule');
  if (goal.kind === 'atLeast') integer(goal.wins, 1, encounter.rounds.length);
  for (const [index, round] of encounter.rounds.entries()) {
    integer(round.dice, 1, 3); round.stats ??= [];
    if (!Array.isArray(round.stats) || round.stats.length > 5) throw new RangeError('Invalid combat stats');
    round.stats.forEach(field);
    if (!['sum', 'min', 'max'].includes(round.select ?? 'sum') || !round.stats.length && ['min','max'].includes(round.select)) throw new RangeError('Invalid stat selection');
    values(round.params); integer(round.target ?? 0);
    if (round.targetParameter) {field(round.targetParameter); integer(round.targetFactor ?? 1);}
    integer(round.winsBonus ?? 0);
    if (round.bonusFromRound != null) {integer(round.bonusFromRound, 0, index - 1); integer(round.bonus ?? 0);}
    values(round.winChanges); values(round.lossChanges);
    if (round.automaticWinParameter) field(round.automaticWinParameter);
    validateEffects(round.startEffects);
    if (round.opposed) {integer(round.opposed.dice, 1, 3); integer(round.opposed.bonus ?? 0); integer(round.opposed.cap, 1);}
  }
  values(encounter.rules.minimums);
  for (const [name, thresholds] of Object.entries(encounter.rules.derivedParameters ?? {})) {
    field(name);
    if (!Array.isArray(thresholds) || !thresholds.length) throw new RangeError('Invalid derived parameter');
    for (const threshold of thresholds) {field(threshold.name); integer(threshold.min);}
  }
  validateEffects(encounter.rules.finishEffects);
  if (encounter.rules.automaticWinParameter) field(encounter.rules.automaticWinParameter);
  for (const [key, item] of Object.entries(encounter.rules.consumables ?? {})) {
    field(key); values(item.changes);
    if (item.rounds != null) {
      if (!Array.isArray(item.rounds) || !item.rounds.length) throw new RangeError('Invalid consumable rounds');
      item.rounds.forEach(index => integer(index, 0, encounter.rounds.length - 1));
    }
  }
  for (const route of encounter.rules.destinations ?? []) integer(route.section, 1);
  if (encounter.rules.choiceEffect) {
    const effect = encounter.rules.choiceEffect;
    if (!Array.isArray(effect.fields) || !effect.fields.length) throw new RangeError('Invalid combat choice');
    effect.fields.forEach(field); integer(effect.amount);
  }
  return encounter;
}

export function startFight(player, input, options = {}) {
  const encounter = normalizeEncounter(input), character = values(player);
  if (!Object.keys(character).length) throw new RangeError('Missing combat stats');
  const params = values(options.params);
  for (const [name, thresholds] of Object.entries(encounter.rules.derivedParameters ?? {})) {
    params[name] = thresholds.filter(threshold => (params[threshold.name] ?? 0) >= threshold.min).length;
  }
  const fight = {rulesVersion:1, revision:0, status:'fighting', result:null, round:0,
    player:character, opponent:{name:encounter.name, section:encounter.section}, encounter,
    params, modifier:integer(options.modifier ?? 0),
    items:{caltrop:Boolean(options.caltrop), grenade:options.timeGrenade ? 2 : 0, creepyBall:options.creepyBall ? 1 : 0},
    pending:null, pendingChoice:null, rounds:[], events:[], destination:null, costsApplied:false};
  if (encounter.rules.consumables) fight.consumables = Object.fromEntries(
    Object.keys(encounter.rules.consumables).map(key => [key, options.consumables?.[key] ? 1 : 0]));
  prepareRound(fight);
  return validateFight(fight);
}

export function validateFight(fight) {
  if (!fight || fight.rulesVersion !== 1 || !['fighting','win','loss'].includes(fight.status)
      || ![null,'win','loss','manual'].includes(fight.result)) throw new RangeError('Invalid saved combat');
  normalizeEncounter(fight.encounter); values(fight.player); values(fight.params); integer(fight.modifier);
  integer(fight.revision, 0); integer(fight.round, 0, fight.encounter.rounds.length);
  if (!Array.isArray(fight.rounds) || fight.rounds.length !== fight.round || !Array.isArray(fight.events)) throw new RangeError('Invalid combat history');
  if (fight.rounds.some(round => typeof round.won !== 'boolean')) throw new RangeError('Invalid combat round');
  integer(fight.items?.grenade, 0, 2); integer(fight.items?.creepyBall, 0, 1);
  if (typeof fight.items.caltrop !== 'boolean') throw new RangeError('Invalid combat item');
  if (fight.encounter.rules.consumables) {
    if (!fight.consumables || Object.keys(fight.consumables).length !== Object.keys(fight.encounter.rules.consumables).length) throw new RangeError('Invalid saved consumables');
    for (const key of Object.keys(fight.encounter.rules.consumables)) integer(fight.consumables[key], 0, 1);
  }
  if (fight.pending) {
    const spec = fight.encounter.rounds[fight.round]; if (!spec || fight.result || fight.pendingChoice) throw new RangeError('Invalid pending round');
    const never = () => {throw new RangeError('Missing saved die');};
    dice(fight.pending.player, spec.dice, never);
    dice(fight.pending.enemy, spec.opposed?.dice ?? 0, never);
    if (fight.pending.roundModifier !== undefined) integer(fight.pending.roundModifier, -1000, 1000);
  }
  return fight;
}

function expression(spec, fight) {
  const selected = spec.stats.map(key => {
    if (!Object.hasOwn(fight.player, key)) throw new RangeError('Missing player stat');
    return fight.player[key];
  });
  return spec.select === 'min' ? Math.min(...selected) : spec.select === 'max' ? Math.max(...selected) : sum(selected);
}
const wins = fight => fight.rounds.filter(round => round.won).length;
function condition(test = {}, fight) {
  const won = wins(fight), lost = fight.round - won;
  if (won < (test.winsMin ?? 0) || won > (test.winsMax ?? Infinity)
      || lost < (test.lossesMin ?? 0) || lost > (test.lossesMax ?? Infinity)) return false;
  if (test.parameter) {
    const value = fight.params[test.parameter.name] ?? 0;
    if (value < (test.parameter.min ?? -Infinity) || value > (test.parameter.max ?? Infinity)) return false;
  }
  return true;
}
function changeStats(fight, deltas = {}, multiplier = 1) {
  for (const [key, delta] of Object.entries(deltas)) {
    if (!Object.hasOwn(fight.player, key)) throw new RangeError('Missing affected stat');
    fight.player[key] = integer(fight.player[key] + integer(delta) * multiplier);
  }
}
function applyEffects(fight, effects = []) {
  for (const effect of effects) if (condition(effect.when, fight)) {
    changeStats(fight, effect.changes); changeStats(fight, effect.perLossChanges, fight.round - wins(fight));
    Object.assign(fight.params, values(effect.setParams));
    for (const text of effect.notes ?? []) fight.events.push({kind:'note', text:String(text)});
  }
}
function prepareRound(fight) {
  applyEffects(fight, fight.encounter.rounds[fight.round]?.startEffects);
}
export function automaticWinSource(fight) {
  if (fight?.status !== 'fighting' || fight.result || fight.pendingChoice) return null;
  for (const key of [fight.encounter.rules.automaticWinParameter, fight.encounter.rounds[fight.round]?.automaticWinParameter]) {
    if (key && (fight.params[key] ?? 0) > 0) return key;
  }
  return null;
}
export function availableConsumables(fight) {
  if (fight?.status !== 'fighting' || fight.result || fight.pendingChoice) return [];
  return Object.entries(fight.encounter.rules.consumables ?? {}).filter(([key, item]) =>
    fight.consumables?.[key] > 0 && (!item.rounds || item.rounds.includes(fight.round))).map(([key]) => key);
}
function complete(fight) {
  if (fight.costsApplied) throw new RangeError('Combat costs already resolved');
  const rules = fight.encounter.rules;
  applyEffects(fight, rules.finishEffects);
  for (const [key, minimum] of Object.entries(rules.minimums ?? {})) {
    if (!Object.hasOwn(fight.player, key)) throw new RangeError('Missing affected stat');
    fight.player[key] = Math.max(fight.player[key], minimum);
  }
  fight.costsApplied = true;
  const choice = rules.choiceEffect;
  if (choice && condition(choice.when, fight)) fight.pendingChoice = structuredClone(choice);
  const goal = rules.goal;
  fight.result = goal.kind === 'manual' ? 'manual' : goal.kind === 'always' ? 'win'
    : (goal.kind === 'last' ? fight.rounds.at(-1).won : wins(fight) >= goal.wins) ? 'win' : 'loss';
}
function resolve(fight, forced = false, forcedBy) {
  const spec = fight.encounter.rounds[fight.round], pending = fight.pending;
  if (!forced && !pending) throw new RangeError('Roll the dice first');
  if (!forced && automaticWinSource(fight)) {forced = true; forcedBy = automaticWinSource(fight);}
  const total = forced ? null : sum(pending.player) + expression(spec, fight)
    + sum(Object.entries(spec.params ?? {}).map(([key, factor]) => integer(fight.params[key] ?? 0) * factor))
    + fight.modifier + (pending.roundModifier ?? 0) + (fight.items.caltrop ? 2 : 0) + (spec.winsBonus ?? 0) * wins(fight)
    + (spec.bonusFromRound != null && fight.rounds[spec.bonusFromRound]?.won ? spec.bonus : 0);
  const target = forced ? null : spec.opposed ? Math.min(spec.opposed.cap, sum(pending.enemy) + (spec.opposed.bonus ?? 0))
    : (spec.target ?? 0) + (spec.targetParameter ? (fight.params[spec.targetParameter] ?? 0) * (spec.targetFactor ?? 1) : 0);
  const won = forced || (spec.opposed ? total > target : total >= target);
  const result = {kind:'round', index:fight.round, won, forced, total, target,
    playerDice:pending?.player ?? [], enemyDice:pending?.enemy ?? []};
  if (forcedBy) result.forcedBy = forcedBy;
  if (pending?.roundModifier !== undefined) result.roundModifier = pending.roundModifier;
  changeStats(fight, won ? spec.winChanges : spec.lossChanges);
  fight.rounds.push(result); fight.events.push(result); fight.pending = null; fight.round++;
  if (fight.round === fight.encounter.rounds.length || won && fight.encounter.rules.stopOnWin) complete(fight);
  else prepareRound(fight);
}

export function combatAction(original, action, roll = () => Math.floor(Math.random() * 6) + 1) {
  validateFight(original);
  if (original.status !== 'fighting' || action.expectedRevision !== original.revision) throw new RangeError('Stale combat action');
  const fight = structuredClone(original), spec = fight.encounter.rounds[fight.round];
  if (action.kind === 'choose') {
    const choice = fight.pendingChoice;
    if (!choice || !choice.fields.includes(action.stat)) throw new RangeError('Choose the affected stat');
    changeStats(fight, {[action.stat]:choice.amount}); fight.pendingChoice = null;
    fight.events.push({kind:'choice', stat:action.stat, amount:choice.amount});
  } else if (action.kind === 'finish') {
    if (!fight.result || fight.pending || fight.pendingChoice) throw new RangeError('Combat result is not ready');
    const outcome = fight.result === 'manual' ? action.outcome : fight.result;
    if (!['win','loss'].includes(outcome)) throw new RangeError('Confirm the combat result');
    fight.status = outcome;
    fight.destination = fight.encounter.rules.destinations?.find(route => condition(route.when, fight))?.section
      ?? fight.encounter.rules[outcome] ?? null;
  } else if (action.kind === 'creepyBall') {
    if (!fight.pending || fight.items.creepyBall < 1 || !['player','enemy'].includes(action.side)) throw new RangeError('No die can be changed');
    const pool = fight.pending[action.side], index = integer(action.index, 0, pool.length - 1);
    pool[index] = 6; fight.items.creepyBall--;
  } else {
    if (!spec || fight.result || fight.pendingChoice) throw new RangeError('No combat round available');
    if (action.kind === 'roll') {
      if (fight.pending) throw new RangeError('Resolve the pending round');
      fight.pending = {player:dice(action.playerDice, spec.dice, roll), enemy:dice(action.enemyDice, spec.opposed?.dice ?? 0, roll)};
      if (action.roundModifier !== undefined) fight.pending.roundModifier = integer(action.roundModifier, -1000, 1000);
    } else if (action.kind === 'resolve') resolve(fight);
    else if (action.kind === 'automaticWin') {
      const source = automaticWinSource(fight);
      if (!source) throw new RangeError('No automatic win available');
      resolve(fight, true, source);
    } else if (action.kind === 'consume') {
      if (!availableConsumables(fight).includes(action.key)) throw new RangeError('Consumable unavailable this round');
      const item = fight.encounter.rules.consumables[action.key];
      fight.consumables[action.key]--; changeStats(fight, item.changes);
      if (item.note) fight.events.push({kind:'note', text:String(item.note)});
      resolve(fight, true, action.key);
    }
    else if (action.kind === 'grenade') {
      if (fight.items.grenade < 1) throw new RangeError('No automatic round wins left');
      fight.items.grenade--; resolve(fight, true);
    } else throw new RangeError('Unknown combat action');
  }
  fight.events = fight.events.slice(-60); fight.revision++;
  return validateFight(fight);
}
