import test from 'node:test';
import assert from 'node:assert/strict';
import { fleetPool, damageFleetPool, reinforceFleetPool }
  from '../../../../public/js/battlesim/engines/combat-command/fleet-pool.js';

test('replacing an active cap draws only missing ships from a finite reserve', () => {
  const start = fleetPool({ total: 8, active: 3 });
  const damaged = damageFleetPool(start, 2);
  assert.equal(damaged.pool.active, 1);
  assert.equal(damaged.pool.reserve, 5);
  const result = reinforceFleetPool(damaged.pool, { mode: 'replace-active-cap', cap: 3, timing: 'after-fire' });
  assert.deepEqual(result.pool, { total: 8, active: 3, reserve: 3, destroyed: 2, reinforcementArrived: false });
  assert.equal(start.active, 3, 'saved input is not mutated');
});

test('hits cannot destroy reserve ships before they enter combat', () => {
  const damaged = damageFleetPool(fleetPool({ total: 8, active: 3 }), 9);
  assert.equal(damaged.destroyed, 3);
  assert.equal(damaged.unusedHits, 6);
  assert.equal(damaged.pool.reserve, 5);
  assert.equal(damaged.pool.active, 0);
});

test('fixed additions accumulate survivors and truncate only at reserve exhaustion', () => {
  const rule = { mode: 'add-from-pool', count: 4, dice: 0, timing: 'after-fire' };
  let pool = fleetPool({ total: 8, active: 3 });
  pool = reinforceFleetPool(pool, rule).pool;
  assert.equal(pool.active, 7);
  const last = reinforceFleetPool(pool, rule);
  assert.equal(last.arrived, 1);
  assert.equal(last.pool.active, 8);
  assert.equal(last.pool.reserve, 0);
});

test('one and two dice additions remain distinct and never fabricate excess ships', () => {
  const start = fleetPool({ total: 20, active: 3 });
  const one = { mode: 'add-from-pool', count: 0, dice: 1, timing: 'after-fire' };
  const two = { ...one, dice: 2 };
  assert.equal(reinforceFleetPool(start, one, [4]).arrived, 4);
  assert.equal(reinforceFleetPool(start, two, [4, 5]).arrived, 9);
  assert.throws(() => reinforceFleetPool(start, two, [4]), /dice/);
  assert.equal(reinforceFleetPool(fleetPool({ total: 4, active: 3 }), two, [6, 6]).arrived, 1);
  assert.equal(reinforceFleetPool(fleetPool({ total: 3, active: 3 }), two).arrived, 0);
});

test('a one-time reinforcement compares against cumulative kills and survives reload', () => {
  const rule = { mode: 'cumulative-casualty-check-once', count: 4, dice: 2,
    trigger: 'roll-at-most-total-enemy-ships-destroyed', timing: 'after-fire' };
  let pool = damageFleetPool(fleetPool({ total: 9, active: 5 }), 2).pool;
  const failed = reinforceFleetPool(pool, rule, [2, 2]);
  assert.equal(failed.arrived, 0);
  assert.equal(failed.checked, true);
  pool = damageFleetPool(failed.pool, 2).pool;
  const success = reinforceFleetPool(pool, rule, [2, 2]);
  assert.equal(success.arrived, 4);
  assert.equal(success.pool.destroyed, 4);
  assert.equal(success.pool.reinforcementArrived, true);
  const reloaded = JSON.parse(JSON.stringify(success.pool));
  assert.equal(reinforceFleetPool(reloaded, rule).checked, false);
  assert.throws(() => reinforceFleetPool(reloaded, rule, [1, 1]), /dice/);
});

test('invalid pools and timing cannot silently change enemy strength', () => {
  assert.throws(() => fleetPool({ total: 2, active: 3 }), /exceed/);
  const pool = fleetPool({ total: 8, active: 3 });
  assert.throws(() => damageFleetPool({ ...pool, reserve: 1 }, 1), /Inconsistent/);
  assert.throws(() => reinforceFleetPool(pool, { mode: 'replace-active-cap', cap: 3, timing: 'before-fire' }), /rule/);
  assert.throws(() => damageFleetPool(pool, -1), /Invalid/);
});
