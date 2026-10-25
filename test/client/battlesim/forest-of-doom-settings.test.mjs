import test from 'node:test';
import assert from 'node:assert/strict';
import * as definition from '../../../public/js/battlesim/books/200/definition.js';
import {createCombat} from '../../../public/js/battlesim/books/200/combat.js';
import {createState} from '../../../public/js/battlesim/books/200/state.js';
import {loadFixtureRoster} from './roster-fixtures.mjs';

await loadFixtureRoster(200);
function fixture(face = 1) {
  const run = {}, ctx = {...definition, currentPlaythrough: () => run, saveState() {}, _renderAll() {}, t: key => key, escapeHtml: String};
  Object.assign(ctx, createState(() => ctx), createCombat(() => ctx));
  ctx._roll1d6 = () => face; ctx._roll2d6 = () => 2;
  const d = ctx._data();
  Object.assign(d, {rolled: true, roundsThisBattle: 5, extension: {kept: true}});
  Object.assign(d.player, {skill: 10, skillInitial: 12, stamina: 17, staminaInitial: 24, luck: 7, luckInitial: 12, fireDemonWhip: true, woundsTakenThisFight: 2, potionUsesLeft: 1});
  Object.assign(d.enemy, {name: 'Fire Demon', skill: 10, stamina: 10, staminaMax: 10});
  return {ctx, d};
}

test('all six whip faces retain their original wounds and Luck queues', () => {
  for (let face = 1; face <= 6; face++) {
    const {ctx, d} = fixture(face); ctx._runRound();
    assert.equal(d.player.stamina, face <= 2 ? 16 : 17);
    assert.equal(d.player.woundsTakenThisFight, face <= 2 ? 3 : 2);
    assert.deepEqual(d.pendingLuckQueue, face <= 2 ? [{kind: 'whip-hit'}] : []);
    assert.equal(d.roundsThisBattle, 6);
    assert.equal(d.player.potionUsesLeft, 1);
  }
});

test('loaded encounter threshold controls the whip independently of ordinary combat', () => {
  const threshold = definition.FOREST_RULES.whipHitMax;
  try {
    definition.FOREST_RULES.whipHitMax = 3;
    const {ctx, d} = fixture(3); ctx._runRound();
    assert.equal(d.player.stamina, 16); assert.equal(d.enemy.stamina, 10);
  } finally { definition.FOREST_RULES.whipHitMax = threshold; }
});

test('saved queued wounds resolve once without replaying turns or changing wound counters', () => {
  const {ctx, d} = fixture();
  d.pendingLuckQueue = JSON.parse(JSON.stringify([{kind: 'whip-hit', extension: true}, {kind: 'side-hit'}]));
  ctx._testLuck();
  assert.equal(d.player.stamina, 18); assert.equal(d.player.luck, 6);
  assert.deepEqual(d.pendingLuckQueue, [{kind: 'side-hit'}]);
  ctx._skipLuck();
  assert.deepEqual(d.pendingLuckQueue, []); assert.equal(d.roundsThisBattle, 5);
  assert.equal(d.player.woundsTakenThisFight, 2); assert.deepEqual(d.extension, {kept: true});
});

test('victory retains same-round whip Luck while paralysis clears the queue', () => {
  const win = fixture(); win.d.enemy.skill = 0; win.d.enemy.stamina = 2;
  win.ctx._runRound();
  assert.equal(win.d.history.length, 1); assert.equal(win.d.history[0].outcome, 'win');
  assert.deepEqual(win.d.pendingLuckQueue, [{kind: 'whip-hit'}]);
  win.ctx._testLuck(); assert.equal(win.d.player.stamina, 17); assert.equal(win.d.history.length, 1);
  const loss = fixture(); loss.d.player.paralyzeThreshold = 3; loss.ctx._runRound();
  assert.equal(loss.d.player.stamina, 0); assert.equal(loss.d.history[0].outcome, 'loss');
  assert.deepEqual(loss.d.pendingLuckQueue, []);
});
