import { rollAttack, tossCoins } from '../skyfall-rules.js';

const foe = (name, expertise, vitality, damage) => ({ name, expertise, vitality, initialVitality: vitality, damage });
const yeti = (section, extra = {}) => ({ section, foes: [foe('Yeti', 12, 14, 2)], fear: 1, fortuneReward: 2, ...extra });
const bear = (section, extra = {}) => ({ section, foes: [foe('Great White Bear', 10, 14, 4)], fortuneReward: 2, ...extra });
const phantom = (section, expertise, extra = {}) => ({ section, foes: [foe('Lake Phantom', expertise, 8, 2)], mode: 'phantom', fortuneReward: 4, expertiseReward: 1, ...extra });
const spectre = (section, extra = {}) => ({ section, foes: [foe('Spectral Dwarf', 12, 20, 5)], weaponDamage: 1, ...extra });
const wolves = (section, count) => ({ section, foes: Array.from({ length: count }, (_, i) => foe(`Timberwolf ${i + 1}`, 11, 7, 2)), mode: 'all', fortuneReward: count, expertiseReward: 1 });

export const MINE_ENCOUNTERS = [
  yeti(17, { clothing: true }),
  { section: 36, foes: [foe('Mountain Troll', 11, 12, 1)], mode: 'troll', fortuneReward: 2 },
  wolves(41, 5), yeti(43, { cold: true }),
  bear(53, { sourceSection: 72, unarmed: 2 }), phantom(69, 14), bear(72),
  phantom(101, 10, { weaponDamage: 4 }),
  { section: 116, foes: [foe('Giant Goat', 20, 20, 3)], mode: 'goat' },
  yeti(123, { landing: true }), yeti(167, { clothing: true }),
  bear(189, { sourceSection: 72, ambush: true }),
  { section: 196, foes: [foe('Timberling', 16, 60, 2)], escapeDamage: 2 },
  yeti(207, { surprise: 2, clothing: true }),
  spectre(270, { fortuneReward: 2 }),
  spectre(293, { mode: 'immune', escapeFortune: 4, escapeAfter: 2 }),
  { section: 294, foes: [foe('Vretch 1', 13, 8, 2), foe('Vretch 2', 13, 8, 2)], mode: 'vretch', fortuneReward: 4, expertiseReward: 1 },
  spectre(324, { mode: 'immune', escapeFortune: 4, reverseFortune: 1, escapeAfter: 2 }),
  spectre(349, { fortuneReward: 3 }),
  { section: 361, foes: [foe('Timberling', 16, 60, 2)], fatalMargin: 8, escapeDamage: 2, escapeAfter: 1 },
  wolves(369, 4),
];

export function createMineFight(section, player, { underclothes = false, failedLanding = false, ambush = false, fedusar = false } = {}) {
  const entry = MINE_ENCOUNTERS.find(e => String(e.section) === String(section));
  if (!entry) throw new RangeError('Unknown encounter');
  for (const key of ['expertise', 'vitality', 'fortune', 'weaponDamage']) {
    if (!Number.isInteger(player[key])) throw new RangeError('Invalid character');
  }
  if (player.vitality <= 0 || player.vitality > 20 || player.fortune < 0 || player.weaponDamage < 0) throw new RangeError('Invalid character');
  if (entry.ambush && ambush && player.fortune < 1) throw new RangeError('Ambush requires Fortune');
  const encounter = structuredClone(entry);
  encounter.underclothes = entry.clothing && underclothes;
  encounter.failedLanding = entry.landing && failedLanding;
  encounter.fedusar = entry.mode === 'vretch' && fedusar;
  if (entry.ambush && ambush) encounter.surprise = 1;
  const fight = { version: 1, encounter, player: { ...player }, round: 0, pending: null, status: 'fighting',
    surpriseActive: Boolean(encounter.surprise), landingActive: Boolean(encounter.failedLanding) };
  if (entry.ambush && ambush) fight.player.fortune -= 1;
  return fight;
}

export function finishMineFight(fight) {
  if (fight.status !== 'fighting') return;
  if (fight.player.vitality <= 0) { fight.status = 'loss'; return; }
  if (fight.encounter.foes.every(foe => foe.vitality <= 0)) {
    fight.status = 'win';
    fight.player.fortune += fight.encounter.fortuneReward ?? 0;
    fight.player.expertise += fight.encounter.expertiseReward ?? 0;
  }
}

