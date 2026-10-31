// Apply explicit automatic-opening and one-time weapon-swap rules to Fatemaster attacks.
import {damageOpponent, integer} from './rules.js';

export function validateFatemasterAttackEffects(rules, opponents) {
  if (rules.stopRemaining !== undefined) integer(rules.stopRemaining, 'remaining opponent threshold', 1, opponents.length - 1);
  if (rules.openingAutomaticHit !== undefined && typeof rules.openingAutomaticHit !== 'boolean') throw new Error('Invalid automatic opening');
  if (!rules.disarm) return;
  const rule = rules.disarm;
  if (!['raw', 'score'].includes(rule.basis) || typeof rule.requiresHit !== 'boolean') throw new Error('Choose the weapon-swap roll interpretation');
  integer(rule.threshold, 'weapon-swap threshold', 2, rule.basis === 'raw' ? 12 : 100);
  integer(rule.playerDamage, 'replacement weapon damage', 1);
  integer(rule.playerWeaponAttack, 'replacement weapon bonus', -100, 100);
  integer(rule.enemyAttackLoss, 'opponent weapon bonus loss', 0, 100);
}

export function disarmQualifies(fight, enemy, roll, score) {
  const rule = fight.rules.disarm;
  return Boolean(rule && !(fight.disarmedOpponentIds ?? []).includes(enemy.id)
    && (rule.basis === 'raw' ? roll.total : score) >= rule.threshold
    && (!rule.requiresHit || score >= 7));
}

export function applyFatemasterWeaponSwap(fight, enemy) {
  const rule = fight.rules.disarm;
  const oldWeapon = {damage: fight.player.damage, weaponAttack: fight.player.weaponAttack, weaponKind: fight.player.weaponKind};
  fight.player.damage = rule.playerDamage;
  fight.player.weaponAttack = rule.playerWeaponAttack;
  fight.player.weaponKind = 'magic';
  fight.player.weaponBroken = false;
  enemy.damage = oldWeapon.damage;
  enemy.attackBase -= rule.enemyAttackLoss;
  (fight.disarmedOpponentIds ??= []).push(enemy.id);
  fight.events.push({round: fight.round, type: 'weapon-swap', enemyId: enemy.id, oldWeapon,
    damage: rule.playerDamage, weaponAttack: rule.playerWeaponAttack, enemyAttackLoss: rule.enemyAttackLoss});
}

export function applyFatemasterAutomaticHit(fight, enemy) {
  const immune = fight.rules.requiresSpecialWeapon && fight.player.weaponKind === 'normal';
  const damage = immune ? 0 : fight.player.damage;
  damageOpponent(enemy, damage);
  if (enemy.condition === 'dormant') enemy.condition = 'active';
  fight.events.push({round: fight.round, type: 'automatic-opening-hit', enemyId: enemy.id, damage});
}
