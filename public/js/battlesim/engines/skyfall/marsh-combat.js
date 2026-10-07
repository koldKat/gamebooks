import { rollAttack, tossCoins } from '../skyfall-rules.js';
import { expandMarshEncounter } from './monsters-of-the-marsh.js';

const integer = (value, minimum = 0) => Number.isInteger(value) && value >= minimum;
const alive = fight => fight.encounter.foes.flatMap((foe, index) => foe.vitality > 0 ? [index] : []);

export function createMarshFight(section, player, options = {}) {
  if (!integer(player.expertise, -100) || !integer(player.vitality) || !integer(player.fortune)
      || !integer(player.weaponDamage)) throw new RangeError('Invalid character');
  const encounter = expandMarshEncounter(section, options);
  const companions = options.companions ?? [];
  if (!Array.isArray(companions) || companions.length > 20
      || companions.some(ally => !integer(ally.damage))) throw new RangeError('Invalid companions');
  return {
    version: 1, encounter, player: { ...player }, round: 0,
    status: player.vitality > 0 ? 'fighting' : 'loss',
    surpriseActive: Boolean(encounter.surprise), transformed: false,
    cuttingWeapon: options.cuttingWeapon !== false,
    poisonProtected: options.poisonProtected === true,
    companions: companions.map(ally => ({ expertise: 11, damage: ally.damage })),
    pending: null,
  };
}

function surpriseSide(fight) {
  const e = fight.encounter;
  if (!fight.surpriseActive || fight.transformed) return null;
  if (e.repeatSurpriseOnPlayerHit || e.repeatSurpriseOnEnemyHit) return e.surprise;
  return fight.round < (e.surpriseRounds ?? 0) ? e.surprise : null;
}

// Rolls are stored before Fortune is chosen; reopening the panel cannot reroll them.
export function rollMarshRound(fight, target, random = Math.random) {
  if (fight.status !== 'fighting' || fight.pending) return null;
  const e = fight.encounter;
  const survivors = alive(fight);
  if (!survivors.includes(target)) throw new RangeError('Select a living opponent');
  if (e.mode === 'sequential' && target !== survivors[0]) throw new RangeError('Fight these enemies in order');
  const nextRound = fight.round + 1;
  if (e.breathInterval && nextRound % e.breathInterval === 0) {
    fight.pending = { round: nextRound, target, hits: [], enemyDamage: survivors.length * e.breathDamagePerEnemy,
      enemyHits: survivors.length, events: ['surface'], retry: false };
    return fight.pending;
  }
  const surprise = surpriseSide(fight);
  const retry = fight.retry;
  const penalties = retry?.penalties ? { ...retry.penalties } : {};
  if (surprise === 'enemy' && penalties.player === undefined) penalties.player = tossCoins(3, random).tails;
  const player = rollAttack(fight.player.expertise + (e.expertiseModifier ?? 0), penalties.player ?? 0, random);
  const group = ['one-target', 'all', 'arrows', 'sphinx'].includes(e.mode);
  const indices = group ? survivors : [target];
  const rolls = [];
  for (const index of indices) {
    if (surprise === 'player' && penalties[index] === undefined) penalties[index] = tossCoins(3, random).tails;
    const foe = e.foes[index];
    const expertise = fight.transformed ? e.transformedExpertise : foe.expertise;
    const attempts = e.mode === 'sphinx' ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const roll = rollAttack(expertise, penalties[index] ?? 0, random);
      rolls.push({ index, ...roll });
    }
  }
  const wins = rolls.filter(roll => player.total > roll.total);
  const losses = rolls.filter(roll => player.total < roll.total);
  let weaponDamage = e.weaponDamage ?? fight.player.weaponDamage;
  if (e.firstRoundWeaponDamage !== undefined) weaponDamage = fight.round === 0 ? e.firstRoundWeaponDamage : e.laterWeaponDamage;
  if (e.cuttingOnly && !fight.cuttingWeapon) weaponDamage = 0;
  let hits = wins.map(roll => ({ index: roll.index, damage: weaponDamage }));
  if (['one-target', 'sphinx'].includes(e.mode)) hits = wins.length ? [{ index: target, damage: weaponDamage }] : [];
  if (e.mode === 'arrows') hits = [];
  let enemyHits = losses.length;
  let enemyDamage = losses.reduce((sum, roll) => sum + e.foes[roll.index].damage, 0);
  if (e.mode === 'sphinx' && enemyHits === 2) enemyDamage += 4;
  if (e.enemyHitsOnZeroHeads && player.heads === 0 && enemyHits === 0) {
    enemyHits = 1;
    enemyDamage = e.foes[target].damage;
  }
  if (e.mode === 'ambush') {
    enemyHits = 0;
    enemyDamage = 0;
    for (const ally of fight.companions) {
      const roll = rollAttack(ally.expertise, 0, random);
      if (roll.total > rolls[0].total) hits.push({ index: target, damage: ally.damage });
    }
  }
  const hasPlayerHit = wins.length > 0;
  const specialMiss = e.fortuneOnMiss || e.transformOnMiss || e.repeatSurpriseOnEnemyHit;
  const tied = rolls.length === 1 && player.total === rolls[0].total;
  const plan = {
    round: nextRound, target, player, rolls, penalties, surprise, hits, enemyDamage, enemyHits,
    flankDamage: e.mode === 'halberds' ? (survivors.length - 1) * 3 : 0,
    events: [], hasPlayerHit, retry: tied && !specialMiss && !e.enemyHitsOnZeroHeads
      && !['arrows', 'ambush', 'sphinx', 'all', 'one-target'].includes(e.mode),
  };
  fight.pending = plan;
  return plan;
}

