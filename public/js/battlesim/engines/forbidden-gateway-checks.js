import { shadowsConflict, shadowsTest } from './forbidden-gateway.js';

const opposed = (section, name, attribute, rating, success, failure, extra = {}) =>
  ({ section, name, kind: 'opposed', attribute, rating, success, failure, ...extra });
const enemy = (section, name, attribute, rating, success, failure, extra = {}) =>
  opposed(section, name, attribute, rating, success, failure, { actor: 'enemy', ...extra });

export const SHADOWS_CHECKS = Object.freeze([
  enemy(2, 'quarryGrapple', 'strength', 6, 12, 33),
  opposed(18, 'madmanThrow', 'strength', 7, 40, 107),
  opposed(32, 'slimeHold', 'strength', 12, 53, 159),
  { section: 52, name: 'quarryMutantHit', kind: 'enemyAttribute', attribute: 'dexterity', rating: 5,
    success: 33, failure: 33, successDamage: { stamina: 2 }, death: 85 },
  enemy(130, 'madmanGrapple', 'strength', 9, 107, 61),
  opposed(153, 'madmanEscape', 'strength', 7, 178, 198, { successDamage: { stamina: 1 } }),
  enemy(159, 'lurkerKnockdown', 'strength', 10, 170, 32),
  opposed(183, 'truckThrow', 'strength', 7, 327, 268),
  enemy(186, 'mouthClub', 'strength', 10, 245, 157, { defenderRating: 7 }),
  opposed(208, 'driverThrow', 'strength', 7, 189, 169, { modifier: 2 }),
  opposed(212, 'mouthJam', 'dexterity', 10, 186, 278),
  opposed(217, 'tentacleHold', 'strength', 6, null, 232),
  opposed(228, 'driverGrapple', 'dexterity', 7, 208, 330),
  enemy(230, 'salamanderHypnosis', 'mentality', 10, 252, 262),
  enemy(232, 'tentaclePull', 'strength', 6, 259, 217),
  opposed(239, 'changelingHold', 'strength', 'player', 257, 316),
  opposed(252, 'salamanderResistance', 'mentality', 10, 262, 281, { failureMentality: 2 }),
  opposed(253, 'truckThrow', 'strength', 7, 327, 268),
  opposed(277, 'driverDagger', 'dexterity', 7, 247, 330),
  enemy(278, 'mouthCharge', 'strength', 10, 245, null, { failureDamage: { stamina: 2 } }),
  enemy(281, 'salamanderHypnosis', 'mentality', 10, 351, 372),
  opposed(295, 'mattockWrestle', 'strength', 7, 317, 268),
  enemy(300, 'mindFlail', 'mentality', 10, null, null, { successDamage: { endurance: 6 } }),
  { section: 316, name: 'changelingTalons', kind: 'enemyAttribute', attribute: 'dexterity', rating: 'player',
    success: 239, failure: 239, successDamage: { stamina: 2 }, death: 275 },
  opposed(321, 'tentacleHold', 'strength', 6, null, 345),
  opposed(327, 'truckGrip', 'strength', 7, 350, 366),
  enemy(352, 'mindFlail', 'mentality', 10, null, null, { successDamage: { endurance: 6 } }),
  opposed(364, 'driverGun', 'dexterity', 7, 356, 330),
  { section: 119, name: 'energyBolt', kind: 'enemyAttribute', attribute: 'mentality', rating: 7, success: 201, failure: null },
  { section: 205, name: 'mattockAttack', kind: 'enemyAttribute', attribute: 'dexterity', rating: 6, success: 105, failure: 73 },
  { section: 250, name: 'mattockAttack', kind: 'enemyAttribute', attribute: 'dexterity', rating: 6,
    success: 229, failure: 229, successDamage: { stamina: 6 }, death: 378 },
  { section: 330, name: 'spannerAttack', kind: 'enemyAttribute', attribute: 'dexterity', rating: 7, success: 310, failure: null },
  { section: 341, name: 'mattockAttack', kind: 'enemyAttribute', attribute: 'dexterity', rating: 6,
    success: 202, failure: 202, successDamage: { stamina: 6 }, death: 378 },
].map(spec => Object.freeze(spec)));

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
  const destination = player.stamina <= 0 ? spec.death ?? 219 : player.endurance <= 0 ? 233
    : result.success ? spec.success : spec.failure;
  return { ...result, section: spec.section, damage: damage ?? {}, destination };
}
