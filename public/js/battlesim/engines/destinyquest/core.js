// Shared DestinyQuest combat sequence. Book abilities and encounter exceptions
// are applied between these explicit stages, rather than hidden inside a roll.
import { destinyStat, destinyDamageScore, destinyOnHeroHit, destinyPassiveEffects,
  destinyPassiveProtection, hasDestinyAbility, healDestinyHero, recordDestinyDefeat, destinyOnOpponentRoll, destinyStrike, observeDestinyHealth } from './effects.js';
import { applyDestinyRoundEvents } from './round-events.js';
const attributes = ['speed', 'brawn', 'magic', 'armour'];
const clone = value => structuredClone(value);

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || value > 1000000) {
    throw new RangeError(`Invalid ${label}`);
  }
  return value;
}

function actor(input, enemy = false) {
  if (!input || typeof input !== 'object') throw new RangeError('Missing combatant');
  const result = { name: String(input.name || (enemy ? 'Opponent' : 'Hero')) };
  for (const key of attributes) result[key] = integer(input[key] ?? 0, key);
  result.health = integer(input.health, 'health', 1);
  result.maxHealth = integer(input.maxHealth ?? input.health, 'maximum health', 1);
  if (result.health > result.maxHealth) throw new RangeError('Health exceeds maximum');
  result.normal = {};
  for (const key of attributes) result.normal[key] = integer(input.normal?.[key] ?? result[key], key);
  if (enemy) {
    if (input.damageStat !== undefined && !['brawn', 'magic'].includes(input.damageStat)) {
      throw new RangeError('Invalid opponent damage attribute');
    }
    if (result.brawn && result.magic && !input.damageStat) {
      throw new RangeError('Choose the opponent damage attribute explicitly');
    }
    result.damageStat = input.damageStat ?? (result.magic ? 'magic' : 'brawn');
  }
  return result;
}

// Keep the random source injectable, including invalid-roll rejection, without
// retaining functions in the serializable saved fight.
function dice(roll, count) {
  return Array.from({ length: count }, () => {
    const value = roll();
    if (!Number.isInteger(value) || value < 1 || value > 6) throw new RangeError('A die must roll 1-6');
    return value;
  });
}
const randomDie = () => Math.floor(Math.random() * 6) + 1;
const sum = values => values.reduce((total, value) => total + value, 0);

function stage(fight, expected) {
  if (fight?.rulesVersion !== 1 || fight.status !== 'active' || !expected.includes(fight.phase)) {
    throw new RangeError('Action unavailable at this combat stage');
  }
  return clone(fight);
}

export function settleDestinyFight(fight) {
  observeDestinyHealth(fight);
  if (fight.hero.health <= 0) fight.status = 'loss';
  else if (fight.opponents.every(opponent => opponent.health <= 0)) fight.status = 'win';
  if (fight.status !== 'active') {
    fight.phase = 'finished';
    if (fight.status === 'win' && fight.restoreOnVictory) {
      fight.hero.health = fight.hero.maxHealth;
      Object.assign(fight.hero, fight.hero.normal);
    }
    fight.history.push({ type: 'outcome', round: fight.round, status: fight.status });
    return true;
  }
  return false;
}

export function createDestinyFight(hero, opponents, { restoreOnVictory = true } = {}) {
  if (!Array.isArray(opponents) || !opponents.length || opponents.length > 100) {
    throw new RangeError('Choose 1-100 opponents');
  }
  if (typeof restoreOnVictory !== 'boolean') throw new RangeError('Invalid recovery rule');
  return {
    rulesVersion: 1, status: 'active', phase: 'start', round: 0,
    hero: actor(hero), opponents: opponents.map(value => actor(value, true)),
    restoreOnVictory, target: null, turn: null, history: [],
    used: {}, effects: [],
  };
}

export function startDestinyRound(fight, target, roll = randomDie, options = {}) {
  const next = stage(fight, ['start']);
  integer(target, 'target');
  if (!next.opponents[target] || next.opponents[target].health <= 0) throw new RangeError('Choose a living opponent');
  next.round++;
  next.target = target;
  next.phase = 'speed';
  next.turn = {
    used: { sp: false, co: false, dm: false, backpack: false },
    deaths: [], deathMoveDeathsSeen: 0, heroSpeedDice: null, opponentSpeedDice: null,
    winner: null, damageDice: null, damageScore: null,
  };
  if (next.autoWinRound === next.round) next.turn.autoWin = true;
  applyDestinyRoundEvents(next, options, roll);
  settleDestinyFight(next);
  return next;
}

