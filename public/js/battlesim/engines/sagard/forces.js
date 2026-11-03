// Resolve force volleys with optional duels or persistent individual combat exchanges.
import {startSagardFight, validateSagardFight, resolveSagardTurn, sagardTurn, validateSagardRules, fleeSagardFight} from './core.js';
const clone = value => structuredClone(value);
const count = (value, min = 0) => {
  if (value === '' || value == null || !Number.isSafeInteger(Number(value)) || value < min || value > 1000) {
    throw new RangeError('Enter a valid force count');
  }
  return Number(value);
};
const log = (fight, entry) => {
  fight.log.push({...entry, round: fight.round});
  if (fight.log.length > 500) fight.log.splice(0, fight.log.length - 500);
  fight.turnSerial++;
};
const duelSpec = encounter => ({...clone(encounter.forces.duelEncounter),
  ...Object.fromEntries(['printedHero', 'heroLevelPenalty', 'heroArmorDisabled', 'heroWeaponDisabled']
    .filter(key => Object.hasOwn(encounter, key)).map(key => [key, clone(encounter[key])])),
  name: encounter.name + ': individual duel',
  escape: 'none', restartOnLoss: true});
const persistentDuel = encounter => encounter.forces.duelMode === 'round';
const alliedCount = fight => fight.alliesRemaining + (fight.monkeys?.remaining ?? 0);

export function validateSagardForcesEncounter(encounter) {
  const spec = encounter?.forces;
  if (!spec || !spec.duelEncounter) throw new RangeError('Missing group combat rules');
  count(spec.allies); count(spec.enemies, 1);
  for (const key of ['enemyKillFaces', 'allyKillFaces']) {
    const faces = spec[key];
    if (!Array.isArray(faces) || !faces.length || new Set(faces).size !== faces.length
        || faces.some(face => !Number.isInteger(face) || face < 1 || face > 4)) throw new RangeError('Invalid force casualty faces');
  }
  if (spec.minimumAlliesForWin != null) count(spec.minimumAlliesForWin);
  if (spec.initiative != null && !['hero', 'enemy'].includes(spec.initiative)) throw new RangeError('Invalid force initiative');
  if (spec.duelTiming != null && !['before', 'after'].includes(spec.duelTiming)) throw new RangeError('Invalid duel timing');
  if (spec.duelsPerRound != null && ![1, 'unlimited'].includes(spec.duelsPerRound)) throw new RangeError('Invalid duel limit');
  if (spec.lossOnAlliesKilled != null && typeof spec.lossOnAlliesKilled !== 'boolean') throw new RangeError('Invalid force defeat rule');
  if (spec.escapeOnlyWithoutAllies != null && typeof spec.escapeOnlyWithoutAllies !== 'boolean') throw new RangeError('Invalid force escape rule');
  if (spec.duelMode != null && !['full', 'round'].includes(spec.duelMode)) throw new RangeError('Invalid individual combat mode');
  if (spec.duelMode === 'round' && spec.duelTiming !== 'after') throw new RangeError('Individual exchanges follow force volleys');
  if (spec.enemyDiesOnSuccessfulKill != null && typeof spec.enemyDiesOnSuccessfulKill !== 'boolean') throw new RangeError('Invalid force attrition rule');
  return encounter;
}