export function settleMarshRound(fight, { attackBonus = false, bonusHit = 0, defensePoints = 0, blockFlanks = false } = {}) {
  const plan = fight.pending;
  if (!plan || fight.status !== 'fighting') return null;
  if (!integer(defensePoints) || !integer(bonusHit)) throw new RangeError('Invalid Fortune choice');
  if (plan.retry) {
    fight.retry = { penalties: plan.penalties };
    fight.pending = null;
    return { ...plan, result: 'tie', playerLoss: 0, fortuneSpent: 0 };
  }
  const e = fight.encounter;
  const originalFortune = fight.player.fortune;
  const originalVitality = fight.player.vitality;
  let fatal = false;
  if (e.poisonFortune && plan.enemyHits && !fight.poisonProtected) {
    const required = plan.enemyHits * e.poisonFortune;
    if (fight.player.fortune < required) fatal = true;
    else fight.player.fortune -= required;
  }
  if (e.fortuneOnMiss && !plan.hasPlayerHit) {
    if (fight.player.fortune >= e.fortuneOnMiss) fight.player.fortune -= e.fortuneOnMiss;
    else {
      fight.player.vitality = Math.max(0, fight.player.vitality - 5);
      fight.status = fight.player.vitality > 0 ? 'fall' : 'loss';
    }
  }
  let flankDamage = plan.flankDamage ?? 0;
  if (flankDamage && blockFlanks && fight.player.fortune >= e.flankFortune) {
    fight.player.fortune -= e.flankFortune;
    flankDamage = 0;
  }
  const rawDamage = plan.enemyDamage + flankDamage;
  const defensiveSpend = Math.min(defensePoints, fight.player.fortune, rawDamage);
  fight.player.fortune -= defensiveSpend;
  fight.player.vitality = Math.max(0, fight.player.vitality - (rawDamage - defensiveSpend));
  const bonus = attackBonus && fight.player.fortune > 0 && plan.hits[bonusHit]
    && (!e.cuttingOnly || fight.cuttingWeapon) ? 1 : 0;
  fight.player.fortune -= bonus;
  const killedBefore = e.foes.filter(foe => foe.vitality <= 0).length;
  plan.hits.forEach((hit, index) => {
    const foe = e.foes[hit.index];
    foe.vitality = Math.max(0, foe.vitality - hit.damage - (index === bonusHit ? bonus : 0));
  });
  const killed = e.foes.filter(foe => foe.vitality <= 0).length;
  if (e.fortunePerKill && fight.player.vitality > 0 && !fatal) fight.player.fortune += (killed - killedBefore) * e.fortunePerKill;
  fight.round = plan.round;
  if (fight.transformed && alive(fight).length) fatal = true;
  if (e.transformOnMiss && !fight.transformed && !plan.hasPlayerHit) fight.transformed = true;
  if (e.repeatSurpriseOnPlayerHit && !plan.hasPlayerHit) fight.surpriseActive = false;
  if (e.repeatSurpriseOnEnemyHit && !plan.enemyHits) fight.surpriseActive = false;
  if (fatal) fight.player.vitality = 0;
  if (fight.player.vitality <= 0) fight.status = 'loss';
  else if (!alive(fight).length) fight.status = 'win';
  else if (e.enemyHitEscapes && plan.enemyHits) fight.status = 'escaped-enemy';
  else if (e.stopOnPlayerDamage && fight.player.vitality < originalVitality) fight.status = 'wounded';
  else if (e.stopAfterKills && killed >= e.stopAfterKills) fight.status = 'withdrawal';
  else if (e.roundLimit && fight.round >= e.roundLimit) {
    fight.status = e.roundLimitDeath ? 'loss' : e.mode === 'arrows' ? 'survived' : 'round-limit';
    if (e.roundLimitDeath) fight.player.vitality = 0;
  }
  fight.pending = null;
  delete fight.retry;
  return { ...plan, playerLoss: originalVitality - fight.player.vitality,
    fortuneSpent: originalFortune - fight.player.fortune, result: fight.status };
}

export function escapeMarshTree(fight) {
  const e = fight.encounter;
  if (fight.status !== 'fighting' || fight.pending || !e.treeEscapeFortune
      || fight.player.fortune < e.treeEscapeFortune) return false;
  fight.player.fortune -= e.treeEscapeFortune;
  fight.player.vitality = Math.max(0, fight.player.vitality - alive(fight).length * e.treeEscapeDamagePerEnemy);
  fight.status = fight.player.vitality > 0 ? 'escaped-tree' : 'loss';
  return true;
}

export function escapeMarshCanoe(fight) {
  const e = fight.encounter;
  if (fight.status !== 'fighting' || fight.pending || !e.escapeAfterKills
      || e.foes.length - alive(fight).length < e.escapeAfterKills) return false;
  fight.status = 'escaped-canoe';
  return true;
}
