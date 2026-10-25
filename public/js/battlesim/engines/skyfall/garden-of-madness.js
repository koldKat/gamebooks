import { rollAttack, tossCoins } from '../skyfall-rules.js';
import { editableSkyfallEncounter } from './opponents.js';

import { createRosterLoader } from '../../roster-data.js';

export let GARDEN_ENCOUNTERS = [];
export const loadRoster = createRosterLoader(524, 'GARDEN_ENCOUNTERS', rows => { GARDEN_ENCOUNTERS = rows; });

export function gardenSetupRules() {
  return GARDEN_ENCOUNTERS.find(entry => entry.setupRules)?.setupRules;
}

// Older encounters keep their saved fields and pending results. Missing settings
// are read from the loaded catalog without migrating or resetting the fight.
function npcRules(encounter) {
  return encounter.npcRules ?? GARDEN_ENCOUNTERS.find(entry => String(entry.section) === String(encounter.section))?.npcRules ?? {};
}

export function createGardenFight(section, player, { surprise = 'none', daggerTaken = false, companions, diseased = false, previous = null, opponents } = {}) {
  const source = editableSkyfallEncounter(GARDEN_ENCOUNTERS.find(e => String(e.section) === String(section)),
    section === 'custom' || GARDEN_ENCOUNTERS.some(e => String(e.section) === String(section)) ? opponents : undefined);
  const setup = gardenSetupRules();
  if (companions === undefined) companions = setup.companionChoices[0].rounds;
  if (!source || !['none', 'player', 'enemy'].includes(surprise) || !setup.companionChoices.some(choice => choice.rounds === companions)) throw new RangeError('Invalid encounter');
  for (const key of ['expertise', 'vitality', 'fortune', 'weaponDamage']) if (!Number.isInteger(player[key])) throw new RangeError('Invalid character');
  if (player.vitality <= 0 || player.vitality > 20 || player.fortune < 0 || player.weaponDamage < 0) throw new RangeError('Invalid character');
  const encounter = structuredClone(source);
  if (source.companionRounds) { encounter.escapeAfter = companions; encounter.rounds = companions; }
  const fight = { version: 1, encounter, player: { ...player }, round: 0, pending: null, status: 'fighting',
    diseased: diseased || !!source.startsDiseased, defeated: 0, flowers: setup.initialFlowers, daggerTaken,
    surprise: source.enemySurprise ? 'enemy' : source.playerSurprise ? 'player'
      : source.selectableSurprise ? surprise : 'none' };
  // Continuation sections carry the creature's wounds, not its original health.
  if (previous?.encounter && source.carryFrom?.includes(Number(previous.encounter.section)) && previous.encounter.foes[0].vitality > 0) {
    encounter.foes[0].vitality = previous.encounter.foes[0].vitality;
    fight.diseased ||= previous.diseased;
  }
  return fight;
}

export function finishGardenFight(fight) {
  if (fight.status !== 'fighting') return;
  if (fight.player.vitality <= 0) { fight.status = 'loss'; return; }
  const e = fight.encounter;
  if (e.foes.every(foe => foe.vitality !== null && foe.vitality <= 0)) {
    if (['sequential', 'tentacles'].includes(e.mode) && ++fight.defeated < e.count) {
      e.foes.forEach(foe => { foe.vitality = foe.initialVitality; });
      return;
    }
    // The third Hobgoblin still arrives even if the initial pair died early.
    if (e.mode === 'reinforcement' && !fight.reinforced) return;
    fight.status = 'win';
    fight.player.fortune += e.fortuneReward ?? 0;
    fight.player.expertise += e.expertiseReward ?? 0;
  }
}

export function rollGardenRound(fight, target = 0, random = Math.random) {
  if (fight.status !== 'fighting' || fight.pending) return null;
  const e = fight.encounter;
  let active = e.foes.flatMap((foe, index) => foe.vitality === null || foe.vitality > 0 ? [{ foe, index }] : []);
  if (e.mode === 'random' && active.length > 1) active = [active[tossCoins(1, random).heads]];
  if (!active.some(row => row.index === target)) target = active[0]?.index ?? 0;
  const surprise = fight.surprise !== 'none' ? (fight.surprisePenalty ??= tossCoins(3, random).tails) : 0;
  const dodge = e.mode === 'slug' ? tossCoins(npcRules(e).dodgeCoins, random) : null;
  const player = dodge ? { ...dodge, total: fight.player.expertise - dodge.tails }
    : rollAttack(fight.player.expertise - (e.penalty ?? 0), fight.surprise === 'enemy' ? surprise : 0, random);
  const rolls = e.mode === 'slug' ? [] : active.map(row => ({ ...rollAttack(row.foe.expertise, fight.surprise === 'player' ? surprise : 0, random), index: row.index }));
  const lower = rolls.filter(roll => roll.total < player.total);
  const higher = rolls.filter(roll => roll.total > player.total);
  let enemyDamage = e.mode === 'slug' ? player.total < npcRules(e).spittleThreshold ? npcRules(e).spittleDamage : 0 : higher.reduce((n, r) => n + (e.foes[r.index].damage ?? 0), 0);
  const hits = [];
  const unarmed = fight.round < (e.unarmed ?? 0);
  if (e.mode === 'gaps') enemyDamage = npcRules(e).roundDamage;
  else if (e.mode === 'flowers') enemyDamage = fight.flowers - (lower.length ? 1 : 0);
  else if (!unarmed && !['armour', 'princess'].includes(e.mode)) {
    if (e.mode === 'slug') hits.push({ index: 0, damage: fight.player.weaponDamage });
    else if (['all', 'reinforcement'].includes(e.mode)) lower.forEach(r => hits.push({ index: r.index, damage: fight.player.weaponDamage }));
    else if (lower.some(r => r.index === target)) hits.push({ index: target, damage: fight.player.weaponDamage });
  }
  fight.pending = { player, rolls, hits, enemyDamage, enemyHits: higher.length,
    playerHit: lower.length > 0, target, mandatoryFortune: e.mode === 'tentacles' ? higher.length : 0,
    retry: !['slug', 'gaps'].includes(e.mode) && rolls.length > 0 && rolls.every(r => r.total === player.total), selection: {} };
  return fight.pending;
}

