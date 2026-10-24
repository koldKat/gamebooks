// Shared DestinyQuest combat sequence. Book abilities and encounter exceptions
// are applied between these explicit stages, rather than hidden inside a roll.
import { destinyStat, destinyDamageScore, destinyOnHeroHit, destinyPassiveEffects,
  destinyPassiveProtection, hasDestinyAbility, healDestinyHero, recordDestinyDefeat, destinyStrike, observeDestinyHealth, destinyRollOpponentDice, addDestinyStatEffect,
  isDestinyOpponentActive, isDestinyOpponentDead, destinyDamageAllowed, destinyAttackerTarget, reflectDestinyDamage } from './effects.js';
import { applyDestinyRoundEvents } from './round-events.js';
import { queueDestinyEncounterEvent, prepareDestinyEndEvents } from './encounter-events.js';
import { onDestinyHeroSpeedRoll } from './roll-events.js';
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
  if (enemy && input.role === 'indestructible') {
    if (!['brawn', 'magic'].includes(input.damageStat) || input.health !== null || input.armour !== null) throw new RangeError('Invalid indestructible component');
    const result = { name: String(input.name || 'Component'), role: 'indestructible', speed: integer(input.speed, 'component speed'),
      brawn: input.brawn === undefined ? 0 : integer(input.brawn, 'component brawn'),
      magic: input.magic === undefined ? 0 : integer(input.magic, 'component magic'),
      armour: null, health: null, maxHealth: null, damageStat: input.damageStat };
    result.normal = Object.fromEntries(attributes.map(attribute => [attribute, result[attribute]]));
    return result;
  }
  if (enemy && input.role === 'resource') return { name: String(input.name || 'Component'), role: 'resource',
    speed: null, brawn: null, magic: null, damageStat: null, armour: integer(input.armour, 'component armour'),
    health: integer(input.health, 'component health', 1), maxHealth: integer(input.health, 'component health', 1),
    normal: { speed: null, brawn: null, magic: null, armour: input.armour } };
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
  if (fight.hero.health <= 0 || fight.encounter?.forcedLoss) fight.status = 'loss';
  else if (fight.phase === 'ability-rolled' && fight.turn?.pendingAbility?.type === 'encounter') return false;
  else if (fight.encounter?.forcedVictory || (fight.encounter?.victoryTargets || fight.opponents.map((_, index) => index))
    .every(index => !isDestinyOpponentActive(fight, index) || fight.opponents[index].health <= (fight.encounter?.fleeAtHealth?.[index] || 0))) fight.status = 'win';
  if (fight.status !== 'active') {
    fight.phase = 'finished';
    if (fight.status === 'win' && fight.encounter?.defeatRemainingOnVictory) fight.opponents.forEach((opponent, target) => {
      if (isDestinyOpponentActive(fight, target)) {
        opponent.health = 0;
        recordDestinyDefeat(fight, target);
      }
    });
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
  if (!isDestinyOpponentActive(next, target)) throw new RangeError('Choose a living opponent');
  if (next.encounter?.unselectableTargets?.includes(target)) throw new RangeError('Choose the exposed combat component');
  if (next.encounter?.restrictProtectedTargets && !destinyDamageAllowed(next, target)) throw new RangeError('Defeat the protected opponent\'s guards first');
  next.round++;
  next.target = target;
  next.phase = 'speed';
  next.turn = {
    used: { sp: false, co: false, dm: false, backpack: false },
    deaths: [], deathMoveDeathsSeen: 0, heroSpeedDice: null, opponentSpeedDice: null,
    winner: null, damageDice: null, damageScore: null,
  };
  if (next.autoWinRound === next.round) next.turn.autoWin = true;
  if (next.encounter?.automaticHitTargets?.includes(target)) next.turn.autoWin = true;
  if (next.encounter?.automaticHitsRemaining > 0) next.turn.autoWin = true;
  applyDestinyRoundEvents(next, options, roll);
  for (const event of next.encounter?.startTests || []) {
    if (event.every && next.round % event.every !== 0) continue;
    if (event.maxHealth !== undefined && next.opponents[event.target || 0].health > event.maxHealth) continue;
    queueDestinyEncounterEvent(next, event, 'speed', roll);
  }
  settleDestinyFight(next);
  return next;
}

