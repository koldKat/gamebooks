import { customInnsmouthEncounter } from './gateway-opponents.js';

import { createRosterLoader } from '../roster-data.js';

export let INNSMOUTH_ENCOUNTERS = Object.freeze([]);
export const loadRoster = createRosterLoader(548, 'BOOK_DATA', rows => {
  const encounters = rows.flatMap(row => row.encounters).sort((a,b) => a.index-b.index);
  if (!encounters.length || new Set(encounters.map(row => row.index)).size !== encounters.length) throw new Error('Incomplete Innsmouth catalog');
  INNSMOUTH_ENCOUNTERS = Object.freeze(encounters.map(({spec}) => Object.freeze({...spec, enemies: Object.freeze(spec.enemies.map(Object.freeze))})));
});

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

export function createInnsmouthFight(section, player, options = {}) {
  validatePlayer(player);
  const encounter = customInnsmouthEncounter(section, options.opponents) ?? INNSMOUTH_ENCOUNTERS.find(e => e.section === Number(section));
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
