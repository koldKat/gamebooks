const LIMIT = 1000000;

function integer(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || value > LIMIT) {
    throw new RangeError('Invalid combat value');
  }
  return value;
}

export function chance(sides, random = Math.random) {
  if (![6, 8, 12, 16].includes(sides)) throw new RangeError('Unknown chance table');
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random value');
  return Math.floor(value * sides) + 1;
}

export function strikeCount(mastery, requested, manoeuvre = 'none') {
  integer(mastery, 1);
  integer(requested, 1);
  if (requested > mastery || !['none', 'attack', 'defence'].includes(manoeuvre)) {
    throw new RangeError('Unavailable strikes');
  }
  if (manoeuvre !== 'none' && requested < 2) throw new RangeError('A manoeuvre requires a spare strike');
  return requested - (manoeuvre === 'none' ? 0 : 1);
}

export function manoeuvreValues(attack, defence, manoeuvre, rolls = {}) {
  integer(attack);
  integer(defence);
  if (manoeuvre === 'none') return {attack, defence};
  if (!['attack', 'defence'].includes(manoeuvre)) throw new RangeError('Unknown manoeuvre');
  const bonus = integer(rolls.bonus, 1), penalty = integer(rolls.penalty, 1);
  if (bonus > 12 || penalty > 6) throw new RangeError('Invalid manoeuvre rolls');
  return manoeuvre === 'attack'
    ? {attack: attack + bonus, defence: defence - penalty}
    : {attack: attack - penalty, defence: defence + bonus};
}

// Matrix results are entered from the original tables, not inferred from damaged cells.
export function normalStrike({attack, defence, attackRoll, defenceRoll, tableDamage, damageBonus = 0}) {
  integer(attack, -LIMIT);
  integer(defence, -LIMIT);
  integer(attackRoll, 1);
  integer(defenceRoll, 1);
  integer(tableDamage);
  integer(damageBonus, -LIMIT);
  if (attackRoll > 6 || defenceRoll > 6) throw new RangeError('Invalid combat rolls');
  const attackValue = attack + attackRoll, defenceValue = defence + defenceRoll;
  return {attackValue, defenceValue, tableDamage, damage: Math.max(0, tableDamage + damageBonus - defenceValue)};
}

export function simpleStrike(tableDamage) {
  return {tableDamage: integer(tableDamage), damage: tableDamage, battleCode: 4};
}

export function magicCost({strength, energy, requiredStrength, energyCost}) {
  integer(strength);
  integer(energy);
  integer(requiredStrength);
  integer(energyCost);
  if (strength < requiredStrength || energy < energyCost) throw new RangeError('Insufficient magic');
  return {strength, energy: energy - energyCost};
}

export function openingSide(level, roll) {
  if (!['easy', 'normal', 'hard', 'fanatic'].includes(level)) throw new RangeError('Unknown game level');
  if (level === 'easy') return 'player';
  if (level === 'fanatic') return 'enemy';
  integer(roll, 1);
  if (roll > 6) throw new RangeError('Invalid opening roll');
  return roll % 2 === 0 ? 'player' : 'enemy';
}

export function actionAllowance(level, livingAllies, livingEnemies) {
  openingSide(level, 1);
  integer(livingAllies, 1);
  integer(livingEnemies, 1);
  return {
    player: ['easy', 'fanatic'].includes(level) ? 1 : livingAllies,
    enemy: level === 'easy' ? 1 : livingEnemies,
  };
}

function fighter(input) {
  const result = {...input, displayName: String(input.displayName ?? '').trim().slice(0, 200)};
  for (const key of ['attack', 'defence', 'life']) result[key] = integer(input[key]);
  for (const key of ['shooting', 'speed', 'mastery', 'magicStrength', 'magicEnergy', 'magicResistance']) {
    result[key] = input[key] == null ? null : integer(input[key]);
  }
  return result;
}

export function startFight(players, enemies, options = {}) {
  if (!Array.isArray(players) || !players.length || players.length > 100
      || !Array.isArray(enemies) || !enemies.length || enemies.length > 100) throw new RangeError('Invalid fighters');
  const system = options.system ?? 'normal', level = options.level ?? 'normal';
  if (!['normal', 'simple'].includes(system)) throw new RangeError('Unknown combat system');
  const firstSide = options.firstSide ?? openingSide(level, options.openingRoll);
  if (!['player', 'enemy'].includes(firstSide)) throw new RangeError('Invalid opening side');
  openingSide(level, 1);
  return {
    ruleVersion: 1, system, level, firstSide,
    players: players.map(fighter), enemies: enemies.map(fighter),
    battleCode: system === 'simple' ? 4 : 0, actions: [], pending: null, outcome: null,
    name: enemies.map(enemy => String(enemy.displayName ?? '').trim()).filter(Boolean).join(' / ').slice(0, 1000),
  };
}

function activeCopy(previous) {
  if (!previous || previous.ruleVersion !== 1 || previous.outcome) throw new RangeError('No active fight');
  return structuredClone(previous);
}

function actors(fight, side, actorIndex, targetIndex) {
  if (!['player', 'enemy'].includes(side)) throw new RangeError('Unknown acting side');
  integer(actorIndex); integer(targetIndex);
  const actor = (side === 'player' ? fight.players : fight.enemies)[actorIndex];
  const target = (side === 'player' ? fight.enemies : fight.players)[targetIndex];
  if (!actor || !target) throw new RangeError('Unknown fighter');
  return {actor, target};
}

