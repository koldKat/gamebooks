import { rollAttack, tossCoins } from '../skyfall-rules.js';

const foe = (name, expertise, vitality, damage) => ({ name, expertise, vitality, initialVitality: vitality, damage });
const tripod = (section, extra = {}) => ({ section, foes: [foe('Tripodal Creature', 11, 30, 4)], disease: true, escapeDamage: 0, ...extra });
const flowers = section => ({ section, foes: [foe('Snapdragons', 12, null, 1)], mode: 'flowers', rounds: 4 });
const wyvern = (section, name, expertise, vitality, damage, breath, extra = {}) => ({ section,
  foes: [foe(name + ' Wyvern', expertise, vitality, damage)], mode: 'wyvern', breath,
  fortuneReward: expertise === 14 ? 5 : expertise === 13 ? 3 : 4, expertiseReward: 1, ...extra });

export const GARDEN_ENCOUNTERS = [
  wyvern(8, 'Red', 14, 15, 3, 5), wyvern(10, 'Green', 13, 9, 4, 1),
  wyvern(15, 'Blue', 11, 13, 5, 3, { lightning: true }),
  tripod(41, { enemySurprise: true, rounds: 1 }),
  { section: 60, foes: [foe('Pit Flower', 12, 2, 3)], mode: 'sequential', count: 4, penalty: 2, fortuneReward: 2, escapeDamage: 0 },
  tripod(105, { fortuneReward: 3 }),
  { section: 124, foes: [foe('Pit Flower', 12, 2, 3)], mode: 'edge', rounds: 1 },
  flowers(141), flowers(173), tripod(174, { disease: false, escapeDamage: undefined, fortuneReward: 2 }),
  { section: 160, foes: [foe('Hobgoblin', 9, 7, 1)], playerSurprise: true, fortuneReward: 1 },
  { section: 176, foes: [foe('Hobgoblin 1', 11, 7, 2), foe('Hobgoblin 2', 11, 7, 2)], mode: 'reinforcement' },
  { section: 177, foes: [foe('Spectral Guardian', 24, null, 2)], mode: 'gaps', rounds: 3, escapeDamage: 2 },
  { section: 180, foes: [foe('Spectral Guardian', 12, null, 2)], mode: 'armour', rounds: 3, escapeDamage: 2 },
  tripod(190, { unarmed: 2, rounds: 2 }),
  { section: 191, foes: Array.from({ length: 5 }, (_, i) => foe(`Guard ${i + 1}`, 10, 9, 2)), mode: 'all', penalty: 1, fortuneReward: 5, expertiseReward: 1 },
  wyvern(276, 'Red', 14, 15, 3, 5),
  { section: 287, foes: [foe('Giant Slug', null, 40, 4)], mode: 'slug', escapeDamage: 4, fortuneReward: 4 },
  { section: 291, foes: [foe('Greater Hobgoblin 1', 13, 11, 3), foe('Greater Hobgoblin 2', 13, 11, 3)], mode: 'random', fortuneReward: 4, expertiseReward: 1 },
  { section: 297, foes: [foe('Bodyguard 1', 14, 13, 4), foe('Bodyguard 2', 14, 13, 4)], mode: 'all', rounds: 10, reinforcementsFatal: true },
  { section: 325, foes: [foe('Faceless Warrior', 12, 10, 3)], fortuneReward: 2 },
  { section: 348, foes: [foe('Hobgoblin', 9, 7, 1)], mode: 'crossbow', playerSurprise: true },
  { section: 361, foes: [foe('Princess Wanda', 11, null, null)], mode: 'princess', enemySurprise: true },
  tripod(374, { rounds: 1, escapeAfter: 1, fortuneReward: 0 }),
  { section: 382, foes: [foe('Tentacle 1', 11, 5, null), foe('Tentacle 2', 11, 5, null)], mode: 'tentacles', count: 3 },
  tripod(384, { escapeAfter: 3, disease: true, fortuneReward: 0 }),
];

