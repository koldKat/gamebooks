import { createFireWolfFight, fireWolfDamage, fireWolfHitThreshold, resolveFireWolfDeathLuck, FIRE_WOLF_WEAPONS } from './fire-wolf.js';
import { cryptsChase } from './crypts-of-terror-encounters.js';

const die = random => Math.floor(random() * 6) + 1;
const dice = random => die(random) + die(random);
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export function createCryptsFight(prepared) {
  const fight = createFireWolfFight(prepared.player, prepared.enemies[0], prepared.options);
  fight.encounter = structuredClone(prepared.encounter);
  fight.enemies = structuredClone(prepared.enemies);
  fight.enemy = fight.enemies[0];
  fight.manualGroup = fight.enemies.length > 1;
  fight.manualRound = 0;
  fight.enemyDamage = fight.enemies.map(() => 0);
  fight.playerDamage = 0;
  fight.openingStrikes = [];
  fight.ratHits = 0;
  if (fight.encounter.rule === 'chase') {
    fight.chaseResult = cryptsChase(fight.player);
    if (!fight.chaseResult.fasterGuards) {
      fight.chaseEscape = true;
      fight.player.lifePoints -= fight.chaseResult.damage;
      fight.playerDamage = fight.chaseResult.damage;
      checkCryptsOutcome(fight);
    }
  }
  return fight;
}

function log(fight, event) {
  fight.log.push(event);
  if (fight.log.length > 150) fight.log.splice(0, fight.log.length - 150);
}

export function cryptsEnemyActive(fight, index) {
  const e = fight.enemies[index];
  if (!e || e.lifePoints <= 0 || e.escaped || e.paralysed) return false;
  if (fight.encounter.rule === 'chase' && fight.enemyDamage[index] > 150) return false;
  if (fight.encounter.rule === 'flee-20' && e.lifePoints < 20) return false;
  if (fight.encounter.rule === 'knockout-10' && e.lifePoints < 10) return false;
  if (fight.encounter.rule === 'prince-joins' && e.name === 'Harkaan Prince') {
    return fight.enemies.filter(e => e.name === 'Demonspawn' && e.lifePoints <= 0).length >= 2;
  }
  return true;
}

export function finishCryptsFight(fight, outcome) {
  fight.outcome = outcome;
  if (['win', 'defeat'].includes(outcome) && !fight.skillAwarded) {
    fight.player.skill = number(fight.player.skill) + 1;
    fight.player.maxLife += 1;
    fight.player.lifePoints = Math.min(fight.player.maxLife, Math.max(0, fight.player.lifePoints) + 1);
    fight.skillAwarded = true;
  }
}

const finish = finishCryptsFight;

export function resolveCryptsDeathLuck(fight, random = Math.random) {
  const success = resolveFireWolfDeathLuck(fight, random);
  if (success) {
    fight.enemyDamage.fill(0);
    fight.playerDamage = 0;
    fight.openingStrikes = [];
    fight.ratHits = 0;
    for (const enemy of fight.enemies) {
      delete enemy.escaped;
      delete enemy.paralysed;
    }
    if (fight.chaseEscape) {
      fight.player.lifePoints -= fight.chaseResult.damage;
      fight.playerDamage = fight.chaseResult.damage;
      checkCryptsOutcome(fight);
    }
  }
  return success;
}

export function checkCryptsOutcome(fight) {
  if (fight.outcome || fight.pending) return;
  const rule = fight.encounter.rule;
  if (fight.chaseEscape) {
    if (fight.player.lifePoints > 0) return finish(fight, 'avoided');
    if (fight.luckUsed) return finish(fight, 'loss');
    fight.pending = 'death-luck';
    return;
  }
  if (rule === 'knockout-10' && fight.enemies.some(e => e.lifePoints <= 0)) return finish(fight, 'loss');
  if (rule === 'first-blood') {
    if (fight.playerDamage >= 100 || fight.player.lifePoints <= 0) return finish(fight, 'defeat');
    if (fight.enemyDamage[0] >= 100 || fight.enemy.lifePoints <= 0) return finish(fight, 'win');
  }
  if (rule === 'nonfatal-50') {
    if (fight.player.lifePoints < 50) return finish(fight, 'defeat');
    if (fight.enemy.lifePoints < 50) return finish(fight, 'win');
  }
  if (rule === 'chase' && fight.playerDamage >= 150) return finish(fight, 'defeat');
  if (fight.player.lifePoints <= 0) {
    if (fight.luckUsed) finish(fight, 'loss');
    else fight.pending = 'death-luck';
    return;
  }
  if (fight.enemies.every((e,i) => !cryptsEnemyActive(fight,i))) {
    // An inactive Prince still has to be defeated after his guards.
    if (rule === 'prince-joins' && fight.enemies.some(e => e.name === 'Harkaan Prince' && e.lifePoints > 0)) return;
    finish(fight, fight.enemies.some(e => e.escaped || e.paralysed) ? 'avoided' : 'win');
  }
}

function enemyTurn(fight) {
  fight.enemyTurns += 1;
  if (!fight.manualGroup && fight.rest) {
    fight.rest -= 1;
    if (!fight.rest) fight.attacks = 0;
  }
}

