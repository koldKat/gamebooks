import test from 'node:test';
import assert from 'node:assert/strict';
import * as definition from '../../../public/js/battlesim/books/207/definition.js';
import {createCombat} from '../../../public/js/battlesim/books/207/combat.js';
import {createState} from '../../../public/js/battlesim/books/207/state.js';
import {loadFixtureRoster} from './roster-fixtures.mjs';

await loadFixtureRoster(207);
function fixture() {
  const run = {}, ctx = {...definition, currentPlaythrough: () => run, saveState() {}, _renderAll() {}, t: key => key, escapeHtml: String};
  Object.assign(ctx, createState(() => ctx), createCombat(() => ctx));
  ctx._roll2d6 = () => 2;
  const d = ctx._data();
  Object.assign(d, {rolled: true, roundsThisBattle: 5, extension: {kept: true}});
  Object.assign(d.player, {skill: 10, skillInitial: 12, stamina: 24, staminaInitial: 24, luck: 7, luckInitial: 12, skillDrain: true, enemyWoundDamage: 5, potionUsesLeft: 0, provisionsLeft: 3});
  Object.assign(d.enemy, {name: 'Saved rival', skill: 20, stamina: 10, staminaMax: 15});
  return {ctx, d, run};
}

test('primary wound drains skill before both independent side attacks', () => {
  const {ctx, d} = fixture();
  d.pairedFight = d.tripleFight = true;
  Object.assign(d.sideEnemy, {name: 'Second', skill: 10, staminaMax: 6});
  Object.assign(d.sideEnemy2, {name: 'Third', skill: 10, staminaMax: 6});
  ctx._runRound();
  assert.equal(d.player.skill, 9);
  assert.equal(d.player.stamina, 15);
  assert.deepEqual(d.pendingLuckQueue, [{kind: 'enemy-hit'}, {kind: 'side-hit'}, {kind: 'side2-hit'}]);
  assert.equal(d.roundsThisBattle, 6);
  assert.equal(d.player.potionUsesLeft, 0);
  assert.equal(d.player.provisionsLeft, 3);
});

test('saved incoming Luck resolves once without undoing or replaying skill drain', () => {
  const {ctx, d, run} = fixture(); ctx._runRound();
  run.sim207 = JSON.parse(JSON.stringify(d));
  ctx._testLuck(); ctx._skipLuck();
  assert.equal(run.sim207.player.skill, 9);
  assert.equal(run.sim207.player.stamina, 20);
  assert.equal(run.sim207.player.luck, 6);
  assert.equal(run.sim207.roundsThisBattle, 6);
  assert.deepEqual(run.sim207.pendingLuckQueue, []);
  assert.deepEqual(run.sim207.extension, {kept: true});
});

test('catalog drain amount controls combat and clamps depleted skill', () => {
  const amount = definition.TALISMAN_RULES.skillDrain;
  try {
    definition.TALISMAN_RULES.skillDrain = 3;
    const a = fixture(); a.ctx._runRound(); assert.equal(a.d.player.skill, 7);
    const b = fixture(); b.d.player.skill = 2; b.ctx._runRound(); assert.equal(b.d.player.skill, 0);
  } finally { definition.TALISMAN_RULES.skillDrain = amount; }
});

test('manual drain toggle and primary-only application remain unchanged', () => {
  const a = fixture(); a.d.player.skillDrain = false; a.ctx._runRound(); assert.equal(a.d.player.skill, 10);
  const b = fixture(); b.d.enemy.skill = 10; b.d.pairedFight = true;
  Object.assign(b.d.sideEnemy, {name: 'Second', skill: 20, staminaMax: 6});
  b.ctx._runRound(); assert.equal(b.d.player.skill, 10); assert.equal(b.d.player.stamina, 22);
  assert.deepEqual(b.d.pendingLuckQueue, [{kind: 'side-hit'}]);
});

test('captured hit threshold and floor retain victory without skill drain', () => {
  const {ctx, d} = fixture();
  d.enemy.skill = 0; d.player.winAfterHits = 3; d.player.hitsLandedThisFight = 2; d.player.enemyStaminaFloor = 4;
  ctx._runRound();
  assert.equal(d.enemy.stamina, 4); assert.equal(d.player.skill, 10);
  assert.equal(d.player.hitsLandedThisFight, 3); assert.equal(d.history.length, 1);
  assert.deepEqual(d.pendingLuckQueue, []);
});
