// Resolve one Sagard monster encounter fought simultaneously by the hero and a surviving crew.
import {createSagardHero, sagardDamageForRoll, validateSagardRules} from './core.js';
import {sagardHealedHp} from './recovery.js';
const clone = value => structuredClone(value);
const integer = (value, min, max = 1000000) => {
  if (value == null || value === '' || !Number.isSafeInteger(Number(value)) || value < min || value > max) {
    throw new RangeError('Enter a valid monster combat value');
  }
  return Number(value);
};
const log = (fight, entry) => {
  fight.log.push({...entry, round: fight.round});
  if (fight.log.length > 500) fight.log.splice(0, fight.log.length - 500);
  fight.turnSerial++;
};

export function validateSagardBeastEncounter(encounter) {
  const spec = encounter?.beast;
  if (!spec || encounter.opponents?.length !== 1) throw new RangeError('Missing monster encounter');
  integer(encounter.opponents[0].hp, 1); integer(spec.crew, 0, 1000); integer(spec.swallowedDamage, 1, 1000);
  for (const key of ['swallowFaces', 'swallowConfirmFaces']) {
    if (!Array.isArray(spec[key]) || !spec[key].length || new Set(spec[key]).size !== spec[key].length
        || spec[key].some(face => !Number.isInteger(face) || face < 1 || face > 4)) throw new RangeError('Invalid swallowing faces');
  }
  for (const key of ['crewChart', 'crewCasualties']) {
    if (!Array.isArray(spec[key]) || spec[key].length !== 4) throw new RangeError('Missing crew combat chart');
    spec[key].forEach(value => integer(value, 0, 1000));
  }
  return encounter;
}

export function startSagardBeast(hero, encounter, rules, options = {}) {
  validateSagardBeastEncounter(encounter); validateSagardRules(rules);
  const fight = {kind: 'beast', rulesVersion: 1, encounter: clone(encounter), rules: clone(rules),
    hero: createSagardHero(hero, encounter, rules), healing: {fang: Boolean(options.fang), moss: Boolean(options.moss)},
    monster: {name: String(encounter.opponents[0].displayName ?? encounter.opponents[0].name), hp: encounter.opponents[0].hp, maxHp: encounter.opponents[0].hp},
    crewRemaining: integer(options.crewRemaining ?? encounter.beast.crew, 0, 1000), swallowed: false,
    phase: 'swallow', status: 'fighting', round: 1, cursor: 0, turnSerial: 0, log: []};
  if (rules.spiritLuckEnabled) fight.healing.spiritLuck = Boolean(options.spiritLuck);
  if (rules.stunStoneEnabled) fight.stunStone = {held: Boolean(options.stunStone), broken: Boolean(options.stunStoneBroken)};
  return validateSagardBeastFight(fight);
}

export function validateSagardBeastFight(fight) {
  if (fight?.kind !== 'beast' || fight.rulesVersion !== 1 || !['fighting', 'win', 'loss', 'cancelled'].includes(fight.status)
      || !['swallow', 'swallowConfirm', 'digestion', 'heroAttack', 'crewCasualties', 'crewAttack', 'recovery', 'stoneConfirm', 'stoneAttack'].includes(fight.phase)
      || typeof fight.swallowed !== 'boolean' || !Array.isArray(fight.log) || fight.log.length > 500) {
    throw new RangeError('Invalid saved monster battle');
  }
  validateSagardBeastEncounter(fight.encounter); validateSagardRules(fight.rules);
  integer(fight.monster?.maxHp, 1); integer(fight.monster.hp, 0, fight.monster.maxHp);
  integer(fight.hero?.hp, 0, fight.rules.maxHeroHp); integer(fight.hero.shield, 0, 1000);
  integer(fight.hero.damageReduction, 0, 100); integer(fight.crewRemaining, 0, 1000);
  integer(fight.round, 1); integer(fight.cursor, 0, 1000); integer(fight.turnSerial, 0, 1000000000);
  if (fight.phase === 'crewAttack' && fight.status === 'fighting' && fight.cursor >= fight.crewRemaining) throw new RangeError('Invalid crew turn');
  if (fight.phase === 'recovery' && (!fight.healing.spiritLuck || fight.hero.hp !== 0)) throw new RangeError('Invalid monster recovery');
  if (fight.phase === 'stoneAttack') integer(fight.stoneAttacksRemaining, 1, 2);
  if (fight.status === 'fighting' && ((!fight.hero.hp && fight.phase !== 'recovery') || !fight.monster.hp)) throw new RangeError('Unresolved monster outcome');
  return fight;
}

function outcome(fight) {
  if (fight.hero.hp === 0 && fight.healing.spiritLuck) {fight.phase = 'recovery'; return true;}
  if (fight.hero.hp === 0) {fight.status = 'loss'; fight.destination = fight.encounter.lossTarget ?? '1';}
  else if (fight.monster.hp === 0) {fight.status = 'win'; fight.destination = fight.encounter.winTarget ?? null;}
  return fight.status !== 'fighting';
}
function nextRound(fight) {fight.round++; fight.cursor = 0; fight.phase = fight.swallowed ? 'digestion' : 'swallow';}
function digest(fight) {
  let damage = Math.max(0, fight.encounter.beast.swallowedDamage - fight.hero.damageReduction);
  const shieldUsed = Math.min(damage, fight.hero.shield); fight.hero.shield -= shieldUsed; damage -= shieldUsed;
  const before = fight.hero.hp; fight.hero.hp = Math.max(0, before - damage);
  log(fight, {kind: 'digestion', damage: before - fight.hero.hp, shieldUsed});
  if (!outcome(fight)) fight.phase = 'heroAttack';
}

