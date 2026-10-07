import { rollAttack, tossCoins } from '../skyfall-rules.js';

const foe = (name, expertise, vitality, damage) => ({ name, expertise, vitality, initialVitality: vitality, damage });
const ogre = (section, expertise, extra = {}) => ({ section, sourceSection: 374, foes: [foe('Ogre', expertise, 16, 4)], fortuneReward: 4, expertiseReward: 1, ...extra });
const troll = section => ({ section, foes: [foe('Troll', 15, 14, 3)], mode: 'troll', fortuneReward: 5 });

export const PYRAMID_ENCOUNTERS = [
  { section: 88, foes: [foe('Hyena 1', 10, 7, 1), foe('Hyena 2', 10, 7, 1)], mode: 'all', rabies: true, fortuneReward: 2 },
  ogre('374-night', 14), ogre('374-dawn', 13), ogre('374-day', 12),
  ogre(150, 13, { openingHit: true, surprise: 'until-miss' }),
  ogre(214, 12, { openingHit: true, surprise: 2 }),
  { section: 172, foes: [foe('Giant Hound', 13, 9, 2)], fortuneReward: 2 },
  { section: 183, foes: [foe('Cheetah', 12, 9, 3)], fortuneReward: 4, escapeDamage: 3, escapeFortune: 2 },
  { section: 241, foes: [foe('Giant Scorpion', 13, 12, 2)], mode: 'scorpion', fortuneReward: 4 },
  { section: 250, foes: Array.from({ length: 10 }, (_, i) => foe(`Tendril ${i + 1}`, 11, 1, 1)), mode: 'tendrils', fortuneReward: 4 },
  { section: 272, foes: [foe('First Hound', 12, 8, 2)], chainBonusAfter: 1, fortuneReward: 2, escapeDamage: 0, escapeFortune: 0 },
  troll(281),
  { section: 284, foes: [foe('Second Hound', 12, 8, 2)], fortuneReward: 2, expertiseReward: 1 },
  { section: 304, foes: [foe('Second Hound', 13, 9, 2)], chainBonusAfter: 0, fortuneReward: 3, expertiseReward: 1, escapeDamage: 0, escapeFortune: 0 },
  { ...troll(306), stunning: true, carryTroll: true },
  { section: 310, foes: [foe('Mountain Lion', 12, 10, 1)], mode: 'lion', fortuneReward: 3, expertiseReward: 1 },
  troll(386),
];

export function createPyramidFight(section, player, { openingBonus = false, cuttingWeapon = true } = {}) {
  const entry = PYRAMID_ENCOUNTERS.find(e => String(e.section) === String(section));
  if (!entry) throw new RangeError('Unknown encounter');
  for (const key of ['expertise', 'vitality', 'fortune', 'weaponDamage']) {
    if (!Number.isInteger(player[key])) throw new RangeError('Invalid character');
  }
  if (player.vitality <= 0 || player.vitality > 20 || player.fortune < 0 || player.weaponDamage < 0) throw new RangeError('Invalid character');
  if (entry.mode === 'tendrils' && !cuttingWeapon) throw new RangeError('An edged weapon is required');
  const encounter = structuredClone(entry);
  const fight = { version: 1, encounter, player: { ...player }, round: 0, pending: null, status: 'fighting',
    surpriseActive: Boolean(entry.surprise), bites: 0, poisoned: false, regenerating: false, prepared: false };
  if (entry.openingHit) {
    const spent = openingBonus && player.fortune > 0 ? 1 : 0;
    fight.player.fortune -= spent;
    encounter.foes[0].vitality -= player.weaponDamage + spent;
  }
  finishPyramidFight(fight);
  return fight;
}

function alive(fight, foe) { return fight.encounter.mode === 'troll' ? foe.vitality >= 0 : foe.vitality > 0; }

export function finishPyramidFight(fight) {
  if (fight.status !== 'fighting') return;
  if (fight.player.vitality <= 0) { fight.status = 'loss'; return; }
  if (fight.encounter.foes.every(foe => !alive(fight, foe))) {
    fight.status = 'win';
    fight.player.fortune += fight.encounter.rabies && fight.bites ? 0 : fight.encounter.fortuneReward ?? 0;
    fight.player.expertise += fight.encounter.expertiseReward ?? 0;
    return;
  }
  if (fight.encounter.mode === 'troll' && fight.player.vitality < 4) fight.encounter.stunning = true;
}