export function rollDestinySpeed(fight, roll = randomDie) {
  const next = stage(fight, ['speed']);
  if (next.opponents[next.target].health <= 0) throw new RangeError('Choose a living opponent');
  if (next.turn.autoWin) {
    next.turn.heroSpeedDice = [];
    next.turn.opponentSpeedDice = [];
    next.phase = 'speed-rolled';
    return next;
  }
  const savedHero = next.savedHeroDie?.round === next.round;
  next.turn.heroSpeedDice = savedHero ? [next.savedHeroDie.value, ...dice(roll, (next.turn.heroSpeedCount || 2) - 1)] : dice(roll, next.turn.heroSpeedCount || 2);
  if (savedHero) next.turn.lockedHeroDice = [0];
  const controlled = next.turn.controlledOpponent === undefined || next.turn.controlledOpponent === next.target;
  const savedOpponent = next.savedOpponentDice?.round === next.round && next.savedOpponentDice.target === next.target;
  next.turn.opponentSpeedDice = savedOpponent ? [...next.savedOpponentDice.dice] : dice(roll, controlled ? next.turn.opponentSpeedCount || 2 : 2);
  if (savedOpponent) next.turn.lockedOpponentDice = true;
  else destinyOnOpponentRoll(next, next.turn.opponentSpeedDice, 'speed');
  next.phase = 'speed-rolled';
  if (next.opponents[next.target].health === 0) next.phase = 'end';
  settleDestinyFight(next);
  return next;
}

export function retargetDestinyRound(fight, target) {
  const next = stage(fight, ['speed']);
  integer(target, 'target');
  if (!next.opponents[target] || next.opponents[target].health <= 0) throw new RangeError('Choose a living opponent');
  next.target = target;
  return next;
}

export function resolveDestinySpeed(fight) {
  const next = stage(fight, ['speed-rolled']);
  const hero = sum(next.turn.heroSpeedDice) + destinyStat(next, 'hero', 'speed');
  const opponent = sum(next.turn.opponentSpeedDice) + destinyStat(next, next.target, 'speed');
  next.turn.winner = next.turn.autoWin ? 'hero' : hero === opponent ? 'standoff' : hero > opponent ? 'hero' : 'opponent';
  next.phase = next.turn.winner === 'standoff' ? 'end' : 'damage';
  next.history.push({ type: 'speed', round: next.round, target: next.target,
    heroDice: [...next.turn.heroSpeedDice], opponentDice: [...next.turn.opponentSpeedDice],
    hero, opponent, winner: next.turn.winner });
  return next;
}

export function rollDestinyDamage(fight, roll = randomDie, { soundCharge = true } = {}) {
  const next = stage(fight, ['damage']);
  if (typeof soundCharge !== 'boolean') throw new RangeError('Choose whether to use the charge damage bonus');
  if (soundCharge && next.turn.winner === 'hero' && next.turn.soundCharge && !next.turn.used.co) {
    next.turn.extraDamageDice = (next.turn.extraDamageDice || 0) + 1;
    next.turn.used.co = true;
    if (hasDestinyAbility(next, 'weaver')) healDestinyHero(next, 2);
  }
  const extra = next.turn.extraDamageDice || 0;
  next.turn.damageDice = dice(roll, 1 + extra +
    (next.turn.winner === 'opponent' && next.turn.reckless ? 1 : 0));
  if (next.turn.winner === 'opponent') {
    destinyOnOpponentRoll(next, next.turn.damageDice, 'damage');
    if (hasDestinyAbility(next, 'brittle-edge') && next.opponents[next.target].health > 0) destinyStrike(next, next.target, 2, 'brittle-edge', 'passive');
  }
  if (next.turn.winner === 'opponent' && hasDestinyAbility(next, 'siphon')) {
    next.turn.damageDice = next.turn.damageDice.map(face => face === 6 ? 1 : face);
  }
  next.phase = 'damage-rolled';
  if (next.opponents[next.target].health === 0) next.phase = 'end';
  settleDestinyFight(next);
  return next;
}

