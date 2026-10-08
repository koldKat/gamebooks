import { fireWolfHitThreshold, fireWolfProtection, FIRE_WOLF_WEAPONS } from './fire-wolf.js';
import { awardDemondoomSkill } from './demondoom-character.js';

export function demondoomDamage(attacker, defender, roll, options = {}) {
  if (!Number.isInteger(roll) || roll < 2 || roll > 12) throw new Error('Invalid attack roll');
  const threshold = options.hitThreshold ?? fireWolfHitThreshold(attacker);
  if (roll < threshold) return 0;
  if (!Number.isFinite(attacker.strength)) throw new Error('Source Strength must be supplied manually');
  const weapon = options.weapon ?? attacker.weapon;
  const bonus = FIRE_WOLF_WEAPONS[weapon] ?? weapon;
  if (!Number.isFinite(bonus) || bonus < 0) throw new Error('Source weapon damage must be supplied manually');
  const base = (roll - threshold) * 10 + Math.floor(attacker.strength / 8) + bonus;
  const damage = Math.max(0, base - fireWolfProtection(defender));
  return damage * (options.halfDamage ? .5 : 1);
}

export function applyDemondoomPhysicalDamage(player, enemy, damage, options = {}) {
  if (!Number.isFinite(damage) || damage < 0) throw new Error('Invalid damage');
  enemy.lifePoints -= damage;
  if (player.weapon === 'doombringer') {
    if (options.doomReversal) player.lifePoints -= damage;
    else player.lifePoints = Math.min(player.maxLife, player.lifePoints + damage);
  }
  return damage;
}

export function applyDemondoomSpellDamage(enemy, damage, options = {}) {
  if (!Number.isFinite(damage) || damage < 0) throw new Error('Invalid spell damage');
  const dealt = options.magicImmune ? 0 : damage * (options.doubleMagic ? 2 : 1);
  enemy.lifePoints -= dealt;
  return dealt;
}

export function demondoomOutcome(player, enemies, luckUsed = false) {
  if (player.lifePoints <= 0) return luckUsed ? 'loss' : 'death-luck';
  if (enemies.every(enemy => enemy.lifePoints <= 0)) return 'win';
  return null;
}

export function finishDemondoomFight(fight, outcome) {
  if (fight.outcome) return false;
  fight.outcome = outcome;
  if (outcome === 'win' && !fight.skillAwarded) {
    awardDemondoomSkill(fight.player);
    fight.skillAwarded = true;
  }
  return true;
}

export function demondoomRegentWeapon(round, die) {
  if (!Number.isInteger(round) || round < 1) throw new Error('Invalid combat round');
  if (round % 3 === 1) return 10;
  if (round % 3 === 2) return 20;
  if (!Number.isInteger(die) || die < 1 || die > 6) throw new Error('Roll one die for the Regent sword');
  return 20 * die;
}

export function demondoomAlternatingWeapon(round, first, second) {
  if (!Number.isInteger(round) || round < 1) throw new Error('Invalid combat round');
  return round % 2 ? first : second;
}

export function demondoomInitialOrder(player, enemy, playerRoll, enemyRoll) {
  for (const roll of [playerRoll, enemyRoll]) if (!Number.isInteger(roll) || roll < 2 || roll > 12) throw new Error('Invalid initiative roll');
  const score = (fighter, roll) => {
    if (![fighter.speed, fighter.courage, fighter.luck].every(Number.isFinite)) throw new Error('Missing initiative characteristic');
    return roll + fighter.speed + fighter.courage + fighter.luck;
  };
  const p = score(player, playerRoll), e = score(enemy, enemyRoll);
  return p === e ? null : p > e ? 'player' : 'enemy';
}

export function demondoomDeathLuck(player, roll) {
  if (!Number.isInteger(roll) || roll < 2 || roll > 12) throw new Error('Invalid Luck roll');
  return roll * 8 < player.luck;
}

export function useDemondoomTalisman(player, roll) {
  if (!Number.isInteger(roll) || roll < 2 || roll > 12) throw new Error('Invalid healing roll');
  if (player.lifePoints <= 0 || !player.healingTalisman || player.talismanUses >= 10 || player.talismanUsedAfterFight) return 0;
  const restored = Math.min(roll * 8, Math.max(0, player.maxLife - player.lifePoints));
  player.lifePoints += restored;
  player.talismanUses = (player.talismanUses ?? 0) + 1;
  player.talismanUsedAfterFight = true;
  return restored;
}