export function rollPyramidRound(fight, target = 0, random = Math.random) {
  if (fight.status !== 'fighting' || fight.pending) return null;
  const e = fight.encounter;
  if (!fight.prepared) {
    if (e.mode === 'troll' && fight.regenerating) e.foes[0].vitality = Math.min(e.foes[0].initialVitality, e.foes[0].vitality + 1);
    fight.prepared = true;
  }
  const active = e.foes.flatMap((foe, index) => alive(fight, foe) && (e.mode !== 'tendrils' || index < Math.min(10, fight.round + 3)) ? [{ foe, index }] : []);
  if (!active.length) { finishPyramidFight(fight); return null; }
  if (!active.some(row => row.index === target)) target = active[0].index;
  const surprise = fight.surpriseActive ? (fight.surprisePenalty ??= tossCoins(3, random).tails) : 0;
  const chain = e.chainBonusAfter !== undefined && fight.round >= e.chainBonusAfter ? 1 : 0;
  const player = rollAttack(fight.player.expertise + chain, 0, random);
  const attacks = ['scorpion', 'lion'].includes(e.mode) ? [active[0], active[0]] : active;
  const rolls = attacks.map(row => ({ ...rollAttack(row.foe.expertise, surprise, random), index: row.index }));
  const higher = rolls.filter(roll => roll.total > player.total);
  const lower = rolls.filter(roll => roll.total < player.total);
  const hits = [];
  if (e.mode === 'all') lower.forEach(roll => hits.push({ index: roll.index, damage: fight.player.weaponDamage }));
  else if (e.mode === 'tendrils') {
    const hit = lower.find(roll => roll.index === target) ?? lower[0];
    if (hit) hits.push({ index: hit.index, damage: 1 });
  } else if (e.mode === 'lion') {
    if (lower.length === 2) hits.push({ index: 0, damage: fight.player.weaponDamage });
  } else if (lower.some(roll => roll.index === target)) hits.push({ index: target, damage: fight.player.weaponDamage });
  const doubleHit = higher.length === 2 && ['scorpion', 'lion'].includes(e.mode);
  const enemyDamage = doubleHit ? (e.mode === 'scorpion' && fight.poisoned ? 4 : 6)
    : higher.reduce((total, roll) => total + e.foes[roll.index].damage, 0);
  fight.pending = { player, rolls, hits, enemyDamage, enemyHits: higher.length, doubleHit,
    retry: rolls.every(roll => roll.total === player.total), selection: {} };
  return fight.pending;
}

export function settlePyramidRound(fight, { attackBonus = false, bonusHit = 0, defensePoints = 0 } = {}) {
  const pending = fight.pending;
  if (fight.status !== 'fighting' || !pending) return null;
  if (!Number.isInteger(defensePoints) || defensePoints < 0 || !Number.isInteger(bonusHit) || bonusHit < 0) throw new RangeError('Invalid Fortune choice');
  if (attackBonus && pending.hits.length && !pending.hits[bonusHit]) throw new RangeError('Invalid bonus target');
  fight.pending = null;
  if (pending.retry) return { round: fight.round, playerLoss: 0, result: 'tie' };
  const e = fight.encounter;
  const spentAttack = attackBonus && pending.hits.length && e.mode !== 'tendrils' && fight.player.fortune > 0 ? 1 : 0;
  fight.player.fortune -= spentAttack;
  const stunned = e.stunning && pending.enemyHits > 0;
  const spentDefense = stunned ? 0 : Math.min(defensePoints, fight.player.fortune, pending.enemyDamage);
  fight.player.fortune -= spentDefense;
  const playerLoss = stunned ? 0 : pending.enemyDamage - spentDefense;
  fight.player.vitality = Math.max(0, fight.player.vitality - playerLoss);
  pending.hits.forEach((hit, index) => { e.foes[hit.index].vitality -= hit.damage + (index === bonusHit ? spentAttack : 0); });
  if (e.rabies) fight.bites += playerLoss;
  if (e.mode === 'scorpion' && pending.doubleHit) fight.poisoned = true;
  if (e.mode === 'troll' && pending.hits.some(hit => hit.damage + spentAttack > 0)) fight.regenerating = true;
  if (e.surprise === 'until-miss' && !pending.hits.length) fight.surpriseActive = false;
  fight.round += 1;
  if (Number.isInteger(e.surprise) && fight.round >= e.surprise) fight.surpriseActive = false;
  fight.surprisePenalty = undefined;
  fight.prepared = false;
  finishPyramidFight(fight);
  if (stunned && fight.status === 'fighting') fight.status = 'captured';
  return { round: fight.round, playerLoss, result: fight.status };
}

export function escapePyramidFight(fight) {
  if (fight.status !== 'fighting' || fight.pending || fight.encounter.escapeDamage === undefined) return false;
  fight.player.vitality = Math.max(0, fight.player.vitality - fight.encounter.escapeDamage);
  if (fight.player.vitality <= 0) { fight.status = 'loss'; return true; }
  if (fight.player.fortune < fight.encounter.escapeFortune) return false;
  fight.player.fortune -= fight.encounter.escapeFortune;
  fight.status = 'escaped';
  return true;
}

export function treatPyramidBites(fight, method) {
  if (fight.status !== 'win' || !fight.encounter.rabies || !fight.bites || fight.rabiesTreated) return false;
  if (!['potion', 'fortune', 'cauterize'].includes(method)) return false;
  if (method === 'fortune' && fight.player.fortune < 5) return false;
  if (method === 'fortune') fight.player.fortune -= 5;
  if (method === 'cauterize') fight.player.vitality = Math.max(0, fight.player.vitality - 3 * fight.bites);
  fight.rabiesTreated = true;
  if (fight.player.vitality <= 0) fight.status = 'loss';
  return true;
}
