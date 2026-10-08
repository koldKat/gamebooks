const enemy = (name, speed, accuracy, damage, health) => Object.freeze({ name, speed, accuracy, damage, health });
const man = (health = 6) => enemy('man', 6, 8, 2, health);
const woman = (health = 9) => enemy('woman', 8, 9, 2, health);
const pair = section => ({ section, enemies: [woman(), man()], simultaneous: true });
export const INNSMOUTH_ENCOUNTERS = Object.freeze([
  { section: 45, enemies: [man(), woman()] },
  { section: 64, enemies: [enemy('man', 5, 8, 3, 5)] }, pair(74),
  { section: 78, enemies: [enemy('man', 11, 11, 3, 15)], divert: true },
  { section: 131, enemies: [enemy('humanoid', 7, 7, 2, 9)] }, pair(147),
  { section: 169, enemies: [woman()] }, pair(180),
  { section: 213, enemies: [enemy('woman', 5, 9, 2, 8)] },
  { section: 225, enemies: [enemy('first_woman', 10, 9, 3, 8), enemy('man', 9, 8, 3, 8), enemy('second_woman', 8, 8, 2, 9)], divert: true },
  { ...pair(253), enemies: [woman(6), man()] },
  { section: 260, enemies: [enemy('creature', 3, 4, 1, 3)] },
  { section: 267, enemies: [enemy('first_man', 6, 8, 2, 7), enemy('second_man', 7, 7, 2, 7), enemy('third_man', 9, 9, 2, 8)], divert: true },
  { ...pair(294), enemies: [woman(), man(4)] }, pair(324),
  { section: 352, enemies: [man()] },
  { section: 354, enemies: [enemy('man', 9, 8, 3, 8), enemy('woman', 8, 8, 2, 9)], divert: true },
  { section: 367, enemies: [enemy('old_man', 8, 9, 2, 9), enemy('young_man', 7, 8, 3, 7)] },
  { section: 387, enemies: [enemy('first_man', 6, 8, 2, 7), enemy('second_man', 7, 7, 2, 7)], divert: true },
  { section: 397, enemies: [enemy('figure_one', 5, 8, 3, 5), enemy('figure_two', 5, 9, 3, 6), enemy('figure_three', 4, 8, 3, 4)], firstKillEnds: true },
  { section: 460, enemies: [enemy('man', 10, 11, 3, 10), enemy('woman', 11, 10, 3, 9)], divert: true },
  pair(479), pair(510),
  { section: 543, enemies: [enemy('old_man', 8, 9, 2, 9), enemy('young_man', 7, 8, 3, 7)], simultaneous: true },
  { section: 554, enemies: [woman()] },
  { section: 560, enemies: [enemy('woman', 5, 8, 2, 8)], openingShot: true },
  { section: 595, enemies: [man(4)] },
].map(e => Object.freeze({ ...e, enemies: Object.freeze(e.enemies) })));

const attributes = ['speed', 'accuracy', 'stealth', 'detection', 'power'];
const die = random => Math.floor(random() * 6) + 1;
const dice = random => [die(random), die(random)];
const sum = rolls => rolls.reduce((a, b) => a + b, 0);
const integer = (n, min = 0) => Number.isSafeInteger(n) && n >= min;

export function rollInnsmouthCharacter(random = Math.random) {
  const player = { health: 15, maxHealth: 15, conspicuousness: 4, bullets: 6, rations: 3,
    weaponDamage: 2, weight: 3, throwingKnife: false };
  for (const key of attributes) { player[key] = die(random) + 6; player['max' + key[0].toUpperCase() + key.slice(1)] = player[key]; }
  return player;
}

export function innsmouthWeightPenalty(weight) {
  if (!integer(weight) || weight > 40) throw new RangeError('Invalid weight');
  return Number(weight > 20) + Number(weight > 35);
}

export function innsmouthTest(player, key, random = Math.random, modifier = 0) {
  if (![...attributes, 'conspicuousness'].includes(key) || !integer(player[key]) || !Number.isSafeInteger(modifier)) throw new RangeError('Invalid attribute');
  const rolls = dice(random), total = sum(rolls) + modifier;
  const value = player[key] - (['speed', 'stealth'].includes(key) ? innsmouthWeightPenalty(player.weight) : 0);
  return { rolls, total, key, success: key === 'conspicuousness' ? total > value : total <= value };
}

function validatePlayer(p) {
  for (const key of ['health', 'maxHealth', 'conspicuousness', 'bullets', 'rations', 'weaponDamage', 'weight', ...attributes]) if (!integer(p[key])) throw new RangeError('Invalid character');
  if (p.health <= 0 || p.health > p.maxHealth || p.maxHealth !== 15 || p.conspicuousness < 4 || p.rations > p.weight) throw new RangeError('Invalid character');
  innsmouthWeightPenalty(p.weight);
}

export function createInnsmouthFight(section, player) {
  validatePlayer(player);
  const encounter = INNSMOUTH_ENCOUNTERS.find(e => e.section === Number(section));
  if (!encounter) throw new RangeError('Invalid encounter');
  const fight = { version: 1, encounter: structuredClone(encounter), player: structuredClone(player),
    enemies: encounter.enemies.map(e => ({ ...e, initialHealth: e.health })),
    sequence: 0, round: 0, queue: [], status: 'fighting', throwingKnifeUsed: false,
    throwingKnifeRecoverable: false, openingAvailable: Boolean(encounter.openingShot) };
  nextRound(fight);
  return fight;
}

