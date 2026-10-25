import { shadowsConflict, shadowsTest } from './forbidden-gateway.js';
import { SHADOWS_CHECKS, SHADOWS_RULES } from './forbidden-gateway-roster.js';
export { SHADOWS_CHECKS } from './forbidden-gateway-roster.js';

export function resolveShadowsCheck(player, section, random = Math.random, manualSuccess) {
  if (player.stamina <= 0 || player.endurance <= 0) throw new RangeError('The investigator is defeated');
  const spec = SHADOWS_CHECKS.find(row => row.section === Number(section));
  if (!spec) throw new RangeError('Unknown printed check');
  const rating = spec.rating === 'player' ? player[spec.attribute] : spec.rating;
  let result;
  if (typeof manualSuccess === 'boolean') result = { rolls: [], success: manualSuccess, manual: true };
  else if (spec.kind === 'enemyAttribute') result = shadowsTest({ [spec.attribute]: rating }, spec.attribute, random);
  else {
    const own = spec.defenderRating ?? player[spec.attribute] + (spec.modifier ?? 0);
    result = spec.actor === 'enemy' ? shadowsConflict(rating, own, random) : shadowsConflict(own, rating, random);
  }
  const damage = result.success ? spec.successDamage : spec.failureDamage;
  if (damage) for (const [key, amount] of Object.entries(damage)) player[key] = Math.max(0, player[key] - amount);
  if (!result.success && spec.failureMentality) player.mentality = Math.max(0, player.mentality - spec.failureMentality);
  const destination = player.stamina <= 0 ? spec.death ?? SHADOWS_RULES.death : player.endurance <= 0 ? SHADOWS_RULES.insanity
    : result.success ? spec.success : spec.failure;
  return { ...result, section: spec.section, damage: damage ?? {}, destination };
}
