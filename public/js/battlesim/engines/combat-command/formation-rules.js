// Calculate engaged formation strength and apply source-defined casualty and morale policies.
const copy = value => structuredClone(value);
const integer = (value, min = 0, max = 1000000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid formation value');
  return value;
};
const allocationRequired = message => {
  const error = new RangeError(message);
  error.code = 'FORMATION_ALLOCATION_REQUIRED';
  throw error;
};

export function formationUnits(input) {
  if (!Array.isArray(input) || input.length > 100) throw new RangeError('Enter a formation');
  const keys = new Set();
  return input.map(value => {
    if (!value || typeof value.key !== 'string' || !value.key || keys.has(value.key)
        || typeof value.name !== 'string' || !value.name.trim()) throw new RangeError('Invalid formation unit');
    keys.add(value.key);
    const unit = copy(value);
    integer(unit.count);
    for (const field of ['ordnance', 'melee', 'morale']) if (unit[field] !== null) integer(unit[field]);
    unit.initialCount ??= unit.count;
    integer(unit.initialCount, unit.count);
    if (unit.moraleLoss) {
      integer(unit.moraleLoss.per, 1);
      integer(unit.casualtyRemainder ?? 0, 0, unit.moraleLoss.per - 1);
      if (unit.morale === null) throw new RangeError('Enter current morale for casualty checks');
    } else if (unit.casualtyRemainder) throw new RangeError('Casualty carry requires a morale rule');
    return unit;
  });
}

export function formationEngagedCount(unit, round, engagement) {
  integer(round, 1);
  if (!unit.count || unit.retired) return 0;
  if (!engagement) return unit.count;
  const from = integer(engagement.fromRound ?? 1, 1);
  if (round < from) return 0;
  const first = integer(engagement.initial, 0);
  const every = integer(engagement.every ?? 1, 1);
  const increment = integer(engagement.increment ?? 0);
  // The scheduled total includes men killed earlier, not fresh survivors each round.
  const scheduled = Math.min(unit.initialCount ?? unit.count,
    first + Math.floor((round - from) / every) * increment);
  const casualties = (unit.initialCount ?? unit.count) - unit.count;
  return Math.max(0, Math.min(unit.count, scheduled - casualties));
}

export function formationAttackStrength(units, actors, round, engagements = {}) {
  if (!Array.isArray(actors) || !actors.length || actors.length > 100) throw new RangeError('Choose attacking units');
  const keys = new Set();
  let strength = 0;
  for (const actor of actors) {
    if (!actor || keys.has(actor.key) || !['ordnance', 'melee'].includes(actor.stat)) throw new RangeError('Invalid attacking group');
    keys.add(actor.key);
    const unit = units.find(candidate => candidate.key === actor.key);
    if (!unit) throw new RangeError('Unknown attacking unit');
    let count = formationEngagedCount(unit, round, engagements[unit.key]);
    if (actor.countLimit !== undefined) count = Math.min(count, integer(actor.countLimit));
    if (!count) continue;
    const power = actor.value === undefined ? unit[actor.stat] : actor.value;
    if (power === null) throw new RangeError('Enter the combat value used by this attack');
    integer(power);
    const multiplier = integer(actor.multiplier ?? 1, 1);
    strength += count * power * multiplier;
    if (!Number.isSafeInteger(strength)) throw new RangeError('Attack Strength is too large');
  }
  return strength;
}

export function formationCasualties(previous, hits, {
  targets, mode = 'manual', allocation, round = 1, engagements = {},
} = {}) {
  integer(hits);
  const units = formationUnits(previous);
  if (!Array.isArray(targets) || !targets.length || new Set(targets).size !== targets.length
      || targets.some(key => !units.some(unit => unit.key === key))) throw new RangeError('Choose casualty targets');
  if (!['manual', 'ordered', 'even', 'wipe-on-hit'].includes(mode)) throw new RangeError('Invalid casualty policy');
  const caps = Object.fromEntries(targets.map(key => {
    const unit = units.find(candidate => candidate.key === key);
    return [key, formationEngagedCount(unit, round, engagements[key])];
  }));
  const capacity = Object.values(caps).reduce((sum, count) => sum + count, 0);
  const applied = mode === 'wipe-on-hit' && hits ? capacity : Math.min(hits, capacity);
  let losses = Object.fromEntries(targets.map(key => [key, 0]));
  if (allocation !== undefined) {
    if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)
        || Object.keys(allocation).some(key => !targets.includes(key))) throw new RangeError('Invalid casualty allocation');
    losses = Object.fromEntries(targets.map(key => [key, integer(allocation[key] ?? 0, 0, caps[key])]));
    if (Object.values(losses).reduce((sum, count) => sum + count, 0) !== applied) throw new RangeError('Allocate exactly the incurred casualties');
  } else if (applied === capacity) losses = { ...caps };
  else if (applied && (mode === 'ordered' || targets.filter(key => caps[key]).length === 1)) {
    let remaining = applied;
    for (const key of targets) { losses[key] = Math.min(caps[key], remaining); remaining -= losses[key]; }
  } else if (applied && mode === 'even') {
    const eligible = targets.filter(key => caps[key]);
    if (applied % eligible.length) allocationRequired('Choose which unit takes the odd casualty');
    const share = applied / eligible.length;
    if (eligible.some(key => caps[key] < share)) allocationRequired('Choose an even allocation within surviving manpower');
    for (const key of eligible) losses[key] = share;
  } else if (applied) allocationRequired('Allocate casualties among the engaged units');
  if (mode === 'ordered') {
    let remaining = applied;
    for (const key of targets) {
      const expected = Math.min(caps[key], remaining);
      if (losses[key] !== expected) throw new RangeError('Follow the printed casualty priority');
      remaining -= expected;
    }
  }
  if (mode === 'even') {
    const eligible = targets.filter(key => caps[key]);
    // No unit may take two more losses while another still has capacity.
    for (const key of eligible) for (const other of eligible) {
      if (losses[key] > losses[other] + 1 && losses[other] < caps[other]) throw new RangeError('Distribute these casualties evenly');
    }
  }
  const checks = [], removed = [];
  for (const unit of units) {
    const loss = losses[unit.key] ?? 0;
    if (!loss) continue;
    unit.count -= loss;
    removed.push({ key: unit.key, name: unit.name, count: loss });
    if (!unit.moraleLoss) continue;
    const total = (unit.casualtyRemainder ?? 0) + loss;
    const decrease = Math.floor(total / unit.moraleLoss.per);
    unit.casualtyRemainder = total % unit.moraleLoss.per;
    // Current morale is entered after earlier losses, so only new losses reduce it.
    if (decrease) {
      unit.morale = Math.max(0, unit.morale - decrease);
      if (unit.count) checks.push({ kind: 'morale', key: unit.key, morale: unit.morale, decrease });
    }
  }
  return { units, losses: removed, checks, applied, unallocated: hits > applied ? hits - applied : 0 };
}

export function formationMoraleResult(previous, key, total) {
  integer(total, 2, 12);
  const units = formationUnits(previous), unit = units.find(candidate => candidate.key === key);
  if (!unit?.count || unit.retired || unit.morale === null) throw new RangeError('No active unit for this morale check');
  const passed = total <= unit.morale;
  if (!passed) unit.retired = 'routed';
  return { units, passed };
}
