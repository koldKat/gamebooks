import test from 'node:test';
import assert from 'node:assert/strict';
import { startFleetSectors, damageFleetSectorEnemy, damageFleetSectorPlayer, moveFreedFleetShips,
  advanceFleetSectorCursor, fleetSectorTotals }
  from '../../../../public/js/battlesim/engines/combat-command/fleet-sectors.js';

const force = damage => [
  { key: 'bc', name: 'Battlecruisers', type: 'battlecruiser', count: 3, ordnance: 4, hitsPerShip: 2,
    damage, finishDamagedTypeFirst: true },
  { key: 'dd', name: 'Destroyers', type: 'destroyer', count: 6, ordnance: 2, hitsPerShip: 1 },
];
const allocation = () => ({ '1': { bc: 1, dd: 2 }, '2': { bc: 1, dd: 2 }, '3': { bc: 1, dd: 2 } });
const start = () => startFleetSectors(force(0), [1, 2, 3], { allocation: allocation() });

test('every live enemy sector receives ships without duplicating the force', () => {
  const state = start();
  assert.deepEqual(fleetSectorTotals(state), { playerShips: 9, enemyShips: 6, unengagedEnemyShips: 0 });
  const bad = allocation(); bad['2'].bc++;
  assert.throws(() => startFleetSectors(force(0), [1, 2, 3], { allocation: bad }), /exactly once/);
  assert.throws(() => startFleetSectors(force(0), [1, 2, 3], {
    allocation: { '1': { bc: 3, dd: 6 } },
  }), /at least one/);
});

test('a damaged ship goes to an explicit sector and is neither copied nor repaired', () => {
  assert.throws(() => startFleetSectors(force(1), [1, 2, 3], { allocation: allocation() }), /damaged ship/);
  const state = startFleetSectors(force(1), [1, 2, 3], {
    allocation: allocation(), woundedDestination: { bc: '2' },
  });
  assert.deepEqual(state.sectors.map(sector => sector.player[0].damage), [0, 1, 0]);
});

test('sector hits stay in the selected firing wing and leave other sectors untouched', () => {
  const original = start();
  const result = damageFleetSectorPlayer(original, '2', 5, { keys: ['dd>2'] });
  assert.equal(result.shipsLost, 2);
  assert.equal(result.hitsUnused, 3);
  assert.equal(result.state.sectors[1].player[0].count, 1);
  assert.equal(fleetSectorTotals(result.state).playerShips, 7);
  assert.equal(fleetSectorTotals(original).playerShips, 9);
});

test('freed ships carry wounds into a still-fighting sector without healing existing wounds', () => {
  let state = startFleetSectors(force(1), [1, 2, 3], {
    allocation: allocation(), woundedDestination: { bc: '1' },
  });
  state = damageFleetSectorPlayer(state, '2', 1, { keys: ['bc>2'] }).state;
  state = damageFleetSectorEnemy(state, '1', 1).state;
  state = moveFreedFleetShips(state, '1', { '2': { 'bc>1': 1, 'dd>1': 2 } });
  assert.equal(fleetSectorTotals(state).playerShips, 9);
  assert.equal(state.sectors[0].player.reduce((sum, unit) => sum + unit.count, 0), 0);
  assert.equal(state.sectors[1].player.filter(unit => unit.damage === 1).length, 2);
  assert.equal(fleetSectorTotals(JSON.parse(JSON.stringify(state))).playerShips, 9);
});

test('a sector where Legion ships were wiped out can never be reopened', () => {
  let state = damageFleetSectorPlayer(start(), '2', 4).state;
  assert.equal(state.sectors[1].player.reduce((sum, unit) => sum + unit.count, 0), 0);
  assert.throws(() => damageFleetSectorEnemy(state, '2', 1), /cannot be attacked again/);
  state = damageFleetSectorEnemy(state, '1', 1).state;
  assert.throws(() => moveFreedFleetShips(state, '1', { '2': { 'bc>1': 1, 'dd>1': 2 } }), /ongoing sector/);
  assert.equal(fleetSectorTotals(state).unengagedEnemyShips, 2);
});

test('ships cannot leave an unfinished engagement or move into another cleared sector', () => {
  assert.throws(() => moveFreedFleetShips(start(), '1', { '2': { 'bc>1': 1, 'dd>1': 2 } }), /cleared sector/);
  let state = damageFleetSectorEnemy(start(), '1', 1).state;
  state = damageFleetSectorEnemy(state, '3', 3).state;
  assert.throws(() => moveFreedFleetShips(state, '1', { '3': { 'bc>1': 1, 'dd>1': 2 } }), /ongoing sector/);
});

test('redistribution can leave some survivors in their cleared sector while others reinforce a fight', () => {
  const cleared = damageFleetSectorEnemy(start(), '1', 1).state;
  const state = moveFreedFleetShips(cleared, '1', {
    '1': { 'dd>1': 2 }, '2': { 'bc>1': 1 },
  });
  assert.equal(state.sectors[0].player.reduce((sum, unit) => sum + unit.count, 0), 2);
  assert.equal(state.sectors[1].player.reduce((sum, unit) => sum + unit.count, 0), 4);
  assert.equal(fleetSectorTotals(state).playerShips, 9);
});

test('numeric sector exchanges count one round only after a complete cycle', () => {
  let state = start();
  state = advanceFleetSectorCursor(state).state;
  assert.equal(state.cursor, 1); assert.equal(state.round, 0);
  state = advanceFleetSectorCursor(state).state;
  assert.equal(state.cursor, 2); assert.equal(state.round, 0);
  const next = advanceFleetSectorCursor(state);
  assert.equal(next.state.cursor, 0); assert.equal(next.state.round, 1);
  assert.equal(next.roundCompleted, true);
});

test('no ongoing sectors does not imply victory when undefeated enemy sectors remain', () => {
  let state = damageFleetSectorPlayer(start(), '2', 4).state;
  state = damageFleetSectorPlayer(state, '3', 4).state;
  state = damageFleetSectorEnemy(state, '1', 1).state;
  const result = advanceFleetSectorCursor(state);
  assert.equal(result.ongoing, false);
  assert.equal(result.state.cursor, null);
  assert.equal(fleetSectorTotals(result.state).enemyShips, 5);
  assert.equal(fleetSectorTotals(result.state).unengagedEnemyShips, 5);
  assert.throws(() => advanceFleetSectorCursor(result.state), /no ongoing/);
});