export function resolveDestinyDamage(fight, roll = randomDie) {
  const next = stage(fight, ['damage-rolled']);
  const heroWon = next.turn.winner === 'hero';
  const enemy = next.opponents[next.target];
  const defender = heroWon ? enemy : next.hero;
  const score = destinyDamageScore(next);
  if (heroWon) {
    const sixes = next.turn.damageDice.filter(face => face === 6).length;
    for (const effect of next.effects) if (effect.source === 'creeping-cold') effect.amount += sixes;
  }
  let armour = destinyStat(next, heroWon ? next.target : 'hero', 'armour');
  if (next.turn.ignoreArmour) armour = 0;
  // Fatal blow ignores half the armour, rounding the ignored half UP.
  else if (next.turn.halfArmour) armour -= Math.ceil(armour / 2);
  const damage = next.turn.avoidDamage ? 0 : Math.max(0, score - armour);
  const healthLost = Math.min(defender.health, damage);
  defender.health -= healthLost;
  if (heroWon && defender.health === 0) recordDestinyDefeat(next, next.target);
  next.turn.damageScore = score;
  next.turn.healthDamage = healthLost;
  next.history.push({ type: 'damage', round: next.round, target: next.target,
    attacker: next.turn.winner, dice: [...next.turn.damageDice], score, armour, damage: healthLost });
  if (heroWon) destinyOnHeroHit(next, next.target, healthLost);
  else if (healthLost && hasDestinyAbility(next, 'lightning')) {
    enemy.health = Math.max(0, enemy.health - 2);
    if (enemy.health === 0) {
      recordDestinyDefeat(next, next.target);
      next.turn.deaths.push(next.target);
      next.turn.pendingPassiveDeath = true;
    }
  }
  if (heroWon && healthLost) {
    next.turn.lastHeroDamage = { [next.target]: healthLost };
    if (next.turn.used.co) next.turn.combatAbilityDamage = true;
  }
  if (!settleDestinyFight(next)) {
    if (heroWon && defender.health === 0) {
      next.turn.deaths.push(next.target);
      next.phase = next.turn.pendingPassiveDeath ? 'end' : 'death-move';
      if (next.phase === 'death-move') next.turn.afterDeathMove = 'end';
    } else next.phase = 'end';
    if (!heroWon && next.crystalArmour && !next.turn.avoidDamage) {
      next.turn.pendingAbility = { type: 'test', name: 'crystal-armour', dice: dice(roll, 1), returnPhase: next.phase };
      next.phase = 'ability-rolled';
    }
  }
  return next;
}

export function skipDestinyDeathMove(fight) {
  const next = stage(fight, ['death-move']);
  next.turn.deathMoveDeathsSeen = next.turn.deaths.length;
  next.phase = next.turn.afterDeathMove;
  return next;
}

// All end-of-round effects are evaluated from the same living-combatant
// snapshot. A death in the first effect must not suppress another due effect.
// Ability/encounter modules supply the applicable effects for this round.
export function endDestinyRound(fight, effects = [], roll = randomDie) {
  const next = stage(fight, ['end']);
  if (!Array.isArray(effects)) throw new RangeError('Invalid end-of-round effects');
  const alive = next.opponents.map(opponent => opponent.health > 0);
  const pending = new Map();
  for (const effect of [...destinyPassiveEffects(next, roll), ...effects]) {
    const target = effect?.target;
    if (target !== 'hero' && (!Number.isInteger(target) || target < 0 || !next.opponents[target])) {
      throw new RangeError('Invalid effect target');
    }
    const amount = integer(effect.amount, 'passive damage');
    if (target !== 'hero' && !alive[target]) continue;
    const defender = target === 'hero' ? next.hero : next.opponents[target];
    if (typeof effect.ignoreArmour !== 'boolean') throw new RangeError('Specify passive armour handling');
    let damage = Math.max(0, amount - (effect.ignoreArmour ? 0 : destinyStat(next, target, 'armour')));
    if (target === 'hero') damage = destinyPassiveProtection(next, damage);
    pending.set(target, (pending.get(target) || 0) + damage);
    next.history.push({ type: 'passive', round: next.round, target, damage, source: String(effect.source || '') });
  }
  for (const [target, damage] of pending) {
    const defender = target === 'hero' ? next.hero : next.opponents[target];
    let applied = damage;
    if (target === 'hero' && next.phantomHealth > 0) {
      const absorbed = Math.min(next.phantomHealth, applied);
      next.phantomHealth -= absorbed;
      applied -= absorbed;
    }
    const actual = Math.min(defender.health, applied);
    next.turn.passiveDamageByTarget ??= {};
    next.turn.passiveDamageByTarget[target] = actual;
    defender.health = Math.max(0, defender.health - applied);
    if (target !== 'hero' && defender.health === 0) {
      recordDestinyDefeat(next, target);
      next.turn.deaths.push(target);
    }
  }
  const healing = next.effects.filter(effect => effect.kind === 'end-heal' &&
    effect.from <= next.round && effect.until >= next.round).reduce((total, effect) => total + effect.amount, 0);
  if (healing) healDestinyHero(next, healing);
  if (!settleDestinyFight(next)) {
    if (next.turn.deaths.length > next.turn.deathMoveDeathsSeen && !next.turn.used.dm) {
      next.phase = 'death-move';
      next.turn.afterDeathMove = 'start';
    } else next.phase = 'start';
  }
  return next;
}
