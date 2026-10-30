// Validate fleet groups and apply explicitly allocated ship hits without choosing tactics.
const integer = (value, minimum = 0) => {
  if (!Number.isSafeInteger(value) || value < minimum || value > 1000000) {
    throw new RangeError('Invalid fleet value');
  }
  return value;
};

export function fleetUnits(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new RangeError('Enter a fleet');
  const keys = new Set();
  return value.map(unit => {
    if (!unit || typeof unit.key !== 'string' || !unit.key || keys.has(unit.key)
        || typeof unit.type !== 'string' || !unit.type
        || typeof unit.name !== 'string' || !unit.name.trim()) throw new RangeError('Invalid ship group');
    keys.add(unit.key);
    const next = structuredClone(unit);
    integer(next.count); integer(next.ordnance); integer(next.hitsPerShip, 1);
    integer(next.damage ?? 0);
    next.damage ??= 0;
    if (next.damage >= next.hitsPerShip || !next.count && next.damage) throw new RangeError('Invalid ship damage');
    if (next.finishDamagedTypeFirst !== undefined && typeof next.finishDamagedTypeFirst !== 'boolean') {
      throw new RangeError('Invalid ship damage rule');
    }
    // Regrouping independently engaged sectors may bring several wounded ships
    // together. Retain those wounds; subsequent hits still finish damaged ships first.
    return next;
  });
}

export function fleetStrength(force, keys = force.map(unit => unit.key)) {
  const units = fleetUnits(force), eligible = new Set(keys);
  if (eligible.size !== keys.length || keys.some(key => !units.some(unit => unit.key === key))) {
    throw new RangeError('Invalid firing ships');
  }
  // A partial hit does not reduce a surviving ship's firepower.
  return units.reduce((total, unit) => total + (eligible.has(unit.key) ? unit.count * unit.ordnance : 0), 0);
}

export function fleetHitCapacity(force, keys = force.map(unit => unit.key)) {
  const units = fleetUnits(force), eligible = new Set(keys);
  if (eligible.size !== keys.length || keys.some(key => !units.some(unit => unit.key === key))) {
    throw new RangeError('Invalid target ships');
  }
  return units.reduce((total, unit) => total + (eligible.has(unit.key)
    ? unit.count * unit.hitsPerShip - unit.damage : 0), 0);
}

export function applyFleetHits(force, hits, { keys = force.map(unit => unit.key), allocation } = {}) {
  const units = fleetUnits(force);
  integer(hits);
  const capacity = fleetHitCapacity(units, keys), required = Math.min(hits, capacity);
  const candidates = units.filter(unit => keys.includes(unit.key) && unit.count);
  let chosen = allocation;
  if (chosen === undefined) {
    if (!required) chosen = {};
    else if (candidates.length === 1 || required === capacity) {
      chosen = Object.fromEntries(candidates.map(unit => [unit.key,
        Math.min(required, unit.count * unit.hitsPerShip - unit.damage)]));
    } else throw new RangeError('Choose how to allocate the fleet hits');
  }
  if (!chosen || typeof chosen !== 'object' || Array.isArray(chosen)) throw new RangeError('Enter hit allocation');
  let total = 0;
  for (const [key, amount] of Object.entries(chosen)) {
    integer(amount);
    const unit = candidates.find(unit => unit.key === key);
    if (!unit || amount > unit.count * unit.hitsPerShip - unit.damage) throw new RangeError('Invalid hit allocation');
    total += amount;
  }
  if (total !== required) throw new RangeError('Allocate exactly ' + required + ' hits');
  const protectedTypes = new Set(units.filter(unit => unit.finishDamagedTypeFirst).map(unit => unit.type));
  for (const type of protectedTypes) {
    const members = units.filter(unit => unit.type === type && keys.includes(unit.key));
    const wounded = members.filter(unit => unit.damage);
    const needed = wounded.reduce((sum, unit) => sum + unit.hitsPerShip - unit.damage, 0);
    const finishing = wounded.reduce((sum, unit) => sum
      + Math.min(chosen[unit.key] ?? 0, unit.hitsPerShip - unit.damage), 0);
    const incoming = members.reduce((sum, unit) => sum + (chosen[unit.key] ?? 0), 0);
    if (finishing < needed && incoming > finishing) {
      throw new RangeError('The damaged ship must receive the next hit allocated to its type');
    }
    if (wounded.filter(unit => (chosen[unit.key] ?? 0) > 0
        && chosen[unit.key] < unit.hitsPerShip - unit.damage).length > 1) {
      throw new RangeError('Finish the damaged ship before damaging another');
    }
  }
  const original = structuredClone(units);
  const losses = [];
  for (const unit of units) {
    const amount = chosen[unit.key] ?? 0;
    if (!amount) continue;
    const damage = unit.damage + amount;
    const lost = Math.floor(damage / unit.hitsPerShip);
    unit.count -= lost;
    unit.damage = unit.count ? damage % unit.hitsPerShip : 0;
    losses.push({ key: unit.key, name: unit.name, hits: amount, count: lost, damage: unit.damage });
  }
  for (const type of protectedTypes) {
    const newWounds = units.filter((unit, index) => unit.type === type && unit.damage
      && (!original[index].damage || unit.count < original[index].count));
    if (newWounds.length > 1) throw new RangeError('Finish the damaged ship before damaging another');
  }
  return { force: fleetUnits(units), hitsApplied: required, hitsUnused: hits - required,
    shipsLost: losses.reduce((sum, loss) => sum + loss.count, 0), losses };
}

// Called explicitly when an encounter ends; validation/rendering never repairs damage.
export function repairFleetDamage(force) {
  return fleetUnits(force).map(unit => ({ ...unit, damage: 0 }));
}
