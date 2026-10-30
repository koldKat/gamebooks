import test from 'node:test';
import assert from 'node:assert/strict';
import { fleetUnits, fleetStrength, fleetHitCapacity, applyFleetHits, repairFleetDamage }
  from '../../../../public/js/battlesim/engines/combat-command/fleet-force.js';

const ship = (key, type, count, ordnance, hitsPerShip, extra = {}) => ({
  key, type, name: key, count, ordnance, hitsPerShip, ...extra,
});
const bc = (count = 2, extra = {}) => ship('bc', 'battlecruiser', count, 4, 2,
  { finishDamagedTypeFirst: true, ...extra });
const dd = (count = 3) => ship('dd', 'destroyer', count, 2, 1);

test('a battlecruiser survives one hit at full firepower and dies on the next', () => {
  const original = [bc(1)];
  const first = applyFleetHits(original, 1);
  assert.equal(first.shipsLost, 0);
  assert.equal(first.force[0].damage, 1);
  assert.equal(fleetStrength(first.force), 4);
  assert.equal(fleetHitCapacity(first.force), 1);
  assert.equal(original[0].damage, undefined, 'source state is immutable');
  const second = applyFleetHits(first.force, 1);
  assert.equal(second.shipsLost, 1);
  assert.equal(second.force[0].count, 0);
  assert.equal(second.force[0].damage, 0);
});

test('fortresses absorb four hits while destroyers absorb one', () => {
  const fortress = [ship('fort', 'fortress', 1, 8, 4)];
  const wounded = applyFleetHits(fortress, 3);
  assert.equal(wounded.shipsLost, 0);
  assert.equal(fleetStrength(wounded.force), 8);
  assert.equal(applyFleetHits(wounded.force, 1).shipsLost, 1);
  assert.equal(applyFleetHits([dd()], 2).force[0].count, 1);
});

test('discretionary wing allocations are explicit and invalid requests are atomic', () => {
  const force = [bc(), dd()];
  assert.throws(() => applyFleetHits(force, 3), /Choose how/);
  assert.throws(() => applyFleetHits(force, 3, { allocation: { bc: 1, dd: 1 } }), /exactly 3/);
  const result = applyFleetHits(force, 3, { allocation: { bc: 2, dd: 1 } });
  assert.deepEqual(result.force.map(unit => unit.count), [1, 2]);
  assert.equal(result.shipsLost, 2);
  assert.deepEqual(force, [bc(), dd()]);
});

test('hits restricted to the firing wing cannot spill into protected ships', () => {
  const result = applyFleetHits([bc(), dd(1)], 8, { keys: ['dd'] });
  assert.equal(result.force[0].count, 2);
  assert.equal(result.force[1].count, 0);
  assert.equal(result.hitsApplied, 1);
  assert.equal(result.hitsUnused, 7);
  assert.throws(() => applyFleetHits([bc(), dd()], 1, {
    keys: ['dd'], allocation: { bc: 1 },
  }), /Invalid hit allocation/);
});

test('a previously wounded battlecruiser takes the next battlecruiser hit across groups', () => {
  const force = [bc(2, { damage: 1 }), ship('other-bc', 'battlecruiser', 1, 6, 2,
    { finishDamagedTypeFirst: true }), dd()];
  assert.throws(() => applyFleetHits(force, 1, { allocation: { 'other-bc': 1 } }), /damaged ship/);
  const result = applyFleetHits(force, 3, { allocation: { bc: 1, 'other-bc': 2 } });
  assert.equal(result.shipsLost, 2);
  assert.equal(result.force[0].count, 1);
  assert.equal(result.force[1].count, 0);
  assert.equal(applyFleetHits(force, 1, { allocation: { dd: 1 } }).force[0].damage, 1,
    'the rule does not force a battlecruiser to take hits assigned to destroyers');
});

test('an allocation cannot spread partial battlecruiser hits across two healthy groups', () => {
  const force = [bc(1), ship('second', 'battlecruiser', 1, 4, 2, { finishDamagedTypeFirst: true })];
  assert.throws(() => applyFleetHits(force, 2, { allocation: { bc: 1, second: 1 } }), /damaged ship/);
  assert.deepEqual(force.map(unit => unit.count), [1, 1]);
});

test('saved damage survives JSON reload and normal validation; only explicit end repair clears it', () => {
  const saved = JSON.parse(JSON.stringify(applyFleetHits([bc()], 1).force));
  assert.equal(fleetUnits(saved)[0].damage, 1);
  const repaired = repairFleetDamage(saved);
  assert.equal(repaired[0].count, 2);
  assert.equal(repaired[0].damage, 0);
  assert.equal(saved[0].damage, 1);
});

test('regrouped sector wounds remain separate until hits finish them before healthy ships', () => {
  const force = [bc(2, { damage: 1 }), ship('regrouped', 'battlecruiser', 2, 4, 2,
    { damage: 1, finishDamagedTypeFirst: true })];
  assert.deepEqual(fleetUnits(JSON.parse(JSON.stringify(force))).map(unit => unit.damage), [1, 1]);
  const one = applyFleetHits(force, 1, { allocation: { bc: 1 } });
  assert.deepEqual(one.force.map(unit => unit.damage), [0, 1]);
  assert.throws(() => applyFleetHits(force, 2, { allocation: { bc: 2 } }), /damaged ship/,
    'a second hit on this group would damage a healthy ship before finishing the other wounded ship');
  const both = applyFleetHits(force, 2, { allocation: { bc: 1, regrouped: 1 } });
  assert.equal(both.shipsLost, 2);
  assert.deepEqual(both.force.map(unit => unit.damage), [0, 0]);
});

test('damage priority applies within eligible sectors rather than redirecting fire across the map', () => {
  const force = [bc(1, { damage: 1 }), ship('other-sector', 'battlecruiser', 1, 4, 2,
    { finishDamagedTypeFirst: true })];
  const result = applyFleetHits(force, 1, { keys: ['other-sector'] });
  assert.deepEqual(result.force.map(unit => unit.damage), [1, 1]);
  assert.equal(result.shipsLost, 0);
});

test('excess hits, empty groups and invalid state cannot create ships or lose partial damage', () => {
  const result = applyFleetHits([bc(1), dd(1)], 20);
  assert.deepEqual(result.force.map(unit => unit.count), [0, 0]);
  assert.equal(result.hitsApplied, 3);
  assert.equal(result.hitsUnused, 17);
  assert.equal(fleetStrength([bc(0), dd(0)]), 0);
  assert.throws(() => fleetUnits([bc(0, { damage: 1 })]), /Invalid ship damage/);
  assert.throws(() => fleetUnits([bc(1, { damage: 2 })]), /Invalid ship damage/);
  assert.throws(() => applyFleetHits([bc()], -1), /Invalid fleet value/);
  assert.throws(() => fleetStrength([bc()], ['missing']), /Invalid firing ships/);
});
