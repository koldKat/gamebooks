// Adapt finite pools, arriving divisions and sector opponents to a common exchange boundary.
import { fleetPool, damageFleetPool, reinforceFleetPool } from './fleet-pool.js';
import { startFleetDivisions, damageFleetDivisions, advanceFleetDivisions, fleetDivisionTotals } from './fleet-divisions.js';
import { startFleetSectors, advanceFleetSectorCursor, fleetSectorTotals } from './fleet-sectors.js';
import { fleetUnits } from './fleet-force.js';

export const shipCount = force => force.reduce((sum, unit) => sum + unit.count, 0);
const integer = value => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) throw new RangeError('Invalid enemy force');
  return value;
};

export function startFleetOpposition(force, config, setup, random) {
  if (config.enemies) {
    const units = fleetUnits(config.enemies);
    if (units.some(unit => unit.hitsPerShip !== 1)) throw new RangeError('Enemy ships take one hit each');
    return { kind: 'custom', state: { units, initial: shipCount(units) } };
  }
  if (config.enemySectors) {
    const counts = [...config.enemySectors];
    counts.forEach(integer);
    if (!counts.some(Boolean)) throw new RangeError('No enemy sectors remain');
    if (config.firingOrder === 'each-sector-in-order') {
      return { kind: 'dispersed', state: startFleetSectors(force, counts, setup) };
    }
    let current = setup.initialSector === undefined ? null : integer(setup.initialSector) - 1;
    const initialRolls = [];
    if (current === null && config.initialSector === 'random-d6') {
      if (counts.length !== 6) throw new RangeError('Random sector selection requires six sectors');
      for (let attempt = 0; attempt < 1000; attempt++) {
        const rolled = random(6);
        if (!Number.isSafeInteger(rolled) || rolled < 1 || rolled > 6) throw new RangeError('Invalid sector die');
        initialRolls.push(rolled);
        if (counts[rolled - 1]) { current = rolled - 1; break; }
      }
    }
    if (current === null || current < 0 || current >= counts.length || !counts[current]) {
      throw new RangeError('Choose a nonempty enemy sector');
    }
    return { kind: 'sectors', state: { counts, initial: [...counts], current, initialRolls } };
  }
  if (config.enemyDivisions) return { kind: 'divisions', state: startFleetDivisions(config, setup.initialDivision) };
  const active = integer(config.enemyInitial), total = integer(config.enemyPoolTotal ?? active);
  const prior = integer(setup.priorEnemyLosses ?? 0);
  if (prior > total) throw new RangeError('Prior losses exceed the enemy pool');
  if (total - prior > active && !config.reinforcement) throw new RangeError('Missing enemy reinforcement rule');
  return { kind: 'pool', state: fleetPool({ total: total - prior, active }) };
}

export function fleetOppositionTotals(opposition) {
  const { kind, state } = opposition;
  if (kind === 'custom') return { active: shipCount(state.units), reserve: 0,
    remaining: shipCount(state.units), destroyed: state.initial - shipCount(state.units), unengaged: 0 };
  if (kind === 'pool') return { active: state.active, reserve: state.reserve, destroyed: state.destroyed,
    remaining: state.active + state.reserve, unengaged: 0 };
  if (kind === 'divisions') {
    const totals = fleetDivisionTotals(state);
    return { ...totals, remaining: totals.active + totals.reserve, unengaged: 0 };
  }
  if (kind === 'sectors') return {
    active: state.counts[state.current],
    reserve: state.counts.reduce((sum, count, index) => sum + (index === state.current ? 0 : count), 0),
    destroyed: state.initial.reduce((sum, count, index) => sum + count - state.counts[index], 0),
    remaining: state.counts.reduce((sum, count) => sum + count, 0),
    unengaged: state.counts.reduce((sum, count, index) => sum + (index === state.current ? 0 : count), 0),
  };
  if (kind === 'dispersed') {
    const totals = fleetSectorTotals(state);
    return { active: totals.enemyShips - totals.unengagedEnemyShips, reserve: 0,
      remaining: totals.enemyShips, destroyed: state.enemyDestroyed, unengaged: totals.unengagedEnemyShips };
  }
  throw new RangeError('Invalid fleet opposition');
}

