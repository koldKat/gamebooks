// Track independently arriving enemy divisions and their explicitly allocated losses.
const integer = (value, minimum = 0) => {
  if (!Number.isSafeInteger(value) || value < minimum || value > 1000000) throw new RangeError('Invalid division value');
  return value;
};
const validChart = chart => {
  if (!/^[A-G]$/.test(chart ?? '')) throw new RangeError('Invalid division combat chart');
  return chart;
};

export function startFleetDivisions(config, initialDivision) {
  const counts = config.enemyDivisions, initial = String(initialDivision);
  if (!Array.isArray(counts) || counts.length < 2 || counts.length > 10
      || !counts.some((_, index) => String(index + 1) === initial)
      || config.reinforcement?.timing !== 'after-fire') throw new RangeError('Choose the initial enemy division');
  const delays = config.reinforcement.delayByInitialDivision?.[initial];
  const divisions = counts.map((count, index) => {
    integer(count);
    const id = String(index + 1), arrived = id === initial;
    return { id, count, initialCount: count, arrived,
      arrivalRound: arrived ? 0 : integer(delays?.[id], 1) };
  });
  return { round: 0, initialDivision: initial, divisions };
}

function validate(saved) {
  if (!saved || !Array.isArray(saved.divisions) || saved.divisions.length < 2 || saved.divisions.length > 10) {
    throw new RangeError('Invalid division state');
  }
  integer(saved.round);
  const state = structuredClone(saved), ids = new Set();
  for (const division of state.divisions) {
    if (typeof division.id !== 'string' || !division.id || ids.has(division.id)
        || typeof division.arrived !== 'boolean') throw new RangeError('Invalid division state');
    ids.add(division.id);
    integer(division.count); integer(division.initialCount); integer(division.arrivalRound);
    if (division.count > division.initialCount || division.arrived !== (division.arrivalRound <= state.round)) {
      throw new RangeError('Inconsistent division state');
    }
  }
  const initial = state.divisions.find(division => division.id === state.initialDivision);
  if (!initial || initial.arrivalRound !== 0) throw new RangeError('Invalid initial division');
  return state;
}

// The caller invokes this after both sides fire; newly arrived ships fire next round.
export function advanceFleetDivisions(saved, completedRound) {
  const state = validate(saved);
  integer(completedRound);
  if (completedRound < state.round) throw new RangeError('Cannot reverse combat rounds');
  state.round = completedRound;
  const arrived = [];
  for (const division of state.divisions) {
    if (!division.arrived && division.arrivalRound <= completedRound) {
      division.arrived = true;
      arrived.push({ id: division.id, count: division.count });
    }
  }
  return { state, arrived };
}

export function fleetDivisionTotals(saved) {
  const state = validate(saved);
  return state.divisions.reduce((sum, division) => ({
    active: sum.active + (division.arrived ? division.count : 0),
    reserve: sum.reserve + (division.arrived ? 0 : division.count),
    destroyed: sum.destroyed + division.initialCount - division.count,
  }), { active: 0, reserve: 0, destroyed: 0 });
}

export function damageFleetDivisions(saved, hits, allocation) {
  const state = validate(saved);
  integer(hits);
  const active = state.divisions.filter(division => division.arrived && division.count);
  const required = Math.min(hits, active.reduce((sum, division) => sum + division.count, 0));
  let chosen = allocation;
  if (chosen === undefined) {
    if (!required) chosen = {};
    else if (active.length === 1 || required === active.reduce((sum, division) => sum + division.count, 0)) {
      chosen = Object.fromEntries(active.map(division => [division.id, Math.min(required, division.count)]));
    } else throw new RangeError('Choose which enemy divisions take the hits');
  }
  if (!chosen || typeof chosen !== 'object' || Array.isArray(chosen)) throw new RangeError('Enter division hit allocation');
  let total = 0;
  for (const [id, amount] of Object.entries(chosen)) {
    integer(amount);
    const division = active.find(candidate => candidate.id === id);
    if (!division || amount > division.count) throw new RangeError('Invalid division hit allocation');
    total += amount;
  }
  if (total !== required) throw new RangeError('Allocate exactly ' + required + ' enemy hits');
  for (const division of active) division.count -= chosen[division.id] ?? 0;
  return { state, destroyed: required, unusedHits: hits - required };
}

export function fleetDivisionChart(saved, config) {
  const state = validate(saved), base = validChart(config.enemyChart);
  const overrides = config.enemyChartOverrides ?? [];
  if (!Array.isArray(overrides)) throw new RangeError('Invalid division chart overrides');
  const matches = [];
  for (const override of overrides) {
    const division = state.divisions.find(candidate => candidate.id === override.division);
    if (!division) throw new RangeError('Invalid chart override division');
    validChart(override.chart);
    if (division.arrived && division.count) matches.push(override.chart);
  }
  if (new Set(matches).size > 1) throw new RangeError('Conflicting division chart overrides');
  return matches[0] ?? base;
}