function active(fight, index) {
  const e = fight.enemies[index];
  return Boolean(e && e.health > 0 && !e.diverted && (fight.encounter.simultaneous || index === fight.sequence));
}

function nextRound(fight) {
  if (fight.status !== 'fighting') return;
  const fighters = [{ index: -1, speed: fight.player.speed - innsmouthWeightPenalty(fight.player.weight), accuracy: fight.player.accuracy, health: fight.player.health },
    ...fight.enemies.flatMap((e, index) => active(fight, index) ? [{ ...e, index }] : [])];
  if (!fight.order) {
    fighters.sort((a, b) => b.speed - a.speed || b.accuracy - a.accuracy || b.health - a.health || a.index - b.index);
    fight.order = fighters.map(e => e.index);
  }
  fight.queue = fight.order.filter(i => i === -1 || active(fight, i)); fight.round++;
}

export function finishInnsmouthFight(fight) {
  if (fight.status !== 'fighting') return;
  if (fight.player.health <= 0) { fight.status = 'loss'; return; }
  if (fight.encounter.firstKillEnds && fight.enemies.some(e => e.health <= 0) || fight.enemies.every(e => e.health <= 0 || e.diverted)) {
    fight.status = fight.enemies.some(e => e.health <= 0) ? 'win' : 'avoided';
    if (fight.throwingKnifeRecoverable) fight.player.throwingKnife = true;
    return;
  }
  if (!fight.encounter.simultaneous && !active(fight, fight.sequence)) {
    while (fight.sequence < fight.enemies.length && !active({ ...fight, encounter: { simultaneous: true } }, fight.sequence)) fight.sequence++;
    fight.order = null; nextRound(fight); return;
  }
  fight.queue = fight.queue.filter(i => i === -1 || active(fight, i));
  if (!fight.queue.length) nextRound(fight);
}

export function innsmouthTurn(fight) {
  return fight?.status === 'fighting' ? fight.queue[0] : null;
}

function projectile(fight, target, random) {
  const roll = die(random), enemy = fight.enemies[target];
  const damage = roll === 1 ? 0 : roll === 6 ? enemy.health : roll;
  enemy.health = Math.max(0, enemy.health - damage);
  return { roll, damage };
}

export function attackInnsmouth(fight, target = fight.sequence, gun = false, random = Math.random) {
  if (fight.status !== 'fighting' || fight.openingAvailable) return null;
  const actor = innsmouthTurn(fight);
  if (actor === -1 && !active(fight, target)) return null;
  if (actor === -1 && gun && fight.player.bullets < 1) return null;
  let result;
  if (actor === -1 && gun) {
    fight.player.bullets--; fight.player.conspicuousness += 2;
    result = { ...projectile(fight, target, random), gun: true };
  } else {
    const attacker = actor === -1 ? fight.player : fight.enemies[actor];
    const defender = actor === -1 ? fight.enemies[target] : fight.player;
    const rolls = dice(random), hit = sum(rolls) <= attacker.accuracy;
    const damage = hit ? actor === -1 ? fight.player.weaponDamage : attacker.damage : 0;
    defender.health = Math.max(0, defender.health - damage);
    result = { rolls, hit, damage };
  }
  fight.queue.shift(); finishInnsmouthFight(fight);
  return { ...result, actor, target: actor === -1 ? target : -1 };
}

export function openingInnsmouthShot(fight, use, random = Math.random) {
  if (fight.status !== 'fighting' || !fight.openingAvailable || use && fight.player.bullets < 1) return null;
  fight.openingAvailable = false;
  if (!use) return { skipped: true };
  fight.player.bullets--; fight.player.conspicuousness += 2;
  const result = projectile(fight, 0, random);
  finishInnsmouthFight(fight);
  return result;
}

export function throwInnsmouthKnife(fight, target = fight.sequence, random = Math.random) {
  if (fight.status !== 'fighting' || fight.openingAvailable || innsmouthTurn(fight) !== -1 || fight.throwingKnifeUsed || !fight.player.throwingKnife || !active(fight, target)) return null;
  fight.player.throwingKnife = false; fight.throwingKnifeUsed = true;
  const result = projectile(fight, target, random);
  fight.throwingKnifeRecoverable = result.roll !== 1;
  finishInnsmouthFight(fight);
  return result;
}

export function divertInnsmouthEnemy(fight) {
  if (fight.status !== 'fighting' || !fight.encounter.divert) return false;
  fight.enemies[fight.sequence].diverted = true;
  finishInnsmouthFight(fight);
  return true;
}

export function eatInnsmouthRation(player, fight, approachingCombat = false) {
  if (approachingCombat || fight?.status === 'fighting' || player.health <= 0 || player.health >= player.maxHealth || player.rations < 1 || player.weight < 1) return false;
  player.rations--; player.weight--; player.health = Math.min(player.maxHealth, player.health + 3);
  return true;
}