export function settleGardenRound(fight, { attackBonus = false, bonusHit = 0, defensePoints = 0, preventSpecial = false } = {}) {
  const p = fight.pending;
  if (fight.status !== 'fighting' || !p) return null;
  if (!Number.isInteger(defensePoints) || defensePoints < 0 || !Number.isInteger(bonusHit) || bonusHit < 0
      || attackBonus && p.hits.length && !p.hits[bonusHit]) throw new RangeError('Invalid Fortune choice');
  fight.pending = null;
  if (p.retry) return { round: fight.round, playerLoss: 0, result: 'tie' };
  const e = fight.encounter;
  const mandatory = Math.min(fight.player.fortune, p.mandatoryFortune);
  fight.player.fortune -= mandatory;
  let fatal = mandatory < p.mandatoryFortune;
  const special = Boolean(preventSpecial && ['wyvern', 'crossbow'].includes(e.mode) && fight.player.fortune > 0);
  if (special) fight.player.fortune -= 1;
  const attack = Boolean(attackBonus && p.hits.length && fight.player.fortune > 0);
  if (attack) fight.player.fortune -= 1;
  const defense = Math.min(defensePoints, fight.player.fortune, p.enemyDamage);
  fight.player.fortune -= defense;
  let loss = p.enemyDamage - defense;
  if (e.mode === 'wyvern' && !special) loss += e.breath;
  if (e.mode === 'crossbow' && !special) loss += npcRules(e).boltDamage;
  fight.player.vitality = Math.max(0, fight.player.vitality - loss);
  p.hits.forEach((hit, i) => {
    e.foes[hit.index].vitality = Math.max(0, e.foes[hit.index].vitality - hit.damage - (attack && i === bonusHit ? 1 : 0));
  });
  if (e.mode === 'crossbow' && special) e.foes[0].vitality = Math.max(0, e.foes[0].vitality - npcRules(e).boltDamage);
  if (e.mode === 'flowers' && p.playerHit) fight.flowers -= 1;
  fight.round += 1;
  fight.surprise = e.lightning && !special ? 'enemy' : 'none';
  fight.surprisePenalty = undefined;
  if (e.mode === 'princess' && p.enemyHits) fatal = true;
  if (fatal) { fight.player.vitality = 0; fight.status = 'loss'; }
  if (e.mode === 'reinforcement' && fight.round >= npcRules(e).reinforcementRound && !fight.reinforced) {
    fight.reinforced = true;
    const reinforcements = e.reinforcements ?? GARDEN_ENCOUNTERS.find(entry => entry.section === e.section)?.reinforcements;
    e.foes.push(structuredClone(reinforcements[fight.daggerTaken ? 'disarmed' : 'armed']));
  }
  finishGardenFight(fight);
  if (fight.status === 'fighting') {
    if (e.disease && p.enemyHits && !fight.diseased) { fight.diseased = true; fight.status = 'infected'; }
    else if (e.mode === 'armour' && p.playerHit) fight.status = 'dispelled';
    else if (e.mode === 'princess' && p.playerHit) fight.status = 'stunned';
    else if (e.mode === 'edge') fight.status = 'fell';
    else if (e.rounds && fight.round >= e.rounds) {
      if (e.reinforcementsFatal) { fight.player.vitality = 0; fight.status = 'loss'; }
      else fight.status = 'survived';
    }
  }
  return { round: fight.round, playerLoss: loss, result: fight.status };
}

export function escapeGardenFight(fight) {
  const e = fight.encounter;
  if (fight.status !== 'fighting' || fight.pending || e.escapeDamage === undefined || fight.round < (e.escapeAfter ?? 0)) return false;
  fight.player.vitality = Math.max(0, fight.player.vitality - e.escapeDamage);
  fight.status = fight.player.vitality > 0 ? 'escaped' : 'loss';
  return true;
}

export function takeGardenHalberd(fight) {
  const damage = GARDEN_ENCOUNTERS.find(entry => String(entry.section) === String(fight.encounter.section))?.fallenWeaponDamage;
  if (fight.status !== 'fighting' || fight.pending || !damage || !fight.encounter.foes.some(foe => foe.vitality <= 0)) return false;
  fight.player.weaponDamage = damage;
  return true;
}
