// Track a finite enemy reserve and its explicit between-round reinforcement rule.
const integer = (value, minimum = 0) => {
  if (!Number.isSafeInteger(value) || value < minimum || value > 1000000) throw new RangeError('Invalid fleet pool');
  return value;
};

export function fleetPool({ total, active }) {
  integer(total); integer(active);
  if (active > total) throw new RangeError('Active ships exceed the total enemy force');
  return { total, active, reserve: total - active, destroyed: 0, reinforcementArrived: false };
}

function validate(pool) {
  if (!pool || typeof pool.reinforcementArrived !== 'boolean') throw new RangeError('Invalid fleet pool');
  for (const key of ['total', 'active', 'reserve', 'destroyed']) integer(pool[key]);
  if (pool.active + pool.reserve + pool.destroyed !== pool.total) throw new RangeError('Inconsistent fleet pool');
  return structuredClone(pool);
}

export function damageFleetPool(saved, hits) {
  const pool = validate(saved);
  integer(hits);
  const destroyed = Math.min(hits, pool.active);
  pool.active -= destroyed;
  pool.destroyed += destroyed;
  return { pool, destroyed, unusedHits: hits - destroyed };
}

function dice(values, count) {
  if (!Array.isArray(values) || values.length !== count
      || values.some(value => !Number.isSafeInteger(value) || value < 1 || value > 6)) {
    throw new RangeError('Enter the reinforcement dice');
  }
  return values.reduce((sum, value) => sum + value, 0);
}

// Invoke after both sides have fired. Reserve ships cannot return fire in the round they join.
export function reinforceFleetPool(saved, rule, values = []) {
  const pool = validate(saved);
  if (!rule || !['replace-active-cap', 'add-from-pool', 'cumulative-casualty-check-once'].includes(rule.mode)
      || rule.timing !== 'after-fire') throw new RangeError('Invalid fleet reinforcement rule');
  let wanted = 0, checked = false;
  if (rule.mode === 'replace-active-cap') {
    integer(rule.cap, 1);
    dice(values, 0);
    wanted = Math.max(0, rule.cap - pool.active);
  } else if (rule.mode === 'add-from-pool') {
    integer(rule.count);
    integer(rule.dice);
    if (rule.dice > 2) throw new RangeError('Invalid reinforcement dice count');
    wanted = rule.count + (pool.reserve ? dice(values, rule.dice) : dice(values, 0));
  } else {
    integer(rule.count, 1);
    if (rule.dice !== 2 || rule.trigger !== 'roll-at-most-total-enemy-ships-destroyed') {
      throw new RangeError('Invalid cumulative reinforcement rule');
    }
    if (pool.reserve && !pool.reinforcementArrived) {
      checked = true;
      if (dice(values, 2) <= pool.destroyed) {
        wanted = rule.count;
        pool.reinforcementArrived = true;
      }
    } else dice(values, 0);
  }
  const arrived = Math.min(wanted, pool.reserve);
  pool.reserve -= arrived;
  pool.active += arrived;
  return { pool, arrived, checked, dice: [...values] };
}
