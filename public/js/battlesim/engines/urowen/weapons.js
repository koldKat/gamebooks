export const UROWEN_WEAPON_EFFECTS = Object.freeze({
  custom: {},
  critical: {bleedOn: 6, bleeding: 1},
  trident: {bleedOn: 6, bleeding: 2},
  bonebreaker: {boneOn: 6},
  lockOn: {headLock: true},
  scepter: {bleedOn: 5, bleeding: 1, boneOn: 6, headLock: true},
});

export function applyUrowenWeaponHit(enemy, weapon, {rawDamage, location, damage}) {
  const next = structuredClone(enemy);
  if (damage <= 0) return next;
  const effects = UROWEN_WEAPON_EFFECTS[weapon.effect ?? 'custom'];
  if (!effects) throw new RangeError('Unknown weapon effect');
  if (rawDamage === effects.bleedOn) next.weaponBleeding = Math.max(next.weaponBleeding ?? 0, effects.bleeding);
  if (rawDamage === effects.boneOn) next.brokenBones = (next.brokenBones ?? 0) + 1;
  if (effects.headLock && location === 6) next.headLocked = true;
  return next;
}