export function startSagardForces(hero, encounter, rules, options = {}) {
  validateSagardRules(rules); validateSagardForcesEncounter(encounter);
  encounter = clone(encounter);
  if (options.opponents?.length) encounter.forces.duelEncounter.opponents = [clone(options.opponents[0])];
  const seed = startSagardFight(hero, duelSpec(encounter), rules, {...options, opponents: undefined});
  const fight = {kind: 'forces', rulesVersion: 1, encounter: clone(encounter), rules: clone(rules),
    hero: seed.hero, healing: seed.healing, ...(seed.stunStone ? {stunStone: seed.stunStone} : {}), alliesRemaining: count(options.alliesRemaining ?? encounter.forces.allies),
    ...(seed.ammo ? {ammo: clone(seed.ammo), dahliaOil: seed.dahliaOil} : {}),
    ...(Object.hasOwn(seed, 'magicDaggerPower') ? {magicDaggerPower: seed.magicDaggerPower} : {}),
    ...(Object.hasOwn(seed, 'saltBags') ? {saltBags: seed.saltBags} : {}),
    enemiesRemaining: count(options.enemiesRemaining ?? encounter.forces.enemies, 1), status: 'fighting',
    round: 1, phase: 'chooseDuel', cursor: 0, turnSerial: 0, log: [], duel: null, duelsThisRound: 0};
  if (rules.tehniteWeapons) {
    fight.tehniteWeapons = Boolean(options.tehniteWeapons);
    if (fight.tehniteWeapons) fight.encounter.forces.allyKillFaces = clone(rules.tehniteWeapons.allyKillFaces);
  }
  if (rules.monkeyWhistle) fight.monkeys = {held: Boolean(options.monkeyWhistle), calledRound: null, arrived: false, remaining: 0};
  if (encounter.forces.lossOnAlliesKilled && !fight.alliesRemaining) throw new RangeError('Enter a surviving allied force');
  if (persistentDuel(encounter)) fight.duel = seed;
  if (encounter.forces.duelTiming === 'after') beginVolleys(fight);
  return validateSagardForcesFight(fight);
}

export function validateSagardForcesFight(fight) {
  if (fight?.kind !== 'forces' || fight.rulesVersion !== 1
      || !['fighting', 'win', 'loss', 'fled', 'cancelled'].includes(fight.status)
      || !['chooseDuel', 'duel', 'enemyVolley', 'allyVolley', 'monkeyVolley'].includes(fight.phase)
      || !Array.isArray(fight.log) || fight.log.length > 500
      || !Number.isSafeInteger(fight.round) || fight.round < 1
      || !Number.isSafeInteger(fight.turnSerial) || fight.turnSerial < 0) throw new RangeError('Invalid saved force battle');
  validateSagardRules(fight.rules); validateSagardForcesEncounter(fight.encounter);
  if (fight.monkeys) {
    const m = fight.monkeys, rule = fight.rules.monkeyWhistle;
    if (!rule || typeof m.held !== 'boolean' || typeof m.arrived !== 'boolean'
        || !Number.isInteger(m.remaining) || m.remaining < 0 || m.remaining > rule.count
        || (m.calledRound !== null && (!Number.isInteger(m.calledRound) || m.calledRound < 1 || m.calledRound > fight.round || m.held))
        || (m.arrived && (m.calledRound === null || fight.round < m.calledRound + rule.delayRounds))
        || (!m.arrived && m.remaining)) throw new RangeError('Invalid monkey reinforcements');
  }
  if (fight.rules.magicDagger && (!Number.isSafeInteger(fight.magicDaggerPower) || fight.magicDaggerPower < 0
      || fight.magicDaggerPower > fight.rules.magicDagger.maximumPower)) throw new RangeError('Invalid group dagger power');
  if (fight.rules.projectiles) {
    if (!fight.ammo || typeof fight.dahliaOil !== 'boolean') throw new RangeError('Invalid group ammunition');
    for (const rule of fight.rules.projectiles) {
      if (!Number.isSafeInteger(fight.ammo[rule.id]) || fight.ammo[rule.id] < 0 || fight.ammo[rule.id] > rule.maxHeld) {
        throw new RangeError('Invalid group ammunition');
      }
    }
  }
  count(fight.alliesRemaining); count(fight.enemiesRemaining); count(fight.cursor);
  count(fight.duelsThisRound ?? 0);
  if (fight.escapeAttemptedRound != null && (!Number.isInteger(fight.escapeAttemptedRound)
      || fight.escapeAttemptedRound < 1 || fight.escapeAttemptedRound > fight.round)) throw new RangeError('Invalid force escape attempt');
  if (!fight.hero || !Number.isInteger(fight.hero.hp) || fight.hero.hp < 0
      || fight.hero.hp > fight.rules.maxHeroHp || typeof fight.healing?.fang !== 'boolean'
      || typeof fight.healing?.moss !== 'boolean') throw new RangeError('Invalid group hero');
  if (fight.phase === 'duel' || persistentDuel(fight.encounter)) {
    validateSagardFight(fight.duel);
    if (fight.status === 'fighting' && fight.duel.status !== 'fighting') throw new RangeError('Unresolved individual duel');
  }
  if (persistentDuel(fight.encounter) && fight.phase === 'chooseDuel') throw new RangeError('Missing mandatory individual exchange');
  if (fight.status === 'fighting' && ((!fight.hero.hp && fight.duel?.phase !== 'recovery')
      || (!fight.enemiesRemaining && !persistentDuel(fight.encounter)))) throw new RangeError('Unresolved group outcome');
  if (['enemyVolley', 'allyVolley', 'monkeyVolley'].includes(fight.phase)) {
    count(fight.shots, 1);
    if (fight.cursor >= fight.shots && fight.status === 'fighting') throw new RangeError('Invalid group volley');
  }
  return fight;
}

