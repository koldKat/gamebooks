import { woundThreshold } from './core.js';

const copy = value => structuredClone(value);
const randomDie = () => Math.floor(Math.random() * 6) + 1;
function whole(value, min = 0, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
}
const die = roll => whole(roll(6), 1, 6);
const alive = enemy => enemy.w === null || enemy.w > 0;

// This ruleset has one melee system. It does not inherit the other book's
// Basic/Advanced modes, ammunition, fire or persistent poison rules.
export function knightCharacter(value) {
  if (!value) throw new TypeError('Missing character');
  const next = copy(value);
  whole(next.ws, 1, 100); whole(next.a, 1, 100);
  for (const key of ['s', 't']) whole(next[key], 0, 6);
  whole(next.w); whole(next.maxW, 1);
  if (next.w > next.maxW) throw new RangeError('Wounds exceed starting Wounds');
  next.maxS ??= next.s; next.maxT ??= next.t;
  whole(next.maxS, 1, 6); whole(next.maxT, 1, 6);
  next.taint ??= 0; whole(next.taint);
  next.armour ??= 0; whole(next.armour, 0, 6);
  next.healingPacks ??= 0; whole(next.healingPacks);
  if (!next.weapon || !Number.isFinite(next.weapon.damage) || next.weapon.damage <= 0 || next.weapon.damage > 1000) throw new RangeError('Check the weapon damage multiplier');
  return next;
}

function enemyProfile(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim()) throw new RangeError('Enter an opponent name');
  const unlimited = value.w === null;
  const next = knightCharacter({ ...value, w: unlimited ? 1 : value.w,
    maxW: unlimited ? 1 : value.maxW ?? value.w, taint: 0 });
  if (!next.s || !next.t) throw new RangeError('Opponent Strength and Toughness must be on the printed chart');
  if (unlimited) next.w = next.maxW = null;
  return next;
}

export function knightRecovery(character, effect) {
  const next = knightCharacter(character);
  if (effect.restoreWounds) next.w = next.maxW;
  if (effect.restoreStrength) next.s = next.maxS;
  if (effect.restoreToughness) next.t = next.maxT;
  if (effect.wounds !== undefined) next.w = Math.max(0, Math.min(next.maxW, next.w + effect.wounds));
  if (effect.setWounds !== undefined) next.w = Math.min(next.maxW, whole(effect.setWounds));
  if (effect.strength !== undefined) next.s = Math.max(0, Math.min(6, next.s + effect.strength));
  if (effect.toughness !== undefined) next.t = Math.max(0, Math.min(6, next.t + effect.toughness));
  if (effect.taint !== undefined) next.taint = Math.max(0, next.taint + effect.taint);
  return knightCharacter(next);
}

export function acquireKnightWeapon(character, item) {
  const next = knightCharacter(character);
  if (!item?.name) throw new RangeError('Missing weapon');
  next.acquiredWeapons ??= {};
  if (next.acquiredWeapons[item.name]) return next;
  next.ws += whole(item.weaponSkillBonus ?? 0);
  next.a += whole(item.attacksBonus ?? 0);
  next.taint = Math.max(0, next.taint + (item.onceOnAcquiringTaintChange ?? 0));
  next.weapon.name = item.name;
  // The source grants no new multiplier for this weapon.
  next.acquiredWeapons[item.name] = true;
  return knightCharacter(next);
}

function finish(fight, status, destination) {
  fight.status = status;
  let target = destination;
  if (target === undefined) {
    target = status === 'loss' ? fight.config.loss : fight.config.win;
    if (status === 'win' && fight.config.winByRound) {
      const rule = fight.config.winByRound;
      target = fight.round <= rule.atMost ? rule.fastSection : rule.slowSection;
    }
    if (status === 'win' && fight.config.victoryItemCheck) {
      const rule = fight.config.victoryItemCheck;
      target = fight.options.victoryItem ? rule.presentSection : rule.absentSection;
    }
    if (status === 'win' && target == null && fight.config.winChoices?.length === 1) target = fight.config.winChoices[0];
    if (status === 'win' && target == null) target = fight.config.completionSection;
  }
  fight.section = target == null ? null : String(target);
  const check = fight.config.damageCheck;
  if (status === 'win' && check) fight.followUpSection = String(fight.damageInflicted <= check.atMost ? check.lowSection : check.highSection);
  const wounded = fight.config.woundCheck;
  if (status === 'win' && wounded) fight.followUpSection = String(fight.damageTaken > 0 ? wounded.woundedSection : wounded.unwoundedSection);
}

function outcome(fight) {
  if (fight.character.taint >= fight.config.taintLimit) finish(fight, 'loss', fight.config.taintSection);
  else if (fight.companion && fight.companion.w <= 0) finish(fight, 'loss');
  else if (fight.character.w <= (fight.config.playerWoundsAtMost ?? 0)) finish(fight, 'loss');
  else if (fight.opponents.every(enemy => enemy.w !== null && enemy.w <= (fight.config.enemyWoundsAtMost ?? 0))) finish(fight, 'win');
  return fight.status !== 'fighting';
}

