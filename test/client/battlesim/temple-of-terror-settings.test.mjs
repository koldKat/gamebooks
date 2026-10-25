import test from 'node:test';
import assert from 'node:assert/strict';
import * as definition from '../../../public/js/battlesim/books/210/definition.js';
import {createCombat} from '../../../public/js/battlesim/books/210/combat.js';
import {createState} from '../../../public/js/battlesim/books/210/state.js';
import {loadFixtureRoster} from './roster-fixtures.mjs';

await loadFixtureRoster(210);
function fixture(...faces) {
  const run = {}, ctx = {...definition, currentPlaythrough: () => run, saveState() {}, _renderAll() {}, t: key => key, escapeHtml: String};
  Object.assign(ctx, createState(() => ctx), createCombat(() => ctx));
  ctx._roll2d6 = () => 2;
  ctx._roll1d6 = () => {assert.ok(faces.length, 'Unexpected special-effect roll'); return faces.shift();};
  const d = ctx._data();
  Object.assign(d, {rolled: true, roundsThisBattle: 5, extension: {kept: true}});
  Object.assign(d.player, {skill: 10, skillInitial: 12, stamina: 24, staminaInitial: 24, luck: 7, luckInitial: 12, fireBreath: true, electricShock: true, gold: 13, provisionsLeft: 3});
  Object.assign(d.enemy, {name: 'Saved rival', skill: 20, stamina: 8, staminaMax: 10});
  return {ctx, d, run, faces};
}

test('all 36 fire/shock rolls preserve damage and independent Luck queues after an enemy win', () => {
  for (let fire = 1; fire <= 6; fire++) for (let shock = 1; shock <= 6; shock++) {
    const {ctx, d, faces} = fixture(fire, shock); ctx._runRound();
    assert.equal(d.player.stamina, 22 - (fire <= 2 ? 1 : 0) - (shock <= 3 ? 2 : 0));
    assert.deepEqual(d.pendingLuckQueue, [{kind: 'enemy-hit'}, ...(fire <= 2 ? [{kind: 'fire-hit'}] : []), ...(shock <= 3 ? [{kind: 'shock-hit'}] : [])]);
    assert.equal(faces.length, 0); assert.equal(d.roundsThisBattle, 6);
    assert.equal(d.player.gold, 13); assert.equal(d.player.provisionsLeft, 3);
  }
});

test('shock only rolls after the primary enemy wins, while fire still rolls on ties and player wins', () => {
  for (const skill of [0, 10]) {
    const {ctx, d, faces} = fixture(1); d.enemy.skill = skill; ctx._runRound();
    assert.equal(d.player.stamina, 23); assert.equal(faces.length, 0);
    assert.equal(d.enemy.stamina, skill === 0 ? 6 : 8);
    assert.deepEqual(d.pendingLuckQueue, [...(skill === 0 ? [{kind: 'player-hit'}] : []), {kind: 'fire-hit'}]);
  }
});

test('fatal primary or fire wounds do not consume later special-effect rolls', () => {
  const primary = fixture(); primary.d.player.stamina = 2; primary.ctx._runRound();
  assert.equal(primary.d.player.stamina, 0); assert.equal(primary.d.history.length, 1); assert.deepEqual(primary.d.pendingLuckQueue, []);
  const fire = fixture(1); fire.d.player.stamina = 3; fire.ctx._runRound();
  assert.equal(fire.d.player.stamina, 0); assert.equal(fire.d.history.length, 1); assert.equal(fire.faces.length, 0); assert.deepEqual(fire.d.pendingLuckQueue, []);
});

test('catalog thresholds control both effect hit chances', () => {
  const {fireHitMax, shockHitMax} = definition.TEMPLE_RULES;
  try {
    definition.TEMPLE_RULES.fireHitMax = 4; definition.TEMPLE_RULES.shockHitMax = 5;
    const {ctx, d} = fixture(4, 5); ctx._runRound();
    assert.equal(d.player.stamina, 19); assert.equal(d.pendingLuckQueue.length, 3);
  } finally { Object.assign(definition.TEMPLE_RULES, {fireHitMax, shockHitMax}); }
});

test('saved effect queues resolve once without replaying special damage or losing supplies', () => {
  const {ctx, d, run} = fixture(); d.player.stamina = 17;
  d.pendingLuckQueue = [{kind: 'fire-hit', extension: true}, {kind: 'shock-hit'}, {kind: 'side-hit'}];
  run.sim210 = JSON.parse(JSON.stringify(d));
  ctx._testLuck(); ctx._skipLuck(); ctx._testLuck();
  const saved = run.sim210;
  assert.equal(saved.player.stamina, 19); assert.equal(saved.player.luck, 5);
  assert.equal(saved.roundsThisBattle, 5); assert.deepEqual(saved.pendingLuckQueue, []);
  assert.equal(saved.player.gold, 13); assert.equal(saved.player.provisionsLeft, 3);
  assert.deepEqual(saved.extension, {kept: true});
});
