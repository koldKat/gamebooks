import { legendaryInteger } from './character.js';
import { requireLegendaryLocation } from './locations.js';

export function requireLegendaryTarget(fight, memberIndex, targetIndex, magic = false, damaging = true, hero = fight.party[memberIndex]) {
  const enemy = fight.enemies[targetIndex];
  requireLegendaryLocation(fight, memberIndex, enemy, magic);
  if (enemy.untargetable) throw new RangeError('This opponent is occupied outside the fight');
  if (magic && enemy.spellTargetForbidden) throw new RangeError('Spells would kill this nonlethal target');
  if (magic && damaging && enemy.damageSpellImmune) throw new RangeError('This opponent is immune to damaging spells');
  if (!magic && enemy.magicOnly && !hero.magicalWeapon)
    throw new RangeError('This opponent requires magic or a magical weapon');
  const guard = enemy.weaponGuard;
  if (!magic && guard && enemy.weaponVulnerableRound !== fight.round &&
      guard.indices.filter(index => fight.enemies[index]?.health > 0).length >= guard.minimum)
    throw new RangeError('Defeat the guarding opponents before using a weapon against this target');
}

export function applyLegendaryOpponentDamage(fight, targetIndex) {
  const enemy = fight.enemies[targetIndex];
  if (enemy.halveAttackAtHalfHealth && !enemy.attackHalved && enemy.health <= enemy.initialHealth / 2) {
    enemy.attack = Math.floor(enemy.attack / 2);
    enemy.attackHalved = true;
  }
}

export function legendaryAutomaticDamage(fight, enemyIndex) {
  const enemy = fight.enemies[enemyIndex];
  if (enemy.automaticDamageGuard !== undefined && fight.enemies[enemy.automaticDamageGuard]?.health === 0) return 0;
  return legendaryInteger(enemy.automaticDamage ?? 0);
}
