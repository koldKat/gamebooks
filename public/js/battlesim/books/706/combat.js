import { POSITIONS, ENCOUNTERS } from './definition.js';

export function startEncounter(origin) {
  const rule = ENCOUNTERS[origin];
  if (!rule) throw new RangeError('Unknown encounter');
  return { ruleVersion: 1, origin, ...rule, penalties: 0, outcome: null };
}

export function addPenalty(fight, amount) {
  integer(amount);
  if (fight.ruleVersion !== 1 || fight.outcome) throw new RangeError('Encounter is not active');
  const penalties = fight.penalties + amount;
  const lost = penalties > 0 && penalties >= fight.level;
  return { ...fight, penalties, outcome: lost ? 'loss' : null };
}

export function finishEncounter(fight) {
  if (fight.ruleVersion !== 1 || fight.outcome) throw new RangeError('Encounter is not active');
  return { ...fight, outcome: 'win' };
}

export function enduranceAfter(current, change) {
  if (!Number.isFinite(current) || !Number.isFinite(change)) throw new RangeError('Invalid endurance');
  const endurance = Math.min(40, current + change);
  return { endurance, dead: endurance < 0 };
}

export function barracksPenalty(strategy, groupSize) {
  integer(groupSize, 48);
  if (groupSize < 4) throw new RangeError('Invalid rebel group size');
  const tactics = { 419: 7, 429: 9, 439: 0, 449: 8, 459: 6 };
  if (!(strategy in tactics)) throw new RangeError('Unknown barracks approach');
  if (Number(strategy) === 439) return 0;
  const sizePenalty = groupSize <= 4 ? 6 : groupSize <= 8 ? 7 : groupSize <= 16 ? 8
    : groupSize <= 25 ? 9 : groupSize <= 33 ? 10 : 11;
  return tactics[strategy] + sizePenalty;
}

function integer(value, maximum = 1000000) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) throw new RangeError('Invalid force or equipment count');
  return value;
}

export function defendShip(deployment, equipment = {}) {
  const owned = { whip: Boolean(equipment.whip), chestnuts: Boolean(equipment.chestnuts), poison: Boolean(equipment.poison) };
  let allocated = 0, pots = 0, bows = 0;
  const used = { whip: 0, chestnuts: 0, poison: 0 };
  for (const key of Object.keys(deployment)) if (!(key in POSITIONS)) throw new RangeError('Unknown position');
  for (const point of Object.values(deployment)) {
    allocated += integer(point.force, 31);
    pots += integer(point.pots ?? 0, 8);
    bows += integer(point.bows ?? 0, 3);
    if (!point.force && ((point.pots ?? 0) || (point.bows ?? 0) || Object.keys(used).some(k => point[k]))) {
      throw new RangeError('Equipment needs a defender');
    }
    if ((point.bows ?? 0) > point.force) throw new RangeError('Each archer needs a defender');
    for (const key of Object.keys(used)) used[key] += point[key] ? 1 : 0;
  }
  if (allocated !== 31 || pots > 8 || bows > 3 || Object.keys(used).some(k => used[k] > Number(owned[k]))) {
    throw new RangeError('Deployment exceeds available forces or equipment');
  }
  let losses = 0, score = 0;
  const results = [];
  for (const [key, rule] of Object.entries(POSITIONS)) {
    const point = deployment[key] ?? { force: 0 };
    let enemies = rule.enemies;
    if (point.force && rule.clear && (point.whip || point.chestnuts || rule.poison && point.poison)) enemies = 0;
    if (key === 'Ж' && point.force) {
      enemies = Math.max(0, enemies - (point.whip ? 6 : 0) - (point.chestnuts ? 8 : 0) - (point.bows ?? 0) * 4);
    }
    const casualties = Math.min(point.force, Math.ceil(enemies / rule.ratio));
    const secured = point.force * rule.ratio >= enemies;
    let points = !secured ? -rule.penalty : 0;
    if (key === 'В' && !secured) points = -(8 - pots || 2);
    if (rule.lookout && point.force && point.bows) points += 3;
    losses += casualties;
    score += points;
    results.push({ key, enemies, casualties, survivors: point.force - casualties, secured, points });
  }
  const survivors = 31 - losses;
  return { phase: 1, results, score, survivors, remainingPirates: Math.max(0, -score),
    destination: survivors ? null : 58,
    needsManualEquipmentAvailability: true };
}

export function retakeShip({ survivors, remainingPirates, whipSurvives = false, whipKills = 0 }) {
  integer(survivors, 31);
  integer(remainingPirates);
  integer(whipKills, 3);
  if (!survivors) return { phase: 2, survivors: 0, destination: 58 };
  if (!whipSurvives && whipKills) throw new RangeError('Whip bearer is unavailable');
  if (whipKills > remainingPirates) throw new RangeError('Too many whip kills');
  // The book gives the bearer triple strength but no casualty order: the player chooses its use.
  const casualties = Math.max(0, remainingPirates - whipKills) + Number(whipKills > 0);
  const remaining = Math.max(0, survivors - casualties);
  return { phase: 2, casualties: Math.min(survivors, casualties), survivors: remaining,
    destination: remaining ? null : 58, needsManualEquipmentAvailability: true };
}

export function attackShip({ survivors, pots = 0, bows = 0, poison = false }) {
  integer(survivors, 31);
  integer(pots, 8);
  integer(bows, 3);
  if (!survivors) return { phase: 3, survivors: 0, destination: 58 };
  const pirates = Math.max(0, 5 - pots - bows - Number(Boolean(poison)));
  const requiredForce = pirates * 3;
  const canAttack = survivors > requiredForce;
  return { phase: 3, pirates, requiredForce, canAttack,
    survivors: canAttack ? survivors - requiredForce : survivors, destination: canAttack ? 68 : 78 };
}
