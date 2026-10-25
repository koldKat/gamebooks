import test from 'node:test';
import assert from 'node:assert/strict';
import * as definition from '../../../public/js/battlesim/books/214/definition.js';
import {createCombat} from '../../../public/js/battlesim/books/214/combat.js';
import {createState} from '../../../public/js/battlesim/books/214/state.js';
import {loadFixtureRoster} from './roster-fixtures.mjs';

await loadFixtureRoster(214);
function fixture(face = 1) {
  const run = {}, ctx = {...definition, currentPlaythrough: () => run, saveState() {}, _renderAll() {}, t: key => key, escapeHtml: String};
  Object.assign(ctx, createState(() => ctx), createCombat(() => ctx));
  ctx._roll2d6 = () => 2; ctx._roll1d6 = () => face;
  const d = ctx._data();
  Object.assign(d, {rolled: true, roundsThisBattle: 5, enemyHitStreak: 2, extension: {kept: true}});
  Object.assign(d.player, {skill: 10, skillInitial: 12, stamina: 24, staminaInitial: 24, luck: 7, luckInitial: 12, enemyWoundDamage: 5, forceLossAfterRounds: 6, hasTailAttack: true, escalatingDamage: true});
  Object.assign(d.enemy, {name: 'Saved rival', skill: 20, stamina: 8, staminaMax: 10});
  return {ctx, d, run};
}

test('all six tail rolls remain independent of a primary win, loss or tie', () => {
  for (let face = 1; face <= 6; face++) for (const skill of [0, 10, 20]) {
    const {ctx, d} = fixture(face); d.enemy.skill = skill; ctx._runRound();
    assert.equal(d.player.stamina, 24 - (skill === 20 ? 4 : 0) - (face >= 5 ? 2 : 0));
    assert.equal(d.enemyHitStreak, skill === 20 ? 3 : 2);
    assert.deepEqual(d.pendingLuckQueue, skill === 20 ? [{kind: 'enemy-hit'}] : skill === 0 ? [{kind: 'player-hit'}] : []);
    assert.equal(d.roundsThisBattle, 6);
  }
});

test('saved Luck does not replay tail damage or increment the escalating hit counter', () => {
  const {ctx, d, run} = fixture(); d.player.stamina = 17; d.enemyHitStreak = 3;
  d.pendingLuckQueue = [{kind: 'enemy-hit', extension: true}]; run.sim214 = JSON.parse(JSON.stringify(d));
  ctx._testLuck(); assert.equal(run.sim214.player.stamina, 18); assert.equal(run.sim214.enemyHitStreak, 3);
  assert.equal(run.sim214.roundsThisBattle, 5); ctx._runRound();
  assert.equal(run.sim214.player.stamina, 13); assert.equal(run.sim214.enemyHitStreak, 4);
  assert.deepEqual(run.sim214.extension, {kept: true});
});

test('catalog settings drive escalating damage and tail threshold/damage', () => {
  const saved = {...definition.REBEL_RULES};
  try {
    Object.assign(definition.REBEL_RULES, {escalatingBaseDamage: 4, escalatingPerHit: 2, tailHitMin: 4, tailDamage: 3});
    const {ctx, d} = fixture(4); ctx._runRound();
    assert.equal(d.player.stamina, 13); assert.equal(d.enemyHitStreak, 3);
  } finally { Object.assign(definition.REBEL_RULES, saved); }
});

test('fatal primary wounds skip the independent tail roll and clear pending Luck', () => {
  const {ctx, d} = fixture(); d.player.stamina = 3;
  ctx._roll1d6 = () => {throw Error('Dead player received an extra tail roll');}; ctx._runRound();
  assert.equal(d.player.stamina, 0); assert.equal(d.enemyHitStreak, 3);
  assert.deepEqual(d.pendingLuckQueue, []); assert.equal(d.history.length, 1);
});

test('tail still resolves on a victorious primary exchange without adding its own Luck event', () => {
  const {ctx, d} = fixture(5); d.enemy.skill = 0; d.enemy.stamina = 2; ctx._runRound();
  assert.equal(d.player.stamina, 22); assert.equal(d.enemy.stamina, 0);
  assert.equal(d.history.length, 1); assert.equal(d.history[0].playerStamina, 22);
  assert.deepEqual(d.pendingLuckQueue, []);
});

test('disabled encounter toggles preserve custom wounds and the existing hit counter', () => {
  const {ctx, d} = fixture(); d.player.hasTailAttack = d.player.escalatingDamage = false;
  ctx._roll1d6 = () => {throw Error('Disabled tail rolled');}; ctx._runRound();
  assert.equal(d.player.stamina, 19); assert.equal(d.enemyHitStreak, 2);
  assert.equal(d.player.enemyWoundDamage, 5); ctx._skipLuck();
  assert.ok(d.log.includes('battlesim214.log.round_limit')); assert.equal(d.history.length, 0);
});
