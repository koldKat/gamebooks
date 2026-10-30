import test from 'node:test';
import assert from 'node:assert/strict';
import { createFleetPanelState, fleetPanelForce, storeFleetPanelBattle, fleetBattleActive }
  from '../../../../public/js/battlesim/engines/combat-command/fleet-state.js';

const ship = { key: 'bc', name: 'Cruisers', type: 'battlecruiser', count: 3, ordnance: 4, hitsPerShip: 2, damage: 0 };
const defaults = { playerUnits: [ship], fortress: { count: 1, ordnance: 8, hitsPerShip: 4 }, morale: 9, stealth: 9 };
const finished = extra => ({ rulesVersion: 1, status: 'victory', round: 2, config: { name: 'Test encounter' },
  player: [{ ...ship, count: 2 }], opposition: { kind: 'pool' }, ...extra });

test('pending battle saves retain independent wounded sector groups without collapsing or rewarding them', () => {
  const state = createFleetPanelState(defaults);
  const fight = finished({ status: 'awaiting-player-losses', player: [{ ...ship, count: 2, damage: 1 }] });
  const saved = storeFleetPanelBattle(state, fight, 100);
  assert.equal(saved.fight.player[0].damage, 1); assert.deepEqual(saved.playerForce, [ship]);
  assert.equal(saved.history.length, 0); assert.equal(fleetBattleActive(saved.fight), true);
  assert.equal(state.fight, null);
});

test('completed dispersed fragments merge surviving counts once and preserve unrelated fortress stats', () => {
  const state = createFleetPanelState(defaults);
  state.playerForce.push({ ...defaults.fortress, key: 'fortress', type: 'fortress', name: 'Fortress' });
  const fight = finished({ player: null, opposition: { kind: 'dispersed', state: { sectors: [
    { player: [{ ...ship, key: 'bc>1', originKey: 'bc', count: 1 }] },
    { player: [{ ...ship, key: 'bc>2', originKey: 'bc', count: 1 }] },
  ] } } });
  const saved = storeFleetPanelBattle(state, fight, 100);
  assert.equal(saved.playerForce.find(unit => unit.key === 'bc').count, 2);
  assert.deepEqual(saved.playerForce.find(unit => unit.key === 'fortress'), state.playerForce[1]);
  assert.deepEqual(saved.history, [{ enemy: 'Test encounter', outcome: 'win', result: 'victory', ts: 100 }]);
  assert.deepEqual(storeFleetPanelBattle(saved, JSON.parse(JSON.stringify(saved.fight)), 200), saved);
  assert.equal(fleetPanelForce(saved, null, defaults)[0].count, 2);
});

test('only completed combat outcomes map to win/loss history and timestamps cannot collide', () => {
  let state = createFleetPanelState(defaults);
  for (const [status, outcome] of [['support-arrived', 'win'], ['defeat', 'loss'], ['time-limit', 'loss'],
    ['withdrawn', 'withdrawn'], ['stopped', 'stopped'], ['unengaged-enemies', 'unengaged-enemies']]) {
    state = storeFleetPanelBattle(state, finished({ status }), 100);
    assert.equal(state.history.at(-1).outcome, outcome);
  }
  assert.equal(new Set(state.history.map(row => row.ts)).size, 6);
  assert.throws(() => storeFleetPanelBattle(state, finished({ player: [{ ...ship, damage: 1 }] })), /unresolved damage/);
});

test('a preset selects only its ship types and remembers depleted forces rather than restoring defaults', () => {
  const state = createFleetPanelState(defaults); state.playerForce[0].count = 0;
  assert.equal(fleetPanelForce(state, { playerAllowedTypes: ['battlecruiser'] }, defaults)[0].count, 0);
  const fortress = fleetPanelForce(state, { playerAllowedTypes: ['fortress'] }, defaults);
  assert.equal(fortress.length, 1); assert.equal(fortress[0].hitsPerShip, 4);
});

test('the next custom fight keeps surviving counts for both standard and added ship groups', () => {
  const state = createFleetPanelState(defaults);
  const extra = { ...ship, key: 'player-1', type: 'destroyer', hitsPerShip: 1, count: 8 };
  state.custom.player = [ship, extra];
  const saved = storeFleetPanelBattle(state, finished({ player: [{ ...ship, count: 1 }, { ...extra, count: 3 }] }), 100);
  assert.deepEqual(fleetPanelForce(saved, null, defaults).map(unit => unit.count), [1, 3]);
});
