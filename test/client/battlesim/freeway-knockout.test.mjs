import test from 'node:test';
import assert from 'node:assert/strict';
import * as definition from '../../../public/js/battlesim/books/209/definition.js';
import {createCombat} from '../../../public/js/battlesim/books/209/combat.js';
import {createState} from '../../../public/js/battlesim/books/209/state.js';
import {createEffects} from '../../../public/js/battlesim/books/209/effects.js';

function fixture() {
  const run = {}, ctx = {...definition, currentPlaythrough: () => run, saveState() {}, _renderAll() {}, showAlert() {}, t: key => key, escapeHtml: String};
  Object.assign(ctx, createState(() => ctx), createCombat(() => ctx), createEffects(() => ctx));
  ctx._roll2d6 = () => 2; ctx._roll1d6 = () => 3;
  const d = ctx._data();
  Object.assign(d, {rolled: true, roundsPerson: 5, roundsVehicle: 2, enemyHandLoss: 5, extension: {kept: true}});
  Object.assign(d.player, {skill: 10, skillInitial: 12, stamina: 20, staminaInitial: 30, medKitLeft: 3});
  Object.assign(d.enemy, {name: 'Rival', skill: 8, stamina: 10, staminaMax: 15});
  Object.assign(d.car, {firepower: 10, firepowerInitial: 12, armour: 17, armourInitial: 30, rockets: 1, spikes: 1, oil: 0});
  Object.assign(d.enemyCar, {name: 'Car', firepower: 8, armour: 12, armourMax: 15});
  return {ctx, d, run};
}

test('six cumulative hand wounds finish once and block further rolls', () => {
  for (const loses of [false, true]) {
    const {ctx, d} = fixture();
    if (loses) {d.enemy.skill = 20; d.enemyHandLoss = 0; d.playerHandLoss = 5;}
    ctx._runRound();
    assert.equal(d.history.length, 1);
    assert.equal(d.history[0].outcome, loses ? 'loss' : 'win');
    const saved = JSON.stringify(d);
    ctx._roll2d6 = () => {throw Error('Completed knockout rolled again');};
    ctx._runRound();
    assert.equal(JSON.stringify(d), saved);
  }
});

test('loaded knockout counters block combat without inventing a new history entry', () => {
  const {ctx, d, run} = fixture(); d.enemyHandLoss = 6;
  run.sim209 = JSON.parse(JSON.stringify(d));
  const saved = JSON.stringify(run.sim209); ctx._runRound();
  assert.equal(JSON.stringify(run.sim209), saved);
});

test('a med-kit can be used after knockout without resetting cumulative wounds', () => {
  const {ctx, d} = fixture(); ctx._runRound(); ctx._useMedKit();
  assert.equal(d.player.stamina, 24); assert.equal(d.player.medKitLeft, 2);
  assert.equal(d.enemyHandLoss, 6); assert.equal(d.history.length, 1);
});

test('hand knockout counters do not block shooting or vehicle combat', () => {
  for (const mode of ['shoot', 'vehicle']) {
    const {ctx, d} = fixture(); d.enemyHandLoss = d.playerHandLoss = 6; d.mode = mode;
    ctx._runRound();
    assert.equal(mode === 'shoot' ? d.enemy.stamina : d.enemyCar.armour, mode === 'shoot' ? 7 : 9);
    assert.equal(d.roundsPerson, mode === 'shoot' ? 6 : 5);
    assert.equal(d.roundsVehicle, mode === 'vehicle' ? 3 : 2);
    assert.equal(d.history.length, 0);
  }
});

test('reset clears only the active hand fight and preserves car and supplies', () => {
  const {ctx, d} = fixture(); ctx._runRound(); const car = JSON.stringify(d.car);
  ctx._resetBattle();
  assert.equal(d.enemyHandLoss, 0); assert.equal(d.playerHandLoss, 0);
  assert.equal(d.roundsPerson, 0); assert.equal(d.roundsVehicle, 2);
  assert.equal(JSON.stringify(d.car), car); assert.equal(d.player.medKitLeft, 3);
  assert.deepEqual(d.extension, {kept: true}); assert.equal(d.history.length, 1);
});