function outcome(fight) {
  if (fight.hero.hp === 0) {fight.status = 'loss'; fight.destination = fight.encounter.lossTarget ?? '1';}
  else if (persistentDuel(fight.encounter)) {
    if (fight.duel.status === 'win') {
      fight.status = 'win'; fight.destination = fight.alliesRemaining
        ? fight.encounter.winWithAlliesTarget ?? fight.encounter.winTarget
        : fight.encounter.winWithoutAlliesTarget ?? fight.encounter.winTarget;
    }
  }
  else if (!fight.alliesRemaining && fight.encounter.forces.lossOnAlliesKilled) {
    fight.status = 'loss'; fight.destination = fight.encounter.allAlliesKilledTarget ?? fight.encounter.lossTarget ?? '1';
  }
  else if (fight.enemiesRemaining === 0) {
    fight.status = 'win';
    fight.destination = fight.alliesRemaining < (fight.encounter.forces.minimumAlliesForWin ?? 0)
      ? fight.encounter.forces.insufficientAlliesTarget : fight.encounter.winTarget;
  }
  return fight.status !== 'fighting';
}

function firstVolley(fight) {return fight.encounter.forces.initiative === 'hero' ? 'allyVolley' : 'enemyVolley';}
function beginVolley(fight, phase) {
  if (phase === 'allyVolley' && !fight.alliesRemaining && fight.monkeys?.remaining) phase = 'monkeyVolley';
  fight.phase = phase; fight.cursor = 0;
  fight.shots = phase === 'allyVolley' ? fight.alliesRemaining : phase === 'monkeyVolley' ? fight.monkeys.remaining : fight.enemiesRemaining;
}
function beginVolleys(fight) {
  if (!alliedCount(fight) || !fight.enemiesRemaining) {
    fight.phase = persistentDuel(fight.encounter) ? 'duel' : 'chooseDuel'; fight.cursor = 0; return;
  }
  beginVolley(fight, firstVolley(fight));
}
function nextRound(fight) {
  fight.round++; fight.phase = 'chooseDuel'; fight.cursor = 0;
  if (fight.monkeys && !fight.monkeys.arrived && fight.monkeys.calledRound !== null
      && fight.round >= fight.monkeys.calledRound + fight.rules.monkeyWhistle.delayRounds) {
    fight.monkeys.arrived = true; fight.monkeys.remaining = fight.rules.monkeyWhistle.count;
    log(fight, {kind: 'monkeysArrive', count: fight.monkeys.remaining});
  }
  if (!persistentDuel(fight.encounter)) fight.duel = null;
  fight.duelsThisRound = 0;
  if (fight.encounter.forces.duelTiming === 'after') beginVolleys(fight);
}
function finishVolleys(fight) {
  if (fight.encounter.forces.duelTiming === 'after') {
    fight.phase = persistentDuel(fight.encounter) ? 'duel' : 'chooseDuel'; fight.cursor = 0;
  }
  else nextRound(fight);
}

export function sagardForcesTurn(fight) {
  validateSagardForcesFight(fight);
  if (fight.status !== 'fighting') return null;
  return fight.phase === 'duel' ? {...sagardTurn(fight.duel), forcePhase: 'duel', canFlee: canFleeSagardForces(fight)}
    : {kind: fight.phase, requiresDie: fight.phase !== 'chooseDuel', targets: fight.phase === 'enemyVolley' && fight.monkeys?.remaining
      ? [...(fight.alliesRemaining ? ['crew'] : []), 'monkeys'] : [],
      canFlee: canFleeSagardForces(fight),
      actions: fight.phase === 'chooseDuel' ? ['duel', 'volley'] : []};
}

