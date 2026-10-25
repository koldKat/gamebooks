import test from 'node:test';
import assert from 'node:assert/strict';
import * as definition from '../../../public/js/battlesim/books/201/definition.js';
import {createCombat} from '../../../public/js/battlesim/books/201/combat.js';
import {createState} from '../../../public/js/battlesim/books/201/state.js';
import {loadFixtureRoster} from './roster-fixtures.mjs';

await loadFixtureRoster(201);
function fixture(face = 1) {
  const run = {}, ctx = {...definition, currentPlaythrough: () => run, saveState() {}, _renderAll() {}, t: key => key, escapeHtml: String};
  Object.assign(ctx, createState(() => ctx), createCombat(() => ctx));
  ctx._roll1d6 = () => face; ctx._roll2d6 = () => 2;
  const d = ctx._data();
  Object.assign(d, {rolled: true, roundsThisBattle: 5, extension: {kept: true}});
  Object.assign(d.player, {skill: 10, skillInitial: 12, stamina: 17, staminaInitial: 24, luck: 7, luckInitial: 12, lizardineBreath: true, potionUsesLeft: 0, provisionsLeft: 3});
  Object.assign(d.enemy, {name: 'Lizardine', skill: 10, stamina: 8, staminaMax: 8});
  return {ctx, d};
}

test('all six breath faces retain original wounds, queues and consumed supplies', () => {
  for (let face = 1; face <= 6; face++) {
    const {ctx, d} = fixture(face); ctx._runRound();
    assert.equal(d.player.stamina, face <= 3 ? 16 : 17);
    assert.deepEqual(d.pendingLuckQueue, face <= 3 ? [{kind: 'fire-hit'}] : []);
    assert.equal(d.roundsThisBattle, 6);
    assert.equal(d.player.potionUsesLeft, 0); assert.equal(d.player.provisionsLeft, 3);
  }
});

test('loaded breath threshold controls its hit independently of ordinary combat', () => {
  const threshold = definition.CITY_RULES.fireHitMax;
  try {
    definition.CITY_RULES.fireHitMax = 4;
    const {ctx, d} = fixture(4); ctx._runRound();
    assert.equal(d.player.stamina, 16); assert.equal(d.enemy.stamina, 8);
  } finally { definition.CITY_RULES.fireHitMax = threshold; }
});

test('saved queued fire and side wounds resolve once without replaying the round', () => {
  const {ctx, d} = fixture();
  d.pendingLuckQueue = JSON.parse(JSON.stringify([{kind: 'fire-hit', extension: true}, {kind: 'side-hit'}]));
  ctx._testLuck(); assert.equal(d.player.stamina, 18); assert.equal(d.player.luck, 6);
  assert.deepEqual(d.pendingLuckQueue, [{kind: 'side-hit'}]);
  ctx._skipLuck(); assert.deepEqual(d.pendingLuckQueue, []);
  assert.equal(d.roundsThisBattle, 5); assert.deepEqual(d.extension, {kept: true});
});

test('custom wound damage and brooch healing retain their saved encounter behavior', () => {
  const loss = fixture(6); loss.d.enemy.skill = 20; loss.d.player.enemyWoundDamage = 5;
  loss.ctx._runRound(); assert.equal(loss.d.player.stamina, 12);
  assert.deepEqual(loss.d.pendingLuckQueue, [{kind: 'enemy-hit'}]);
  const win = fixture(); win.d.enemy.skill = 0; win.d.enemy.stamina = 2; win.d.player.hasHealingBrooch = true;
  win.ctx._runRound(); assert.equal(win.d.player.stamina, 17);
  assert.equal(win.d.history.length, 1); assert.equal(win.d.history[0].outcome, 'win');
  assert.deepEqual(win.d.pendingLuckQueue, [{kind: 'fire-hit'}]);
  win.ctx._testLuck(); assert.equal(win.d.player.stamina, 18); assert.equal(win.d.history.length, 1);
});
