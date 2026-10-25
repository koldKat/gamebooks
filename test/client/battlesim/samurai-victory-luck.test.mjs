import test from 'node:test';
import assert from 'node:assert/strict';
import * as definition from '../../../public/js/battlesim/books/216/definition.js';
import {createCombat} from '../../../public/js/battlesim/books/216/combat.js';
import {createState} from '../../../public/js/battlesim/books/216/state.js';
import {createEffects} from '../../../public/js/battlesim/books/216/effects.js';

function fixture(...rolls) {
  const run = {}, ctx = {...definition, currentPlaythrough: () => run, saveState() {}, _renderAll() {}, showAlert() {}, t: key => key, escapeHtml: String};
  Object.assign(ctx, createState(() => ctx), createCombat(() => ctx), createEffects(() => ctx));
  ctx._roll2d6 = () => {assert.ok(rolls.length, 'Unexpected roll'); return rolls.shift();};
  const d = ctx._data();
  Object.assign(d, {rolled: true, roundsThisBattle: 5, extension: {kept: true}});
  Object.assign(d.player, {skill: 10, skillInitial: 12, stamina: 17, staminaInitial: 24, luck: 7, luckInitial: 12, hasNitoKenjutsu: true, honour: 3, provisions: 3});
  Object.assign(d.enemy, {name: 'Rival', skill: 8, stamina: 6, staminaMax: 10});
  return {ctx, d, run, rolls};
}

test('a bonus-hit victory clears earlier outgoing Luck rather than reviving the enemy', () => {
  const {ctx, d} = fixture(10, 2, 10, 2); d.enemy.stamina = 4; ctx._runRound();
  assert.equal(d.enemy.stamina, 0); assert.equal(d.history.length, 1);
  assert.deepEqual(d.pendingLuckQueue, []);
  const saved = JSON.stringify(d); ctx._testLuck(); assert.equal(JSON.stringify(d), saved);
});

test('Luck finishing the first of two queued hits records one victory and clears only outgoing hits', () => {
  const {ctx, d, run} = fixture(10, 2, 10, 2, 2); ctx._runRound();
  assert.equal(d.enemy.stamina, 2); assert.equal(d.pendingLuckQueue.length, 2);
  run.sim216 = JSON.parse(JSON.stringify(d)); ctx._testLuck();
  assert.equal(run.sim216.enemy.stamina, 0); assert.equal(run.sim216.history.length, 1);
  assert.equal(run.sim216.player.luck, 6); assert.deepEqual(run.sim216.pendingLuckQueue, []);
  const saved = JSON.stringify(run.sim216); ctx._testLuck(); assert.equal(JSON.stringify(run.sim216), saved);
});

test('a saved obsolete outgoing hit cannot spend Luck, revive the target or duplicate history', () => {
  const {ctx, d} = fixture(); d.enemy.stamina = d.player.enemyStaminaFloor = 4;
  d.history.push({enemy: 'Rival', outcome: 'win', ts: 1});
  const side = {kind: 'side-hit', extension: true}, third = {kind: 'side2-hit'};
  d.pendingLuckQueue = [{kind: 'player-hit'}, side, {kind: 'player-hit'}, third];
  ctx._testLuck();
  assert.equal(d.player.luck, 7); assert.equal(d.enemy.stamina, 4); assert.equal(d.history.length, 1);
  assert.deepEqual(d.pendingLuckQueue, [side, third]);
});

test('finishing outgoing Luck preserves incoming side events and their saved fields', () => {
  const {ctx, d} = fixture(2, 2); d.player.enemyStaminaFloor = 4;
  const side = {kind: 'side-hit', extension: true};
  d.pendingLuckQueue = [{kind: 'player-hit'}, side, {kind: 'player-hit'}];
  ctx._testLuck(); assert.equal(d.enemy.stamina, 4); assert.deepEqual(d.pendingLuckQueue, [side]);
  ctx._testLuck(); assert.equal(d.player.stamina, 18); assert.equal(d.player.luck, 5);
  assert.equal(d.history.length, 1); assert.deepEqual(d.extension, {kept: true});
});

test('bonus-hit victory keeps both independent side wounds available for Luck', () => {
  const {ctx, d} = fixture(10, 2, 10, 2, 2, 2, 2, 2, 2, 2);
  d.enemy.stamina = 4; d.pairedFight = d.tripleFight = true;
  Object.assign(d.sideEnemy, {name: 'Second', skill: 20, staminaMax: 6});
  Object.assign(d.sideEnemy2, {name: 'Third', skill: 20, staminaMax: 6});
  ctx._runRound();
  assert.equal(d.player.stamina, 13); assert.equal(d.history.length, 1);
  assert.deepEqual(d.pendingLuckQueue, [{kind: 'side-hit'}, {kind: 'side2-hit'}]);
  ctx._testLuck(); ctx._testLuck(); assert.equal(d.player.stamina, 15); assert.equal(d.history.length, 1);
});

test('captured hit threshold reaches the floor before a bonus roll', () => {
  const {ctx, d, rolls} = fixture(10, 2);
  Object.assign(d.player, {winAfterHits: 3, hitsLandedThisFight: 2, enemyStaminaFloor: 4});
  d.enemy.stamina = 10; ctx._runRound();
  assert.equal(d.enemy.stamina, 4); assert.equal(d.player.hitsLandedThisFight, 3);
  assert.equal(rolls.length, 0); assert.equal(d.history.length, 1); assert.deepEqual(d.pendingLuckQueue, []);
  const saved = JSON.stringify(d); ctx._runRound(); assert.equal(JSON.stringify(d), saved);
});

test('a meal is available after a nonlethal victory without resetting captured progress', () => {
  const {ctx, d} = fixture(); d.enemy.stamina = d.player.enemyStaminaFloor = 4;
  ctx._eatMeal(); assert.equal(d.player.stamina, 21); assert.equal(d.player.provisions, 2);
  assert.equal(d.enemy.stamina, 4); assert.equal(d.roundsThisBattle, 5); assert.equal(d.player.honour, 3);
});

test('meals remain blocked during an active fight', () => {
  const {ctx, d} = fixture(); const saved = JSON.stringify(d); ctx._eatMeal();
  assert.equal(JSON.stringify(d), saved);
});