export function canBlowSagardWhistle(fight) {
  return fight?.kind === 'forces' && fight.status === 'fighting' && fight.encounter.jungle === true && fight.monkeys?.held
    && fight.monkeys.calledRound === null && (fight.phase === 'chooseDuel'
      || (['enemyVolley', 'allyVolley'].includes(fight.phase) && fight.cursor === 0));
}

export function blowSagardWhistle(original) {
  validateSagardForcesFight(original);
  if (!canBlowSagardWhistle(original)) throw new RangeError('The whistle cannot be used here');
  const fight = clone(original); fight.monkeys.held = false; fight.monkeys.calledRound = fight.round;
  log(fight, {kind: 'monkeyWhistle', arrivalRound: fight.round + fight.rules.monkeyWhistle.delayRounds});
  return validateSagardForcesFight(fight);
}

export function canFleeSagardForces(fight) {
  if (fight?.status !== 'fighting' || !['even', 'four', 'one'].includes(fight.encounter.escape)
      || (fight.encounter.forces.escapeOnlyWithoutAllies && alliedCount(fight))) return false;
  if (fight.phase === 'chooseDuel') return fight.escapeAttemptedRound !== fight.round;
  if (fight.phase !== 'duel') return false;
  const duel = fight.duel, turn = sagardTurn(duel);
  return duel.phase === 'round' && turn?.kind === 'attack' && turn.attackerId === 'hero'
    && duel.heroAttacksThisRound === 0 && !duel.escapeAttempted;
}

export function fleeSagardForces(original, die) {
  validateSagardForcesFight(original);
  if (!canFleeSagardForces(original)) throw new RangeError('You may not flee this group battle now');
  const fight = clone(original);
  if (fight.phase === 'duel') {
    fight.duel.encounter.escape = fight.encounter.escape; fight.duel.encounter.escapeTarget = fight.encounter.escapeTarget;
    fight.duel = fleeSagardFight(fight.duel, die);
    log(fight, {kind: 'duelTurn', entry: clone(fight.duel.log.at(-1))});
    if (fight.duel.status === 'fled') {fight.status = 'fled'; fight.destination = fight.encounter.escapeTarget;}
  } else {
    if (!Number.isInteger(die) || die < 1 || die > 4) throw new RangeError('Enter a four-sided roll');
    const success = fight.encounter.escape === 'four' ? die === 4 : fight.encounter.escape === 'one' ? die === 1 : die % 2 === 0;
    fight.escapeAttemptedRound = fight.round; log(fight, {kind: 'flee', die, success});
    if (success) {fight.status = 'fled'; fight.destination = fight.encounter.escapeTarget;}
  }
  return validateSagardForcesFight(fight);
}

export function resolveSagardForcesDuelAction(original, action) {
  validateSagardForcesFight(original);
  if (original.status !== 'fighting' || original.phase !== 'duel') throw new RangeError('Begin an individual duel first');
  const fight = clone(original);
  const previousDuelRound = fight.duel.round;
  fight.duel = action(fight.duel);
  fight.hero = clone(fight.duel.hero); fight.healing = clone(fight.duel.healing);
  if (fight.duel.stunStone) fight.stunStone = clone(fight.duel.stunStone);
  if (fight.duel.ammo) {fight.ammo = clone(fight.duel.ammo); fight.dahliaOil = fight.duel.dahliaOil;}
  if (Object.hasOwn(fight.duel, 'magicDaggerPower')) fight.magicDaggerPower = fight.duel.magicDaggerPower;
  log(fight, {kind: 'duelTurn', entry: clone(fight.duel.log.at(-1))});
  if (persistentDuel(fight.encounter)) {
    if (!outcome(fight) && fight.duel.round > previousDuelRound) nextRound(fight);
  } else if (fight.duel.status === 'win') {
    fight.enemiesRemaining--; fight.duel = null; fight.phase = 'chooseDuel';
    fight.duelsThisRound = (fight.duelsThisRound ?? 0) + 1;
    if (!outcome(fight)) {
      if (fight.encounter.forces.duelTiming === 'after') nextRound(fight);
      else if (fight.encounter.forces.duelsPerRound !== 'unlimited') {
        if (!alliedCount(fight) && fight.encounter.forces.duelTiming) nextRound(fight);
        else beginVolley(fight, firstVolley(fight));
      }
    }
  } else if (fight.duel.status === 'loss') outcome(fight);
  return validateSagardForcesFight(fight);
}