export function rollDestinySpeed(fight, roll = randomDie) {
  const next = stage(fight, ['speed']);
  if (!isDestinyOpponentActive(next, next.target)) throw new RangeError('Choose a living opponent');
  if (next.turn.autoWin) {
    next.turn.heroSpeedDice = [];
    next.turn.opponentSpeedDice = [];
    next.phase = 'speed-rolled';
    return next;
  }
  const savedHero = next.savedHeroDie?.round === next.round;
  next.turn.heroSpeedDice = savedHero ? [next.savedHeroDie.value, ...dice(roll, (next.turn.heroSpeedCount || 2) - 1)] : dice(roll, next.turn.heroSpeedCount || 2);
  if (savedHero) next.turn.lockedHeroDice = [0];
  const attacker = destinyAttackerTarget(next);
  const controlled = next.turn.controlledOpponent === undefined || next.turn.controlledOpponent === attacker;
  const savedOpponent = next.savedOpponentDice?.round === next.round && next.savedOpponentDice.target === attacker;
  next.turn.opponentSpeedDice = savedOpponent ? [...next.savedOpponentDice.dice] : destinyRollOpponentDice(next, controlled ? next.turn.opponentSpeedCount || 2 : 2, roll, 'speed');
  if (savedOpponent) next.turn.lockedOpponentDice = true;
  next.phase = 'speed-rolled';
  onDestinyHeroSpeedRoll(next, next.turn.heroSpeedDice.map((_, index) => index).filter(index => !savedHero || index !== 0), roll);
  if (!isDestinyOpponentActive(next, next.target) && next.phase !== 'ability-rolled') next.phase = 'end';
  settleDestinyFight(next);
  return next;
}

export function retargetDestinyRound(fight, target) {
  const next = stage(fight, ['speed']);
  integer(target, 'target');
  if (!isDestinyOpponentActive(next, target)) throw new RangeError('Choose a living opponent');
  if (next.encounter?.unselectableTargets?.includes(target)) throw new RangeError('Choose the exposed combat component');
  if (next.encounter?.restrictProtectedTargets && !destinyDamageAllowed(next, target)) throw new RangeError('Defeat the protected opponent\'s guards first');
  next.target = target;
  next.turn.autoWin = next.autoWinRound === next.round || Boolean(next.encounter?.automaticHitTargets?.includes(target)) || next.encounter?.automaticHitsRemaining > 0;
  return next;
}

export function resolveDestinySpeed(fight, roll = randomDie) {
  const next = stage(fight, ['speed-rolled']);
  const hero = sum(next.turn.heroSpeedDice) + destinyStat(next, 'hero', 'speed');
  const opponent = sum(next.turn.opponentSpeedDice) + destinyStat(next, destinyAttackerTarget(next), 'speed');
  next.turn.winner = next.turn.forcedOpponentWin ? 'opponent' : next.turn.autoWin ? 'hero' : hero === opponent ? 'standoff' : hero > opponent ? 'hero' : 'opponent';
  if (next.turn.winner === 'hero' && !next.turn.autoWin && next.encounter?.automaticHitsAfterWin) next.encounter.automaticHitsRemaining = next.encounter.automaticHitsAfterWin;
  next.phase = next.turn.winner === 'standoff' ? 'end' : 'damage';
  next.history.push({ type: 'speed', round: next.round, target: next.target,
    heroDice: [...next.turn.heroSpeedDice], opponentDice: [...next.turn.opponentSpeedDice],
    hero, opponent, winner: next.turn.winner });
  if (next.encounter?.heroDamageWithoutSpeedAbility && !next.turn.playedSpeedAbility) {
    const damage = Math.min(next.hero.health, next.encounter.heroDamageWithoutSpeedAbility);
    next.hero.health -= damage;
    next.history.push({ type: 'encounter-damage', name: 'Head rush', round: next.round, damage });
    if (settleDestinyFight(next)) return next;
  }
  const event = next.turn.winner === 'hero' ? next.encounter?.heroWinTest : next.turn.winner === 'opponent' ? next.encounter?.enemyWinTest : null;
  if (event) queueDestinyEncounterEvent(next, event, 'damage', roll);
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
  const count = (next.turn.winner === 'opponent' ? next.encounter?.damageDiceByTarget?.[destinyAttackerTarget(next)] || 1 : 1) + extra + (next.turn.winner === 'opponent' && next.turn.reckless ? 1 : 0);
  next.turn.damageDice = next.turn.winner === 'hero' ? dice(roll, count) : destinyRollOpponentDice(next, count, roll, 'damage');
  if (next.turn.winner === 'opponent') {
    const attacker = destinyAttackerTarget(next);
    if (hasDestinyAbility(next, 'brittle-edge') && isDestinyOpponentActive(next, attacker)) destinyStrike(next, attacker, 2, 'brittle-edge', 'passive');
  }
  if (next.turn.winner === 'opponent' && hasDestinyAbility(next, 'siphon')) {
    next.turn.damageDice = next.turn.damageDice.map(face => face === 6 ? 1 : face);
  }
  next.phase = 'damage-rolled';
  if (!isDestinyOpponentActive(next, next.target)) next.phase = 'end';
  settleDestinyFight(next);
  return next;
}

