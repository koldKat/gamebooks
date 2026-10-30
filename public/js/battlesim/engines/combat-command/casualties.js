// Apply explicit mixed-force casualty rules without changing legacy loss allocation.
const count = value => Number.isSafeInteger(value) && value >= 0;

export function validateCasualtyPolicy(force, policy, allowDiscretion = false) {
  if (policy === undefined) return;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)
      || Object.keys(policy).some(key => !['cycle', 'priority', 'first', 'discretion'].includes(key))) {
    throw new RangeError('Invalid casualty policy');
  }
  const types = new Set(force.map(unit => unit.type));
  if (policy.cycle !== undefined && (!Array.isArray(policy.cycle) || !policy.cycle.length
      || new Set(policy.cycle).size !== policy.cycle.length
      || policy.cycle.some(type => typeof type !== 'string' || !type)
      || !policy.cycle.some(type => types.has(type)))) {
    throw new RangeError('Invalid casualty cycle');
  }
  if (policy.priority !== undefined && (!Array.isArray(policy.priority)
      || new Set(policy.priority).size !== policy.priority.length
      || policy.priority.some(key => !force.some(unit => unit.key === key)))) {
    throw new RangeError('Invalid casualty priority');
  }
  if (policy.first !== undefined && (!policy.first || !types.has(policy.first.type)
      || !count(policy.first.count) || !policy.first.count)) throw new RangeError('Invalid initial casualties');
  if (policy.discretion !== undefined && (typeof policy.discretion !== 'boolean'
      || policy.discretion && !allowDiscretion)) throw new RangeError('Invalid casualty discretion');
  if (force.some(unit => unit.drone)) throw new RangeError('Mixed-force casualties cannot include drones');
}

function remove(unit, amount, event) {
  unit.count -= amount;
  unit.spent = Math.max(0, (unit.spent ?? 0) - amount);
  const existing = event.losses.find(loss => loss.key === unit.key);
  if (existing) existing.count += amount;
  else event.losses.push({key:unit.key, name:unit.name, count:amount});
}

// Return only those remaining hits which the player must allocate explicitly.
export function applyTypedCasualties(fight, side, candidates, hits, event) {
  const policy = fight.config[side + 'CasualtyPolicy'];
  const cursorKey = side + 'LossCursor', firstKey = side + 'InitialLosses';
  const cycle = policy.cycle;
  const take = (unit, amount) => {
    remove(unit, amount, event); hits -= amount;
    if (cycle?.includes(unit.type)) fight[cursorKey] = (cycle.indexOf(unit.type) + 1) % cycle.length;
  };
  for (const key of policy.priority ?? []) {
    const unit = candidates.find(unit => unit.key === key && unit.count);
    if (unit && hits) take(unit, Math.min(unit.count, hits));
  }
  if (policy.first) {
    let required = Math.max(0, policy.first.count - (fight[firstKey] ?? 0));
    for (const unit of candidates.filter(unit => unit.type === policy.first.type)) {
      const amount = Math.min(unit.count, hits, required);
      if (!amount) continue;
      take(unit, amount); required -= amount;
      fight[firstKey] = (fight[firstKey] ?? 0) + amount;
    }
  }
  if (policy.discretion && hits) return Math.min(hits, candidates.reduce((sum, unit) => sum + unit.count, 0));
  while (hits) {
    let unit;
    if (cycle) {
      const start = fight[cursorKey] ?? 0;
      for (let offset = 0; offset < cycle.length; offset++) {
        unit = candidates.find(unit => unit.count && unit.type === cycle[(start + offset) % cycle.length]);
        if (unit) break;
      }
    }
    unit ??= candidates.find(unit => unit.count);
    if (!unit) break;
    take(unit, cycle ? 1 : Math.min(unit.count, hits));
  }
  return 0;
}

export function allocateCasualties(force, allocation, required, event) {
  if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)) throw new RangeError('Enter casualty counts');
  let total = 0;
  for (const [key, value] of Object.entries(allocation)) {
    const unit = force.find(unit => unit.key === key);
    if (!unit || !count(value) || value > unit.count) throw new RangeError('Invalid casualty count');
    total += value;
  }
  if (total !== required) throw new RangeError('Allocate exactly ' + required + ' casualties');
  for (const unit of force) if (Object.hasOwn(allocation, unit.key) && allocation[unit.key]) remove(unit, allocation[unit.key], event);
}