export function rollCryptsAttack(fight, side = fight.turn, target = 0, random = Math.random) {
  if (fight.outcome || fight.pending || !['player','enemy'].includes(side)) return null;
  checkCryptsOutcome(fight);
  if (fight.outcome || fight.pending || !Number.isInteger(target) || !cryptsEnemyActive(fight,target)) return null;
  const enemy = fight.enemies[target];
  if (enemy.manualStats) return { error: 'manual-stats' };
  if (side === 'enemy' && enemy.manualWeapon && !(enemy.weapon in FIRE_WOLF_WEAPONS)
    && !(Number.isFinite(enemy.weapon) && enemy.weapon >= 0)) return { error: 'manual-weapon' };
  if (fight.encounter.rule === 'wizard-duel' || side === 'player' && enemy.magicOnly) return { error: 'magic-only' };
  if (!fight.manualGroup && fight.turn !== side) return { error: 'wrong-turn' };
  if (fight.openingStrikes.length < fight.options.enemyOpening) {
    if (side !== 'enemy' || fight.openingStrikes.includes(target)) return { error: 'enemy-opening' };
    fight.openingStrikes.push(target);
  }
  fight.enemy = enemy;
  if (side === 'player') {
    if (fight.paralysedPlayerRounds > 0) {
      fight.paralysedPlayerRounds -= 1; fight.turn = 'enemy';
      const event = { kind: 'paralysed', remaining: fight.paralysedPlayerRounds };log(fight,event);return event;
    }
    if (fight.rest || fight.attacks >= Math.floor(number(fight.player.stamina) / 10)) {
      if (!fight.rest) fight.rest = 2;
      fight.turn = 'enemy';const event = { kind: 'rest', remaining: fight.rest };log(fight,event);return event;
    }
    fight.attacks += 1; fight.round += 1;
    if (fight.player.weapon === 'doombringer' && !fight.options.suppressDoombringer) {
      fight.player.lifePoints -= 10;checkCryptsOutcome(fight);
      if (fight.pending || fight.outcome) return { kind: 'doombringer-cost' };
    }
  }
  const attacker = side === 'player' ? fight.player : enemy;
  const defender = side === 'player' ? enemy : fight.player;
  const roll = dice(random), threshold = fireWolfHitThreshold(attacker);
  let damage = fireWolfDamage(attacker,defender,roll);
  damage = Math.max(0,damage - number(attacker.magicFear));
  if (fight.options.cursedStone) damage *= side === 'player' ? .5 : 2;
  if (side === 'enemy' && fight.options.orbActive && enemy.spawn) damage = 0;
  defender.lifePoints -= damage;
  if (side === 'player') {
    fight.enemyDamage[target] += damage;
    if (fight.player.weapon === 'doombringer' && !fight.options.suppressDoombringer) {
      fight.player.lifePoints = Math.min(fight.player.maxLife,fight.player.lifePoints + damage);
    }
  } else {
    fight.playerDamage += damage;enemyTurn(fight);
    if (fight.encounter.rule === 'vampire') enemy.lifePoints += damage / 2;
    if (fight.encounter.rule === 'rat') {
      fight.ratHits = roll >= threshold ? fight.ratHits + 1 : 0;
      if (fight.ratHits >= 3) fight.player.ratDisease = true;
    }
  }
  const event = { kind: 'attack', side, target, roll, threshold, damage };log(fight,event);
  if (fight.encounter.rule === 'first-blood' && roll === 12) finish(fight,side === 'player' ? 'win' : 'defeat');
  else checkCryptsOutcome(fight);
  fight.turn = side === 'player' ? 'enemy' : 'player';
  return event;
}

export function advanceCryptsRound(fight) {
  if (!fight.manualGroup || fight.outcome || fight.pending) return false;
  fight.manualRound += 1;
  if (fight.rest) { fight.rest -= 1; if (!fight.rest) fight.attacks = 0; }
  return true;
}

export function applyCryptsWightHit(fight, damage) {
  if (fight.outcome || fight.pending || fight.encounter.rule !== 'wights' || !Number.isFinite(damage) || damage < 0) return false;
  const p = fight.player, keys = ['strength','speed','courage'];
  if (keys.some(key => p[key] <= 0)) p.lifePoints = 0;
  else {
    p.lifePoints -= damage;
    for (const key of keys) p[key] = Math.max(0,p[key] - 5);
  }
  fight.playerDamage += damage;enemyTurn(fight);checkCryptsOutcome(fight);
  log(fight,{kind:'wight-hit',damage});return true;
}

export function addCryptsReinforcements(fight, enemies) {
  if (fight.encounter.rule !== 'reinforcements' || fight.outcome !== 'win' || !Array.isArray(enemies) || enemies.length !== 2) return false;
  const incoming = structuredClone(enemies);
  if (incoming.some(e => e.name !== 'Fortress Guard' || !Number.isFinite(e.lifePoints) || e.lifePoints <= 0)) return false;
  fight.enemies.push(...incoming);fight.enemyDamage.push(0,0);fight.outcome = null;
  // These guards continue the encounter; each completed combat earns its stated Skill.
  fight.skillAwarded = false;
  return true;
}
