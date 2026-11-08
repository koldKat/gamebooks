import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../../../public/js/battlesim/books/211/combat.js';
import { createState } from '../../../public/js/battlesim/books/211/state.js';

function fight(legacy = false) {
  const data = {
    mode: 'ship', rolled: true, roundsShip: 0, roundsPerson: 0, missileDamage: 99,
    player: { skill: 10, stamina: 12, staminaInitial: 24, energyTabletsLeft: 2, money: 321 },
    enemy: { name: 'Rival', skill: 8, stamina: 4, staminaMax: 4 },
    ship: { weaponsStrength: 10, shields: 2, shieldsInitial: 4, smartMissiles: 2 },
    enemyShip: { name: 'Ship', weaponsStrength: 10, shields: 1, shieldsMax: 5 },
    log: [], history: [], extension: { kept: true },
  };
  if (!legacy) data.shipCombatRulesVersion = 2;
  let rolls = [], used = 0;
  const ctx = {
    DEFAULT_MISSILE_DAMAGE: 99, _data: () => data, _notReady: d => !d.rolled,
    escapeHtml: value => value,
    _appendLog: (d, line) => d.log.push(line), _foeNameSafe: () => 'Ship',
    _recordOutcome: (d, _side, outcome) => d.history.push(outcome),
    _renderAll() {}, saveState() {}, t: key => key,
  };
  Object.assign(ctx, createCombat(() => ctx));
  ctx._roll2d6 = () => { used++; return rolls.shift() ?? 2; };
  return { data, ...ctx, dice: (...values) => { rolls = values; }, used: () => used };
}

test('depleting enemy shields allows retaliation; the next hit destroys it', () => {
  const f = fight();
  f._runRound();
  assert.equal(f.data.enemyShip.shields, 0);
  assert.equal(f.data.enemyShip.destroyed, undefined);
  assert.equal(f.data.ship.shields, 1);
  assert.deepEqual(f.data.history, []);
  f._runRound();
  assert.equal(f.data.enemyShip.destroyed, true);
  assert.equal(f.data.ship.shields, 1);
  assert.deepEqual(f.data.history, ['win']);
  assert.equal(f.used(), 3, 'destroyed enemy never returns fire');
  f._runRound();
  assert.deepEqual(f.data.history, ['win']);
});

test('player survives shield depletion and dies only on another successful hit', () => {
  const f = fight();
  f.data.ship.shields = 1;
  f.dice(12, 2, 12, 2);
  f._runRound();
  assert.equal(f.data.ship.shields, 0);
  assert.deepEqual(f.data.history, []);
  f._runRound();
  assert.equal(f.data.ship.destroyed, true);
  assert.deepEqual(f.data.history, ['loss']);
});

test('misses at zero shields cause no destruction', () => {
  const f = fight();
  f.data.ship.shields = f.data.enemyShip.shields = 0;
  f.dice(12, 12);
  f._runRound();
  assert.deepEqual(f.data.history, []);
  assert.equal(f.data.roundsShip, 1);
});

test('legacy saved fights retain depletion victory without acquiring a rules version', () => {
  const f = fight(true);
  f._runRound();
  assert.deepEqual(f.data.history, ['win']);
  assert.equal(f.used(), 1);
  assert.equal(f.data.shipCombatRulesVersion, undefined);
  assert.equal(f.data.enemyShip.destroyed, undefined);
});

test('ordinary Smart Missiles destroy even a ship with more than 99 shields', () => {
  const f = fight();
  f.data.ship.shields = 0;
  f.data.enemyShip.shields = 1000;
  f._fireMissile();
  assert.equal(f.data.enemyShip.shields, 0);
  assert.equal(f.data.enemyShip.destroyed, true);
  assert.deepEqual(f.data.history, ['win']);
  assert.equal(f.used(), 0);
  assert.equal(f.data.ship.smartMissiles, 1);
});

test('saved missile damage exception remains limited and legacy missiles remain unchanged', () => {
  const f = fight();
  f.data.missileDamage = 2;
  f.data.enemyShip.shields = 2;
  f._fireMissile();
  assert.equal(f.data.enemyShip.shields, 0);
  assert.deepEqual(f.data.history, []);
  f._fireMissile();
  assert.deepEqual(f.data.history, ['win']);
  const old = fight(true);
  old.data.enemyShip.shields = 150;
  old._fireMissile();
  assert.equal(old.data.enemyShip.shields, 51);
  assert.deepEqual(old.data.history, []);
});

test('explicit ship reset starts new rules without resetting supplies or person progress', () => {
  const f = fight(true);
  f.data.ship.destroyed = f.data.enemyShip.destroyed = true;
  const player = structuredClone(f.data.player);
  f._resetBattle();
  assert.equal(f.data.shipCombatRulesVersion, 2);
  assert.equal(f.data.ship.destroyed, false);
  assert.equal(f.data.enemyShip.destroyed, false);
  assert.equal(f.data.ship.shields, 4);
  assert.equal(f.data.enemyShip.shields, 5);
  assert.equal(f.data.ship.smartMissiles, 2);
  assert.deepEqual(f.data.player, player);
  assert.deepEqual(f.data.extension, { kept: true });
});

test('person blaster combat still ends at zero stamina without retaliation', () => {
  const f = fight();
  f.data.mode = 'blaster';
  f._runRound();
  assert.equal(f.data.enemy.stamina, 0);
  assert.equal(f.data.player.stamina, 12);
  assert.deepEqual(f.data.history, ['win']);
  assert.equal(f.used(), 1);
});

test('only newly created state receives the new ship rules automatically', () => {
  const pt = {};
  const state = createState(() => ({ currentPlaythrough: () => pt,
    DEFAULT_MISSILE_DAMAGE: 99, MAX_ENERGY_TABLETS: 4, MAX_SMART_MISSILES: 2 }));
  const fresh = state._data();
  assert.equal(fresh.shipCombatRulesVersion, 2);
  delete fresh.shipCombatRulesVersion;
  const before = JSON.stringify(fresh);
  state._data();
  assert.equal(JSON.stringify(fresh), before);
});

test('an unconfigured enemy cannot award a victory or consume a missile', () => {
  const f = fight();
  f.data.enemyShip.shields = f.data.enemyShip.shieldsMax = 0;
  const before = JSON.stringify(f.data);
  f._runRound();
  f._fireMissile();
  assert.equal(JSON.stringify(f.data), before);
  assert.equal(f.used(), 0);
});