export function resolveDestinyDamage(fight, roll = randomDie) {
  const next = stage(fight, ['damage-rolled']);
  const heroWon = next.turn.winner === 'hero';
  const attacker = destinyAttackerTarget(next);
  const defender = heroWon ? next.opponents[next.target] : next.hero;
  const score = destinyDamageScore(next);
  if (heroWon) {
    const sixes = next.turn.damageDice.filter(face => face === 6).length;
    for (const effect of next.effects) if (effect.source === 'creeping-cold') effect.amount += sixes;
  }
  let armour = destinyStat(next, heroWon ? next.target : 'hero', 'armour');
  if (next.turn.ignoreArmour) armour = 0;
  // Fatal blow ignores half the armour, rounding the ignored half UP.
  else if (next.turn.halfArmour) armour -= Math.ceil(armour / 2);
  const damage = next.turn.avoidDamage || heroWon && !destinyDamageAllowed(next, next.target) ? 0 : Math.max(0, score - armour);
  const healthLost = Math.min(defender.health, damage);
  if (heroWon) reflectDestinyDamage(next, next.target, healthLost, 'score');
  defender.health -= healthLost;
  if (heroWon && isDestinyOpponentDead(next, next.target)) recordDestinyDefeat(next, next.target);
  next.turn.damageScore = score;
  next.turn.healthDamage = healthLost;
  next.history.push({ type: 'damage', round: next.round, target: next.target,
    attacker: next.turn.winner, dice: [...next.turn.damageDice], score, armour, damage: healthLost });
  if (heroWon) destinyOnHeroHit(next, next.target, healthLost);
  else if (healthLost && hasDestinyAbility(next, 'lightning')) {
    if (isDestinyOpponentActive(next, attacker)) destinyStrike(next, attacker, 2, 'lightning', 'passive');
  }
  if (heroWon && healthLost) {
    next.turn.lastHeroDamage = { [next.target]: healthLost };
    if (next.turn.used.co) next.turn.combatAbilityDamage = true;
    for (const change of next.encounter?.onHeroScoreHealthHit || []) {
      addDestinyStatEffect(next, change.target, change.attribute, change.amount ?? 0, change.duration, 'encounter-hit', change.delay || 0);
      if (change.set !== undefined) next.effects[next.effects.length - 1].set = change.set;
    }
  }
  if (!settleDestinyFight(next)) {
    if (heroWon && isDestinyOpponentDead(next, next.target)) {
      next.turn.deaths.push(next.target);
      next.phase = next.turn.pendingPassiveDeath ? 'end' : 'death-move';
      if (next.phase === 'death-move') next.turn.afterDeathMove = 'end';
    } else next.phase = 'end';
    if (!heroWon && next.crystalArmour && !next.turn.avoidDamage) {
      next.turn.pendingAbility = { type: 'test', name: 'crystal-armour', dice: dice(roll, 1), returnPhase: next.phase };
      next.phase = 'ability-rolled';
    }
    if (!heroWon && healthLost) {
      for (const change of next.encounter?.onEnemyScoreHealthHit || []) {
        if (change.attacker !== undefined && change.attacker !== attacker) continue;
        addDestinyStatEffect(next, change.target, change.attribute, change.amount, change.duration, 'encounter-hit', change.delay || 0);
      }
      if (next.encounter?.heroStatusOnHit) (next.encounter.heroStatuses ??= {})[next.encounter.heroStatusOnHit.name] = next.encounter.heroStatusOnHit.amount;
      if (next.encounter?.growingStatusOnHit && !next.encounter.growingStatus) next.encounter.growingStatus = { ...next.encounter.growingStatusOnHit, from: next.round };
      if (next.encounter?.blockCategoriesOnHit) next.encounter.blockedRounds = {
        from: next.round + 1, until: next.round + 1, categories: [...next.encounter.blockCategoriesOnHit],
      };
      if (next.encounter?.healthDamageTest && !next.encounter.heroStatuses?.venom) queueDestinyEncounterEvent(next, next.encounter.healthDamageTest, 'end', roll);
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
  if (prepareDestinyEndEvents(next, roll)) return next;
  const alive = next.opponents.map((opponent, target) => isDestinyOpponentActive(next, target));
  const pending = new Map();
  for (const effect of [...destinyPassiveEffects(next, roll), ...(next.turn.encounterEndEffects || []), ...effects]) {
    const target = effect?.target;
    if (target !== 'hero' && (!Number.isInteger(target) || target < 0 || !next.opponents[target])) {
      throw new RangeError('Invalid effect target');
    }
    const amount = integer(effect.amount, 'passive damage');
    if (target !== 'hero' && (!alive[target] || !destinyDamageAllowed(next, target, 'passive'))) continue;
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
    if (target !== 'hero' && isDestinyOpponentDead(next, target)) {
      recordDestinyDefeat(next, target);
      next.turn.deaths.push(target);
    }
  }
  const healing = next.effects.filter(effect => effect.kind === 'end-heal' &&
    effect.from <= next.round && effect.until >= next.round).reduce((total, effect) => total + effect.amount, 0);
  if (healing || next.turn.encounterEndHealing) healDestinyHero(next, healing + (next.turn.encounterEndHealing || 0));
  for (const effect of next.turn.encounterEndOpponentHealing || []) {
    if (isDestinyOpponentActive(next, effect.target)) next.opponents[effect.target].health = Math.min(next.opponents[effect.target].maxHealth, next.opponents[effect.target].health + effect.amount);
  }
  for (const effect of next.encounter?.regeneration || []) {
    const opponent = next.opponents[effect.target];
    if (isDestinyOpponentActive(next, effect.target) && !effect.requiresAlive?.some(target => !isDestinyOpponentActive(next, target))) {
      opponent.health = Math.min(effect.uncapped ? Number.MAX_SAFE_INTEGER : opponent.maxHealth, opponent.health + effect.amount);
    }
  }
  for (const effect of next.encounter?.endArmourGrowth || []) {
    const opponent = next.opponents[effect.target];
    if (isDestinyOpponentActive(next, effect.target) && opponent.armour < effect.maximum) opponent.armour = Math.min(effect.maximum, opponent.armour + effect.amount);
  }
  for (const effect of next.encounter?.endStats || []) {
    if (effect.round !== undefined && effect.round !== next.round || effect.requiresAlive?.some(target => !isDestinyOpponentActive(next, target))) continue;
    for (const [attribute, amount] of Object.entries(effect.changes)) addDestinyStatEffect(next, effect.target, attribute, amount, null, 'encounter-end');
  }
  if (next.encounter?.lossAfterRound && next.round >= next.encounter.lossAfterRound && next.opponents.some(opponent => opponent.health > 0)) next.encounter.forcedLoss = true;
  if (next.encounter?.automaticHitsRemaining > 0) next.encounter.automaticHitsRemaining--;
  if (!settleDestinyFight(next)) {
    if (next.turn.deaths.length > next.turn.deathMoveDeathsSeen && !next.turn.used.dm) {
      next.phase = 'death-move';
      next.turn.afterDeathMove = 'start';
    } else next.phase = 'start';
  }
  return next;
}