export function sagardBeastTurn(fight) {
  validateSagardBeastFight(fight);
  return fight.status === 'fighting' ? {kind: fight.phase, requiresDie: !['digestion', 'recovery'].includes(fight.phase), targets: []} : null;
}

export function resolveSagardBeast(original, die, {decision} = {}) {
  const turn = sagardBeastTurn(original);
  if (!turn) throw new RangeError('This monster battle has ended');
  const fight = clone(original), spec = fight.encounter.beast;
  const roll = turn.requiresDie ? integer(die, 1, 4) : null;
  if (turn.kind === 'recovery') {
    if (decision !== 'decline') throw new RangeError('Use Spirit luck or accept defeat');
    fight.status = 'loss'; fight.destination = fight.encounter.lossTarget ?? '1';
    log(fight, {kind: 'declineRecovery'});
  } else if (turn.kind === 'stoneConfirm') {
    fight.stunStone.broken = roll >= 3;
    log(fight, {kind: 'stoneConfirm', die: roll, broken: fight.stunStone.broken});
    if (fight.stunStone.broken) {fight.stunStone.held = false; fight.phase = 'heroAttack';}
    else {fight.phase = 'stoneAttack'; fight.stoneAttacksRemaining = 2;}
  } else if (turn.kind === 'swallow') {
    fight.phase = spec.swallowFaces.includes(roll) ? 'swallowConfirm' : 'heroAttack';
    log(fight, {kind: 'swallow', die: roll, confirm: fight.phase === 'swallowConfirm'});
  } else if (turn.kind === 'swallowConfirm') {
    fight.swallowed = spec.swallowConfirmFaces.includes(roll);
    log(fight, {kind: 'swallowConfirm', die: roll, swallowed: fight.swallowed});
    if (fight.swallowed) digest(fight); else fight.phase = 'heroAttack';
  } else if (turn.kind === 'digestion') digest(fight);
  else if (['heroAttack', 'stoneAttack', 'crewAttack'].includes(turn.kind)) {
    const raw = turn.kind !== 'crewAttack' ? sagardDamageForRoll(fight.hero, roll) : spec.crewChart[roll - 1];
    const damage = Math.min(raw, fight.monster.hp); fight.monster.hp -= damage;
    log(fight, {kind: turn.kind, die: roll, damage, crewIndex: fight.cursor});
    if (!outcome(fight)) {
      if (turn.kind === 'stoneAttack') {
        if (--fight.stoneAttacksRemaining === 0) fight.phase = 'heroAttack';
      } else if (turn.kind === 'heroAttack') {
        if (fight.crewRemaining) fight.phase = 'crewCasualties'; else nextRound(fight);
      } else if (++fight.cursor === fight.crewRemaining) nextRound(fight);
    }
  } else if (turn.kind === 'crewCasualties') {
    const casualties = Math.min(fight.crewRemaining, spec.crewCasualties[roll - 1]); fight.crewRemaining -= casualties;
    log(fight, {kind: 'crewCasualties', die: roll, casualties});
    if (fight.crewRemaining) {fight.phase = 'crewAttack'; fight.cursor = 0;} else nextRound(fight);
  }
  return validateSagardBeastFight(fight);
}

export function cancelSagardBeast(original) {
  if (!sagardBeastTurn(original)) throw new RangeError('This monster battle has ended');
  const fight = clone(original); fight.status = 'cancelled'; log(fight, {kind: 'cancel'}); return fight;
}

export function useSagardBeastStone(original, die) {
  if (!sagardBeastTurn(original) || original.phase !== 'heroAttack' || !original.stunStone?.held
      || original.stunStone.broken) throw new RangeError('The stun stone cannot be used now');
  const fight = clone(original), roll = integer(die, 1, 4);
  log(fight, {kind: 'stunStone', die: roll});
  if (roll === 4) fight.phase = 'stoneConfirm';
  else {fight.phase = 'stoneAttack'; fight.stoneAttacksRemaining = 2;}
  return validateSagardBeastFight(fight);
}

export function healSagardBeast(original, item) {
  if (!sagardBeastTurn(original) || !['fang', 'moss', 'spiritLuck'].includes(item) || !original.healing[item]
      || (original.phase === 'recovery' && item !== 'spiritLuck') || original.hero.hp === original.hero.maxHp) {
    throw new RangeError('This healing item cannot be used now');
  }
  const fight = clone(original), restored = fight.hero.maxHp - fight.hero.hp;
  fight.hero.hp = sagardHealedHp(fight, item); fight.healing[item] = false;
  if (fight.phase === 'recovery') fight.phase = 'heroAttack';
  log(fight, {kind: 'heal', item, restored}); return validateSagardBeastFight(fight);
}