export function startKnightFight(character, encounter, options = {}) {
  const hero = knightCharacter(character);
  if (!hero.w) throw new RangeError('No Wounds remaining');
  if (!hero.s || !hero.t) throw new RangeError('Strength and Toughness must be between 1 and 6 to use the printed combat chart');
  if (!encounter?.enemies?.length || encounter.enemies.length > 100) throw new RangeError('Missing opponents');
  const config = copy(encounter);
  whole(config.taintLimit, 1);
  if (!['you', 'enemy'].includes(config.initiative)) throw new RangeError('Choose the Initiative');
  for (const key of ['interruptBeforeRound', 'surviveRounds', 'maxRounds']) if (config[key] !== undefined) whole(config[key], 1);
  if (options.applyEntryEffects) {
    for (const effect of config.entryEffects ?? []) {
      if (effect.kind === 'wounds') hero.w = Math.max(0, Math.min(hero.maxW, hero.w + effect.amount));
      if (effect.kind === 'setWounds') hero.w = Math.min(hero.maxW, whole(effect.amount));
      if (effect.kind === 'taint') hero.taint = Math.max(0, hero.taint + effect.amount);
    }
  }
  const fight = { rulesVersion: 1, ruleset: 'knight', config, options: copy(options), character: hero,
    opponents: config.enemies.map(enemyProfile), companion: copy(config.protectedCompanion ?? null),
    round: 0, status: 'fighting', section: null, history: [], damageInflicted: 0, damageTaken: 0 };
  if (fight.companion) whole(fight.companion.w, 1);
  // Unknown health belongs only to the explicitly unbounded defence encounters.
  if (fight.opponents.some(enemy => enemy.w === null) && !config.surviveRounds) throw new RangeError('This encounter needs a round limit');
  outcome(fight);
  return fight;
}

function attack(fight, attacker, defender, hero, roll, event) {
  const skill = attacker.ws + (hero ? fight.config.playerCombatModifiers?.ws ?? 0 : 0);
  const hit = { attacker: attacker.name, defender: hero ? defender.name : fight.companion?.name ?? defender.name,
    hitThreshold: Math.max(1, 7 - skill), hitRoll: die(roll) };
  event.attacks.push(hit);
  if (hit.hitRoll < hit.hitThreshold) return;
  const threshold = woundThreshold(attacker.s, defender.t);
  if (threshold === Infinity) { hit.cannotWound = true; return; }
  hit.woundThreshold = threshold;
  if (threshold) {
    hit.woundRoll = die(roll);
    if (hit.woundRoll < threshold) return;
  } else hit.automaticWound = true;
  const save = !hero && (fight.companion || fight.config.playerArmourDisabled) ? 0 : defender.armour;
  if (save) {
    hit.saveThreshold = save; hit.saveRoll = die(roll);
    if (hit.saveRoll >= save) { hit.saved = true; return; }
  }
  hit.damage = Math.ceil(attacker.s * attacker.weapon.damage);
  if (hero && fight.options.armourWeakness && defender.armouredSkaven) hit.damage += fight.config.armourWeaknessDamage ?? 0;
  const recipient = !hero && fight.companion ? fight.companion : defender;
  if (recipient.w !== null) recipient.w = Math.max(0, recipient.w - hit.damage);
  if (hero) fight.damageInflicted += hit.damage;
  else fight.damageTaken += hit.damage;
  outcome(fight);
}

export function knightRound(saved, { targets = [] } = {}, roll = randomDie) {
  if (saved?.rulesVersion !== 1 || saved.ruleset !== 'knight' || saved.status !== 'fighting') throw new RangeError('No active fight');
  const fight = copy(saved), config = fight.config;
  if (!Array.isArray(targets)) throw new RangeError('Invalid targets');
  for (const target of targets) whole(target, 0, fight.opponents.length - 1);
  if (outcome(fight)) return fight;
  if (config.interruptBeforeRound && fight.round + 1 >= config.interruptBeforeRound) {
    finish(fight, 'interrupted', config.interruptedSection); return fight;
  }
  const event = { round: ++fight.round, attacks: [] };
  const playerTurn = () => {
    const count = fight.character.a + (config.playerCombatModifiers?.a ?? 0);
    for (let i = 0; i < count && fight.status === 'fighting'; i++) {
      const index = targets[i] ?? targets.at(-1) ?? fight.opponents.findIndex(alive);
      whole(index, 0, fight.opponents.length - 1);
      const defender = fight.opponents[index];
      if (alive(defender)) attack(fight, fight.character, defender, true, roll, event);
    }
  };
  const enemyTurn = () => {
    for (const enemy of fight.opponents) {
      if (!alive(enemy)) continue;
      for (let i = 0; i < enemy.a && fight.status === 'fighting'; i++) attack(fight, enemy, fight.character, false, roll, event);
      if (fight.status !== 'fighting') break;
    }
  };
  if (config.initiative === 'enemy') { enemyTurn(); if (fight.status === 'fighting') playerTurn(); }
  else { playerTurn(); if (fight.status === 'fighting') enemyTurn(); }
  if (fight.status === 'fighting' && config.surviveRounds && fight.round >= config.surviveRounds) finish(fight, 'win', config.completionSection);
  if (fight.status === 'fighting' && config.maxRounds && fight.round >= config.maxRounds) finish(fight, 'interrupted', config.completionSection);
  fight.history.push(event);
  return fight;
}

export function knightInterrogation(prisoner, method, rules) {
  const next = copy(prisoner);
  whole(next.w); whole(next.taint);
  next.w = Math.max(0, next.w + method.woundsChange);
  next.taint = Math.max(0, next.taint + method.taintChange);
  const destination = next.w <= 0 ? rules.deathSection : next.taint >= rules.taintLimit ? rules.taintSection
    : next.w === next.taint ? rules.equalSection : method.section;
  return { ...next, section: String(destination) };
}
