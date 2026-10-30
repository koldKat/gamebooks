import test from 'node:test';
import assert from 'node:assert/strict';
import { startFleetDivisions, advanceFleetDivisions, fleetDivisionTotals, damageFleetDivisions, fleetDivisionChart }
  from '../../../../public/js/battlesim/engines/combat-command/fleet-divisions.js';

// Small synthetic divisions test the shared mechanism without duplicating a book catalog.
const config = () => ({ enemyDivisions: [2, 3, 4], enemyChart: 'D',
  enemyChartOverrides: [{ division: '3', chart: 'A' }],
  reinforcement: { timing: 'after-fire', delayByInitialDivision: {
    '1': { '2': 3, '3': 7 }, '2': { '1': 3, '3': 5 }, '3': { '1': 2, '2': 4 },
  } } });

test('division arrival delays are directional and keyed by the initial engagement', () => {
  const one = startFleetDivisions(config(), 1), three = startFleetDivisions(config(), 3);
  assert.equal(one.divisions[2].arrivalRound, 7);
  assert.equal(three.divisions[0].arrivalRound, 2);
  assert.equal(fleetDivisionTotals(one).active, 2);
  assert.equal(fleetDivisionTotals(three).active, 4);
});

test('reinforcements join only after the specified completed round and join once', () => {
  const initial = startFleetDivisions(config(), 1);
  const before = advanceFleetDivisions(initial, 2);
  assert.deepEqual(before.arrived, []);
  const due = advanceFleetDivisions(before.state, 3);
  assert.deepEqual(due.arrived, [{ id: '2', count: 3 }]);
  assert.equal(fleetDivisionTotals(due.state).active, 5);
  assert.deepEqual(advanceFleetDivisions(due.state, 3).arrived, []);
  assert.equal(initial.round, 0);
});

test('wiping the initial division leaves a reserve gap rather than a false battle victory', () => {
  const initial = startFleetDivisions(config(), 1);
  const result = damageFleetDivisions(initial, 9);
  assert.equal(result.destroyed, 2);
  assert.equal(result.unusedHits, 7);
  assert.deepEqual(fleetDivisionTotals(result.state), { active: 0, reserve: 7, destroyed: 2 });
  assert.equal(advanceFleetDivisions(result.state, 3).state.divisions[1].count, 3);
});

test('division chart exceptions begin with arrival and stop when that division is gone', () => {
  const rules = config(), initial = startFleetDivisions(rules, 1);
  assert.equal(fleetDivisionChart(initial, rules), 'D');
  const arrived = advanceFleetDivisions(initial, 7).state;
  assert.equal(fleetDivisionChart(arrived, rules), 'A');
  const damaged = damageFleetDivisions(arrived, 4, { '3': 4 }).state;
  assert.equal(fleetDivisionChart(damaged, rules), 'D');
  assert.equal(fleetDivisionTotals(damaged).active, 5);
});

test('enemy division allocation is explicit and cannot hit future reinforcements', () => {
  const initial = startFleetDivisions(config(), 1);
  assert.throws(() => damageFleetDivisions(initial, 1, { '3': 1 }), /Invalid/);
  const joined = advanceFleetDivisions(initial, 3).state;
  assert.throws(() => damageFleetDivisions(joined, 1), /Choose which/);
  const result = damageFleetDivisions(joined, 2, { '1': 1, '2': 1 });
  assert.deepEqual(result.state.divisions.map(division => division.count), [1, 2, 4]);
  assert.deepEqual(joined.divisions.map(division => division.count), [2, 3, 4]);
});

test('saved division arrivals and casualties survive reload without being replenished again', () => {
  let state = advanceFleetDivisions(startFleetDivisions(config(), 1), 3).state;
  state = damageFleetDivisions(state, 2, { '2': 2 }).state;
  state = JSON.parse(JSON.stringify(state));
  const result = advanceFleetDivisions(state, 7);
  assert.deepEqual(result.arrived, [{ id: '3', count: 4 }]);
  assert.equal(result.state.divisions[1].count, 1);
});

test('missing delays, inconsistent saved state and backwards rounds cannot be guessed', () => {
  const rules = config(); delete rules.reinforcement.delayByInitialDivision['1']['3'];
  assert.throws(() => startFleetDivisions(rules, 1), /Invalid division value/);
  const state = advanceFleetDivisions(startFleetDivisions(config(), 1), 3).state;
  assert.throws(() => advanceFleetDivisions(state, 2), /reverse/);
  const broken = structuredClone(state); broken.divisions[2].arrived = true;
  assert.throws(() => fleetDivisionTotals(broken), /Inconsistent/);
});