export function rollMineRound(fight, target = 0, random = Math.random) {
  if (fight.status !== 'fighting' || fight.pending) return null;
  const e = fight.encounter;
  const active = e.foes.flatMap((foe, index) => foe.vitality > 0 ? [{ foe, index }] : []);
  if (!active.length) { finishMineFight(fight); return null; }
  if (!active.some(row => row.index === target)) target = active[0].index;
  const surprise = fight.surpriseActive ? (fight.surprisePenalty ??= tossCoins(3, random).tails) : 0;
  const landing = fight.landingActive ? (fight.landingPenalty ??= tossCoins(3, random).tails) : 0;
  const unarmed = fight.round < (e.unarmed ?? 0);
  const player = rollAttack(fight.player.expertise - (e.underclothes ? 1 : 0) - (unarmed ? 2 : 0), landing, random);
  const paired = ['troll', 'phantom'].includes(e.mode);
  const rolls = (paired ? [active[0], active[0]] : active).map(row => ({ ...rollAttack(row.foe.expertise, surprise, random), index: row.index }));
  const higher = rolls.filter(roll => roll.total > player.total);
  const lower = rolls.filter(roll => roll.total < player.total);
  const damage = e.weaponDamage ?? fight.player.weaponDamage;
  const hits = [];
  if (!unarmed && e.mode !== 'immune') {
    if (e.mode === 'all') lower.forEach(roll => hits.push({ index: roll.index, damage }));
    else if (paired || e.mode === 'vretch') {
      if (lower.length === rolls.length) lower.filter((roll, i) => !i || roll.index !== lower[i - 1].index)
        .forEach(roll => hits.push({ index: roll.index, damage: e.fedusar ? e.foes[roll.index].vitality : damage }));
    } else if (lower.some(roll => roll.index === target)) hits.push({ index: target, damage });
  }
  const embrace = e.mode === 'phantom' && higher.length === 2;
  const enemyDamage = embrace ? 8 : e.mode === 'troll' && higher.length === 2 ? 3
    : higher.reduce((total, roll) => total + e.foes[roll.index].damage, 0);
  const mandatoryFortune = embrace ? 4 : higher.length && e.fear ? e.fear : 0;
  const fatal = Boolean(e.fatalMargin && higher.some(roll => roll.total - player.total >= e.fatalMargin));
  fight.pending = { player, rolls, hits, enemyDamage, enemyHits: higher.length, mandatoryFortune, embrace, fatal,
    retry: rolls.every(roll => roll.total === player.total), selection: {} };
  return fight.pending;
}

export function settleMineRound(fight, { attackBonus = false, bonusHit = 0, defensePoints = 0 } = {}) {
  const pending = fight.pending;
  if (fight.status !== 'fighting' || !pending) return null;
  if (!Number.isInteger(defensePoints) || defensePoints < 0 || !Number.isInteger(bonusHit) || bonusHit < 0) throw new RangeError('Invalid Fortune choice');
  if (attackBonus && pending.hits.length && !pending.hits[bonusHit]) throw new RangeError('Invalid bonus target');
  fight.pending = null;
  if (pending.retry) return { round: fight.round, playerLoss: 0, result: 'tie' };
  const e = fight.encounter;
  const mandatory = Math.min(fight.player.fortune, pending.mandatoryFortune);
  fight.player.fortune -= mandatory;
  if (pending.embrace) fight.player.expertise -= 1;
  const fatal = pending.fatal || mandatory < pending.mandatoryFortune;
  const spentAttack = attackBonus && pending.hits.length && fight.player.fortune > 0 ? 1 : 0;
  fight.player.fortune -= spentAttack;
  const spentDefense = Math.min(defensePoints, fight.player.fortune, pending.enemyDamage);
  fight.player.fortune -= spentDefense;
  let playerLoss = pending.enemyDamage - spentDefense;
  fight.round += 1;
  if (e.cold && fight.round % 4 === 0) playerLoss += 1;
  fight.player.vitality = Math.max(0, fight.player.vitality - playerLoss);
  pending.hits.forEach((hit, index) => { e.foes[hit.index].vitality = Math.max(0, e.foes[hit.index].vitality - hit.damage - (index === bonusHit ? spentAttack : 0)); });
  if (fight.landingActive && pending.hits.length) fight.landingActive = false;
  if (Number.isInteger(e.surprise) && fight.round >= e.surprise) fight.surpriseActive = false;
  fight.surprisePenalty = undefined;
  fight.landingPenalty = undefined;
  if (fatal) { fight.status = 'loss'; fight.player.vitality = 0; }
  finishMineFight(fight);
  if (e.mode === 'goat' && pending.enemyHits && fight.status === 'fighting') fight.status = 'knocked';
  return { round: fight.round, playerLoss, mandatoryFortune: mandatory, result: fight.status };
}

export function escapeMineFight(fight, reverse = false) {
  const e = fight.encounter;
  const cost = reverse && e.reverseFortune !== undefined ? e.reverseFortune : e.escapeFortune ?? 0;
  if (fight.status !== 'fighting' || fight.pending || fight.round < (e.escapeAfter ?? 0)
      || e.escapeDamage === undefined && e.escapeFortune === undefined || fight.player.fortune < cost) return false;
  fight.player.fortune -= cost;
  fight.player.vitality = Math.max(0, fight.player.vitality - (e.escapeDamage ?? 0));
  fight.status = fight.player.vitality > 0 ? 'escaped' : 'loss';
  return true;
}
