import { rollAttack, tossCoins } from '../skyfall-rules.js';
import { editableSkyfallEncounter } from './opponents.js';

import { createRosterLoader } from '../../roster-data.js';

export let MINE_ENCOUNTERS = [];
export const loadRoster = createRosterLoader(523, 'MINE_ENCOUNTERS', rows => { MINE_ENCOUNTERS = rows; });

// Resolve older saved encounters without migrating their fields or pending rolls.
function npcRules(encounter) {
  return encounter.npcRules ?? MINE_ENCOUNTERS.find(e => String(e.section) === String(encounter.section))?.npcRules ?? {};
}

export function createMineFight(section, player, { underclothes = false, failedLanding = false, ambush = false, fedusar = false, opponents } = {}) {
  const entry = editableSkyfallEncounter(MINE_ENCOUNTERS.find(e => String(e.section) === String(section)),
    section === 'custom' || MINE_ENCOUNTERS.some(e => String(e.section) === String(section)) ? opponents : undefined);
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
  const enemyDamage = embrace ? npcRules(e).embraceDamage : e.mode === 'troll' && higher.length === 2 ? npcRules(e).doubleHitDamage
    : higher.reduce((total, roll) => total + e.foes[roll.index].damage, 0);
  const mandatoryFortune = embrace ? npcRules(e).embraceFortune : higher.length && e.fear ? e.fear : 0;
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
  if (pending.embrace) fight.player.expertise -= npcRules(e).embraceExpertiseLoss;
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