export function prepareStrike(previous, options, random = Math.random) {
  const fight = activeCopy(previous);
  if (fight.pending) throw new RangeError('Resolve the pending action first');
  const {side, actorIndex, targetIndex, kind = 'melee', manoeuvre = 'none'} = options;
  const {actor, target} = actors(fight, side, actorIndex, targetIndex);
  if (!['melee', 'shoot', 'throw'].includes(kind) || kind !== 'melee' && manoeuvre !== 'none') throw new RangeError('Invalid attack');
  const requested = integer(options.requested, 1);
  if (side === 'enemy' && manoeuvre !== 'none') throw new RangeError('Follow the printed enemy tactic');
  const strikes = side === 'enemy' ? requested
    : strikeCount(actor.mastery ?? integer(options.mastery, 1), requested, manoeuvre);
  let attack = kind === 'melee' ? actor.attack : actor.shooting ?? integer(options.shooting);
  if (actor.attacks) {
    const index = integer(options.attackIndex);
    if (!actor.attacks[index] || manoeuvre !== 'none') throw new RangeError('Choose a printed attack');
    attack = integer(actor.attacks[index].attack);
  }
  const manoeuvreRolls = manoeuvre === 'none' ? null : {bonus: chance(12, random), penalty: chance(6, random)};
  const values = manoeuvreValues(attack, actor.defence, manoeuvre, manoeuvreRolls ?? {});
  actor.combatDefence = values.defence;
  const attackRoll = fight.system === 'normal' ? chance(6, random) : 0;
  const defenceRoll = fight.system === 'normal' ? chance(6, random) : 0;
  fight.pending = {side, actorIndex, targetIndex, kind, requested, strikes, manoeuvre, manoeuvreRolls,
    attack: values.attack, attackRoll, defence: target.combatDefence ?? target.defence, defenceRoll,
    attackIndex: actor.attacks ? options.attackIndex : null,
    attackValue: values.attack + attackRoll, defenceValue: (target.combatDefence ?? target.defence) + defenceRoll};
  return fight;
}

export function resolveStrike(previous, tableDamage, damageBonus = 0) {
  const fight = activeCopy(previous), pending = fight.pending;
  if (!pending) throw new RangeError('No pending attack');
  const {target} = actors(fight, pending.side, pending.actorIndex, pending.targetIndex);
  const result = fight.system === 'normal'
    ? normalStrike({...pending, tableDamage, damageBonus}) : simpleStrike(tableDamage);
  target.life -= result.damage;
  fight.actions.push({...pending, ...result, kind: 'strike', attackKind: pending.kind, remaining: target.life});
  fight.actions = fight.actions.slice(-120);
  fight.pending = null;
  return fight;
}

export function castMagic(previous, options) {
  const fight = activeCopy(previous);
  if (fight.pending) throw new RangeError('Resolve the pending action first');
  const {actor, target} = actors(fight, options.side, options.actorIndex, options.targetIndex);
  if (target.spellImmune) throw new RangeError('Target is immune to spells');
  const strength = actor.magicStrength ?? integer(options.strength);
  const energy = actor.magicEnergy ?? integer(options.energy);
  const cost = magicCost({strength, energy, requiredStrength: options.requiredStrength, energyCost: options.energyCost});
  const damage = integer(options.damage);
  actor.magicStrength = cost.strength;
  actor.magicEnergy = cost.energy;
  target.life -= damage;
  fight.actions.push({kind: 'magic', side: options.side, actorIndex: options.actorIndex,
    targetIndex: options.targetIndex, damage, remaining: target.life, energy: cost.energy,
    spell: String(options.spell ?? '').trim().slice(0, 200)});
  fight.actions = fight.actions.slice(-120);
  return fight;
}

export function setBattleCode(previous, code) {
  const fight = activeCopy(previous);
  if (fight.pending) throw new RangeError('Resolve the pending action first');
  if (fight.system === 'simple' && code !== 4) throw new RangeError('Simple combat uses battle code four');
  fight.battleCode = integer(code, -LIMIT);
  return fight;
}

export function finishFight(previous, outcome) {
  const fight = activeCopy(previous);
  if (fight.pending || !['win', 'loss', 'escape'].includes(outcome)) throw new RangeError('Invalid outcome');
  if (outcome === 'escape' && fight.enemies.some(enemy => enemy.canEscape === false)) throw new RangeError('Cannot escape');
  fight.outcome = outcome;
  return fight;
}

export function amendFighter(previous, side, actorIndex, values) {
  const fight = activeCopy(previous);
  if (fight.pending || !['player', 'enemy'].includes(side)) throw new RangeError('Cannot amend this action');
  integer(actorIndex);
  const actor = (side === 'player' ? fight.players : fight.enemies)[actorIndex];
  if (!actor || !values || !Object.keys(values).length) throw new RangeError('Missing fighter values');
  const fields = ['attack', 'defence', 'shooting', 'life', 'speed', 'mastery', 'magicStrength', 'magicEnergy', 'magicResistance'];
  for (const [key, value] of Object.entries(values)) {
    if (!fields.includes(key)) throw new RangeError('Unknown fighter value');
    actor[key] = integer(value, key === 'life' ? -LIMIT : 0);
  }
  delete actor.combatDefence;
  fight.actions.push({kind: 'amend', side, actorIndex, values: {...values}});
  fight.actions = fight.actions.slice(-120);
  return fight;
}