export function resolveSagardForces(original, die, options = {}) {
  const turn = sagardForcesTurn(original);
  if (!turn) throw new RangeError('This group battle has ended');
  const fight = clone(original), spec = fight.encounter.forces;
  if (fight.phase === 'chooseDuel') {
    if (options.decision === 'duel') {
      fight.duel = startSagardFight(fight.hero, duelSpec(fight.encounter), fight.rules, {...fight.healing,
        stunStone: fight.stunStone?.held, stunStoneBroken: fight.stunStone?.broken,
        magicDaggerPower: fight.magicDaggerPower,
        saltBags: fight.saltBags,
        ...(fight.ammo ? {ammo: fight.ammo, dahliaOil: fight.dahliaOil} : {})});
      if (fight.escapeAttemptedRound === fight.round) fight.duel.escapeAttempted = true;
      fight.phase = 'duel'; log(fight, {kind: 'beginDuel'});
    } else if (options.decision === 'volley') {
      if (spec.duelTiming === 'after') nextRound(fight);
      else beginVolleys(fight);
      log(fight, {kind: 'beginVolley'});
    } else throw new RangeError('Choose an individual duel or group volley');
  } else if (fight.phase === 'duel') {
    return resolveSagardForcesDuelAction(original, duel => resolveSagardTurn(duel, die, options));
  } else {
    if (!Number.isInteger(die) || die < 1 || die > 4) throw new RangeError('Enter a four-sided roll');
    const enemyVolley = fight.phase === 'enemyVolley';
    const casualty = (enemyVolley ? spec.enemyKillFaces : fight.phase === 'monkeyVolley'
      ? fight.rules.monkeyWhistle.killFaces : spec.allyKillFaces).includes(die) ? 1 : 0;
    const targets = turn.targets;
    const target = options.target ?? (targets.length === 1 ? targets[0] : null);
    if (targets.length && !targets.includes(target)) throw new RangeError('Choose which allied force receives this attack');
    const key = enemyVolley ? 'alliesRemaining' : 'enemiesRemaining';
    if (enemyVolley && casualty && spec.enemyDiesOnSuccessfulKill) fight.enemiesRemaining--;
    if (enemyVolley && target === 'monkeys') fight.monkeys.remaining = Math.max(0, fight.monkeys.remaining - casualty);
    else fight[key] = Math.max(0, fight[key] - casualty);
    log(fight, {kind: fight.phase, die, casualty, ...(target ? {target} : {})}); fight.cursor++;
    if (!outcome(fight) && (fight.cursor === fight.shots || !alliedCount(fight) || !fight.enemiesRemaining)) {
      if (!alliedCount(fight) || !fight.enemiesRemaining) finishVolleys(fight);
      else if (fight.phase === 'allyVolley' && fight.monkeys?.remaining) beginVolley(fight, 'monkeyVolley');
      else if ((fight.phase === 'monkeyVolley' ? 'allyVolley' : fight.phase) === firstVolley(fight)) {
        const second = enemyVolley ? 'allyVolley' : 'enemyVolley';
        if (enemyVolley ? alliedCount(fight) : fight.enemiesRemaining) beginVolley(fight, second);
        else finishVolleys(fight);
      } else finishVolleys(fight);
    }
  }
  return validateSagardForcesFight(fight);
}

export function cancelSagardForces(original) {
  if (!sagardForcesTurn(original)) throw new RangeError('This group battle has ended');
  const fight = clone(original); fight.status = 'cancelled'; log(fight, {kind: 'cancel'}); return fight;
}
