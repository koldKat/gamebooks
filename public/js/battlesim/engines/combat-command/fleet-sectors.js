// Preserve dispersed fleet allocations, casualties and movement between ongoing sectors.
import { fleetUnits, applyFleetHits } from './fleet-force.js';

const ships = force => force.reduce((sum, unit) => sum + unit.count, 0);
const integer = value => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) throw new RangeError('Invalid sector value');
  return value;
};

function partition(force, ids, allocation, woundedDestination = {}) {
  if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)
      || Object.keys(allocation).some(id => !ids.includes(id))) throw new RangeError('Enter sector allocations');
  const groups = fleetUnits(force), used = new Map(groups.map(unit => [unit.key, 0]));
  for (const id of ids) {
    const entry = allocation[id] ?? {};
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new RangeError('Invalid sector allocation');
    for (const [key, amount] of Object.entries(entry)) {
      integer(amount);
      if (!used.has(key)) throw new RangeError('Unknown allocated ship group');
      used.set(key, used.get(key) + amount);
    }
  }
  for (const unit of groups) if (used.get(unit.key) !== unit.count) throw new RangeError('Allocate every surviving ship exactly once');
  const damaged = new Map();
  for (const unit of groups.filter(unit => unit.damage)) {
    const destinations = ids.filter(id => (allocation[id]?.[unit.key] ?? 0) > 0);
    const chosen = woundedDestination[unit.key] ?? (destinations.length === 1 ? destinations[0] : null);
    if (!destinations.includes(chosen)) throw new RangeError('Choose the sector containing the damaged ship');
    damaged.set(unit.key, chosen);
  }
  return new Map(ids.map(id => [id, groups.map(unit => ({ ...unit,
    key: unit.key + '>' + id, originKey: unit.originKey ?? unit.key,
    count: allocation[id]?.[unit.key] ?? 0, damage: damaged.get(unit.key) === id ? unit.damage : 0,
  }))]));
}

export function startFleetSectors(force, enemyCounts, { allocation, woundedDestination } = {}) {
  const units = fleetUnits(force);
  if (!Array.isArray(enemyCounts) || !enemyCounts.length || enemyCounts.length > 20) throw new RangeError('Enter enemy sectors');
  enemyCounts.forEach(integer);
  if (!enemyCounts.some(Boolean) || !ships(units)) throw new RangeError('Both forces must have ships');
  const ids = enemyCounts.map((_, index) => String(index + 1));
  const divided = partition(units, ids, allocation, woundedDestination);
  const sectors = enemyCounts.map((enemy, index) => {
    const id = ids[index], player = divided.get(id), count = ships(player);
    if (enemy && !count) throw new RangeError('Engage every enemy sector with at least one ship');
    if (!enemy && count) throw new RangeError('A cleared enemy sector is not an initial target');
    return { id, enemy, enemyInitial: enemy, player };
  });
  return { round: 0, cursor: sectors.findIndex(sector => sector.enemy > 0), sectors,
    initialPlayerShips: ships(units), playerDestroyed: 0,
    initialEnemyShips: enemyCounts.reduce((sum, count) => sum + count, 0), enemyDestroyed: 0 };
}

function validate(saved) {
  if (!saved || !Array.isArray(saved.sectors) || !saved.sectors.length || saved.sectors.length > 20) {
    throw new RangeError('Invalid sector state');
  }
  const state = structuredClone(saved), ids = new Set();
  for (const key of ['round', 'initialPlayerShips', 'playerDestroyed', 'initialEnemyShips', 'enemyDestroyed']) integer(state[key]);
  if (state.cursor !== null && (!Number.isSafeInteger(state.cursor) || state.cursor < 0 || state.cursor >= state.sectors.length)) {
    throw new RangeError('Invalid sector cursor');
  }
  for (const sector of state.sectors) {
    if (typeof sector.id !== 'string' || !sector.id || ids.has(sector.id)) throw new RangeError('Invalid sector identifier');
    ids.add(sector.id); integer(sector.enemy); integer(sector.enemyInitial);
    if (sector.enemy > sector.enemyInitial) throw new RangeError('Invalid sector casualties');
    sector.player = fleetUnits(sector.player);
  }
  if (state.sectors.reduce((sum, sector) => sum + ships(sector.player), state.playerDestroyed) !== state.initialPlayerShips
      || state.sectors.reduce((sum, sector) => sum + sector.enemy, state.enemyDestroyed) !== state.initialEnemyShips) {
    throw new RangeError('Sector ships do not match the saved force');
  }
  return state;
}