export function createGardenFight(section, player, { surprise = 'none', daggerTaken = false, companions = 3, diseased = false, previous = null } = {}) {
  const source = GARDEN_ENCOUNTERS.find(e => String(e.section) === String(section));
  if (!source || !['none', 'player', 'enemy'].includes(surprise) || ![3, 5, 8].includes(companions)) throw new RangeError('Invalid encounter');
  for (const key of ['expertise', 'vitality', 'fortune', 'weaponDamage']) if (!Number.isInteger(player[key])) throw new RangeError('Invalid character');
  if (player.vitality <= 0 || player.vitality > 20 || player.fortune < 0 || player.weaponDamage < 0) throw new RangeError('Invalid character');
  const encounter = structuredClone(source);
  if (section === 384 || String(section) === '384') { encounter.escapeAfter = companions; encounter.rounds = companions; }
  const fight = { version: 1, encounter, player: { ...player }, round: 0, pending: null, status: 'fighting',
    diseased: diseased || Number(section) === 174, defeated: 0, flowers: 5, daggerTaken,
    surprise: source.enemySurprise ? 'enemy' : source.playerSurprise ? 'player'
      : [8, 10, 15, 191].includes(Number(section)) ? surprise : 'none' };
  // Continuation sections carry the creature's wounds, not its original health.
  if (previous?.encounter && [41, 105, 190, 374, 384].includes(Number(previous.encounter.section))
      && [105, 384].includes(Number(section)) && previous.encounter.foes[0].vitality > 0) {
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
  const dodge = e.mode === 'slug' ? tossCoins(3, random) : null;
  const player = dodge ? { ...dodge, total: fight.player.expertise - dodge.tails }
    : rollAttack(fight.player.expertise - (e.penalty ?? 0), fight.surprise === 'enemy' ? surprise : 0, random);
  const rolls = e.mode === 'slug' ? [] : active.map(row => ({ ...rollAttack(row.foe.expertise, fight.surprise === 'player' ? surprise : 0, random), index: row.index }));
  const lower = rolls.filter(roll => roll.total < player.total);
  const higher = rolls.filter(roll => roll.total > player.total);
  let enemyDamage = e.mode === 'slug' ? player.total < 12 ? 4 : 0 : higher.reduce((n, r) => n + (e.foes[r.index].damage ?? 0), 0);
  const hits = [];
  const unarmed = fight.round < (e.unarmed ?? 0);
  if (e.mode === 'gaps') enemyDamage = 2;
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
  if (e.mode === 'crossbow' && !special) loss += 2;
  fight.player.vitality = Math.max(0, fight.player.vitality - loss);
  p.hits.forEach((hit, i) => {
    e.foes[hit.index].vitality = Math.max(0, e.foes[hit.index].vitality - hit.damage - (attack && i === bonusHit ? 1 : 0));
  });
  if (e.mode === 'crossbow' && special) e.foes[0].vitality = Math.max(0, e.foes[0].vitality - 2);
  if (e.mode === 'flowers' && p.playerHit) fight.flowers -= 1;
  fight.round += 1;
  fight.surprise = e.lightning && !special ? 'enemy' : 'none';
  fight.surprisePenalty = undefined;
  if (e.mode === 'princess' && p.enemyHits) fatal = true;
  if (fatal) { fight.player.vitality = 0; fight.status = 'loss'; }
  if (e.mode === 'reinforcement' && fight.round >= 2 && !fight.reinforced) {
    fight.reinforced = true;
    e.foes.push(foe('Hobgoblin 3', fight.daggerTaken ? 9 : 11, 7, 1));
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
  if (fight.status !== 'fighting' || fight.pending || Number(fight.encounter.section) !== 297 || !fight.encounter.foes.some(foe => foe.vitality <= 0)) return false;
  fight.player.weaponDamage = 4;
  return true;
}