export function currentFleetPlayer(fight) {
  if (fight.opposition.kind !== 'dispersed') return fight.player;
  return fight.opposition.state.sectors[fight.opposition.state.cursor]?.player ?? [];
}

export function allFleetPlayers(fight) {
  return fight.opposition.kind === 'dispersed' ? fight.opposition.state.sectors.flatMap(sector => sector.player) : fight.player;
}

export function currentFleetEnemies(fight) {
  const { kind, state } = fight.opposition;
  if (kind === 'custom') return structuredClone(state.units);
  const unit = (key, count) => ({ key, name: 'Enemy ships ' + key, type: 'enemy', count,
    ordnance: fight.config.enemyOrdnance, hitsPerShip: 1, damage: 0 });
  if (kind === 'pool') return [unit('enemy', state.active)];
  if (kind === 'divisions') return state.divisions.filter(division => division.arrived).map(division => unit(division.id, division.count));
  if (kind === 'sectors') return [unit(String(state.current + 1), state.counts[state.current])];
  if (kind === 'dispersed') {
    const sector = state.sectors[state.cursor];
    return sector ? [unit(sector.id, sector.enemy)] : [];
  }
  throw new RangeError('Invalid fleet opposition');
}

// This runs once, only after the exchange (including both sides' allocations) resolves.
export function commitFleetExchange(fight, exchange) {
  const { kind, state } = fight.opposition;
  if (kind === 'custom') {
    state.units = exchange.enemy;
  } else if (kind === 'pool') {
    fight.opposition.state = damageFleetPool(state, state.active - exchange.enemy[0].count).pool;
  } else if (kind === 'divisions') {
    const allocation = {};
    for (const division of state.divisions.filter(division => division.arrived)) {
      const left = exchange.enemy.find(unit => unit.key === division.id)?.count;
      if (left === undefined || left > division.count) throw new RangeError('Invalid division survivors');
      if (left < division.count) allocation[division.id] = division.count - left;
    }
    fight.opposition.state = damageFleetDivisions(state, Object.values(allocation).reduce((sum, hits) => sum + hits, 0), allocation).state;
  } else if (kind === 'sectors') {
    state.counts[state.current] = exchange.enemy[0].count;
  } else if (kind === 'dispersed') {
    const sector = state.sectors[state.cursor], previousEnemy = sector.enemy;
    state.playerDestroyed += shipCount(sector.player) - shipCount(exchange.player);
    sector.player = exchange.player;
    sector.enemy = exchange.enemy[0].count;
    state.enemyDestroyed += previousEnemy - sector.enemy;
    fleetSectorTotals(state);
    const cleared = !sector.enemy && shipCount(sector.player) > 0 ? sector.id : null;
    const advanced = advanceFleetSectorCursor(state);
    fight.opposition.state = advanced.state;
    return { roundCompleted: advanced.roundCompleted, clearedSector: cleared, ongoing: advanced.ongoing };
  } else throw new RangeError('Invalid fleet opposition');
  fight.player = exchange.player;
  return { roundCompleted: true, clearedSector: null, ongoing: true };
}

export function reinforceFleetOpposition(fight, values) {
  const { kind, state } = fight.opposition;
  if (kind === 'pool' && fight.config.reinforcement) {
    const result = reinforceFleetPool(state, fight.config.reinforcement, values);
    fight.opposition.state = result.pool;
    return { arrived: result.arrived, checked: result.checked, dice: result.dice };
  }
  if (kind === 'divisions') {
    const result = advanceFleetDivisions(state, fight.round);
    fight.opposition.state = result.state;
    return { arrived: result.arrived };
  }
  return null;
}