function sectorAt(state, id) {
  const sector = state.sectors.find(candidate => candidate.id === String(id));
  if (!sector) throw new RangeError('Unknown sector');
  return sector;
}

export function damageFleetSectorEnemy(saved, id, hits) {
  const state = validate(saved), sector = sectorAt(state, id);
  integer(hits);
  if (!ships(sector.player)) throw new RangeError('A sector without Legion ships cannot be attacked again');
  const destroyed = Math.min(hits, sector.enemy);
  sector.enemy -= destroyed; state.enemyDestroyed += destroyed;
  return { state, destroyed, unusedHits: hits - destroyed };
}

export function damageFleetSectorPlayer(saved, id, hits, options) {
  const state = validate(saved), sector = sectorAt(state, id);
  const result = applyFleetHits(sector.player, hits, options);
  sector.player = result.force; state.playerDestroyed += result.shipsLost;
  return { state, ...Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'force')) };
}

// Clearing a sector does not end the encounter or repair its survivors' partial damage.
export function moveFreedFleetShips(saved, fromId, allocation, woundedDestination) {
  const state = validate(saved), source = sectorAt(state, fromId);
  if (source.enemy || !ships(source.player)) throw new RangeError('Only survivors from a cleared sector may move');
  if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)) throw new RangeError('Choose destination sectors');
  const ids = Object.keys(allocation);
  if (!ids.length) throw new RangeError('Choose destination sectors');
  for (const id of ids) {
    const target = sectorAt(state, id);
    if (target.id === source.id) continue; // Explicitly keep some survivors where they are.
    if (!target.enemy || !ships(target.player)) throw new RangeError('Ships may move only into an ongoing sector');
  }
  const divided = partition(source.player, ids, allocation, woundedDestination);
  for (const id of ids) {
    const target = sectorAt(state, id);
    if (target.id === source.id) continue;
    target.player = fleetUnits([...target.player, ...divided.get(id)]);
  }
  source.player = divided.get(source.id) ?? source.player.map(unit => ({ ...unit, count: 0, damage: 0 }));
  return validate(state);
}

export function advanceFleetSectorCursor(saved) {
  const state = validate(saved);
  if (state.cursor === null) throw new RangeError('There are no ongoing sector exchanges');
  const previous = state.cursor;
  for (let offset = 1; offset <= state.sectors.length; offset++) {
    const index = (previous + offset) % state.sectors.length, sector = state.sectors[index];
    if (sector.enemy && ships(sector.player)) {
      const roundCompleted = index <= previous;
      state.cursor = index;
      if (roundCompleted) state.round++;
      return { state, roundCompleted, ongoing: true };
    }
  }
  state.cursor = null; state.round++;
  return { state, roundCompleted: true, ongoing: false };
}

export function fleetSectorTotals(saved) {
  const state = validate(saved);
  return state.sectors.reduce((sum, sector) => ({
    playerShips: sum.playerShips + ships(sector.player),
    enemyShips: sum.enemyShips + sector.enemy,
    unengagedEnemyShips: sum.unengagedEnemyShips + (!ships(sector.player) ? sector.enemy : 0),
  }), { playerShips: 0, enemyShips: 0, unengagedEnemyShips: 0 });
}
