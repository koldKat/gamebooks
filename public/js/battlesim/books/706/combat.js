import { POSITIONS, DESERT_RULES } from './definition.js';

export function enduranceAfter(current, change) {
  if (!Number.isFinite(current) || !Number.isFinite(change)) throw new RangeError('Invalid endurance');
  const endurance = Math.min(40, current + change);
  return { endurance, dead: endurance < 0 };
}

function integer(value, maximum = 1000000) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) throw new RangeError('Invalid force or equipment count');
  return value;
}

export function defendShip(deployment, equipment = {}) {
  const owned = { whip: Boolean(equipment.whip), chestnuts: Boolean(equipment.chestnuts), poison: Boolean(equipment.poison) };
  let allocated = 0, pots = 0, bows = 0;
  const used = { whip: 0, chestnuts: 0, poison: 0 };
  for (const key of Object.keys(deployment)) if (!Object.hasOwn(POSITIONS,key)) throw new RangeError('Unknown position');
  for (const point of Object.values(deployment)) {
    allocated += integer(point.force, DESERT_RULES.force);
    pots += integer(point.pots ?? 0, DESERT_RULES.pots);
    bows += integer(point.bows ?? 0, DESERT_RULES.bows);
    if (!point.force && ((point.pots ?? 0) || (point.bows ?? 0) || Object.keys(used).some(k => point[k]))) {
      throw new RangeError('Equipment needs a defender');
    }
    if ((point.bows ?? 0) > point.force) throw new RangeError('Each archer needs a defender');
    for (const key of Object.keys(used)) used[key] += point[key] ? 1 : 0;
  }
  if (allocated !== DESERT_RULES.force || pots > DESERT_RULES.pots || bows > DESERT_RULES.bows || Object.keys(used).some(k => used[k] > Number(owned[k]))) {
    throw new RangeError('Deployment exceeds available forces or equipment');
  }
  let losses = 0, score = 0;
  const results = [];
  for (const [key, rule] of Object.entries(POSITIONS)) {
    const point = deployment[key] ?? { force: 0 };
    let enemies = rule.enemies;
    if (point.force && rule.clear && (point.whip || point.chestnuts || rule.poison && point.poison)) enemies = 0;
    if (key === DESERT_RULES.broadside.position && point.force) {
      enemies = Math.max(0, enemies - (point.whip ? DESERT_RULES.broadside.whip : 0) - (point.chestnuts ? DESERT_RULES.broadside.chestnuts : 0) - (point.bows ?? 0) * DESERT_RULES.broadside.bow);
    }
    const casualties = Math.min(point.force, Math.ceil(enemies / rule.ratio));
    const secured = point.force * rule.ratio >= enemies;
    let points = !secured ? -rule.penalty : 0;
    if (key === DESERT_RULES.armoury.position && !secured) points = -(DESERT_RULES.pots - pots || DESERT_RULES.armoury.fallbackPenalty);
    if (rule.lookout && point.force && point.bows) points += DESERT_RULES.lookoutBonus;
    losses += casualties;
    score += points;
    results.push({ key, enemies, casualties, survivors: point.force - casualties, secured, points });
  }
  const survivors = DESERT_RULES.force - losses;
  return { phase: 1, results, score, survivors, remainingPirates: Math.max(0, -score),
    destination: survivors ? null : DESERT_RULES.death,
    needsManualEquipmentAvailability: true };
}

export function retakeShip({ survivors, remainingPirates, whipSurvives = false, whipKills = 0 }) {
  integer(survivors, DESERT_RULES.force);
  integer(remainingPirates);
  integer(whipKills, DESERT_RULES.retake.whipKills);
  if (!survivors) return { phase: 2, survivors: 0, destination: DESERT_RULES.death };
  if (!whipSurvives && whipKills) throw new RangeError('Whip bearer is unavailable');
  if (whipKills > remainingPirates) throw new RangeError('Too many whip kills');
  // The book gives the bearer triple strength but no casualty order: the player chooses its use.
  const casualties = Math.max(0, remainingPirates - whipKills) + Number(whipKills > 0);
  const remaining = Math.max(0, survivors - casualties);
  return { phase: 2, casualties: Math.min(survivors, casualties), survivors: remaining,
    destination: remaining ? null : DESERT_RULES.death, needsManualEquipmentAvailability: true };
}

export function attackShip({ survivors, pots = 0, bows = 0, poison = false }) {
  integer(survivors, DESERT_RULES.force);
  integer(pots, DESERT_RULES.pots);
  integer(bows, DESERT_RULES.bows);
  if (!survivors) return { phase: 3, survivors: 0, destination: DESERT_RULES.death };
  const pirates = Math.max(0, DESERT_RULES.attack.pirates - pots - bows - Number(Boolean(poison)));
  const requiredForce = pirates * DESERT_RULES.attack.forceRatio;
  const canAttack = survivors > requiredForce;
  return { phase: 3, pirates, requiredForce, canAttack,
    survivors: canAttack ? survivors - requiredForce : survivors, destination: canAttack ? DESERT_RULES.attack.win : DESERT_RULES.attack.retreat };
}
