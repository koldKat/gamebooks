import test from 'node:test';
import assert from 'node:assert/strict';
import * as definition from '../../../public/js/battlesim/books/213/definition.js';
import {createCombat} from '../../../public/js/battlesim/books/213/combat.js';
import {createState} from '../../../public/js/battlesim/books/213/state.js';
import {loadFixtureRoster} from './roster-fixtures.mjs';

await loadFixtureRoster(213);
function fixture() {
  const run = {}, ctx = {...definition, currentPlaythrough: () => run, saveState() {}, _renderAll() {}, showAlert() {}, t: key => key, escapeHtml: String};
  Object.assign(ctx, createState(() => ctx), createCombat(() => ctx));
  ctx._roll2d6 = () => 2;
  const d = ctx._data();
  Object.assign(d, {rolled: true, roundsThisBattle: 5, extension: {kept: true}});
  Object.assign(d.player, {skill: 10, skillInitial: 12, stamina: 17, staminaInitial: 24, luck: 7, luckInitial: 12, heroPoints: 3, superPower: 'energyblast', enemyWoundDamage: 5, forceLossAfterRounds: 6});
  Object.assign(d.enemy, {name: 'Saved rival', skill: 8, stamina: 4, staminaMax: 10});
  return {ctx, d, run};
}

test('surrender waits for queued Luck, then capture records one victory without a Hero Point penalty', () => {
  const {ctx, d, run} = fixture(); ctx._runRound();
  assert.equal(d.enemy.stamina, 2); assert.equal(d.pendingSurrender, false);
  run.sim213 = JSON.parse(JSON.stringify(d)); ctx._skipLuck();
  assert.equal(run.sim213.pendingSurrender, true);
  ctx._captureEnemy(); const saved = JSON.stringify(run.sim213); ctx._captureEnemy(); ctx._runRound();
  assert.equal(JSON.stringify(run.sim213), saved);
  assert.equal(run.sim213.history.length, 1); assert.equal(run.sim213.player.heroPoints, 3);
});

test('unlucky outgoing Luck can lift an enemy out of the surrender window', () => {
  const {ctx, d} = fixture(); ctx._runRound(); ctx._roll2d6 = () => 12; ctx._testLuck();
  assert.equal(d.enemy.stamina, 3); assert.equal(d.pendingSurrender, false);
  assert.equal(d.history.length, 0); assert.equal(d.player.luck, 6);
});

test('finishing a surrender or killing outright charges the Hero Point penalty once', () => {
  const surrender = fixture(); surrender.d.pendingSurrender = true; surrender.d.enemy.stamina = 2;
  surrender.ctx._finishEnemy(); surrender.ctx._finishEnemy();
  assert.equal(surrender.d.player.heroPoints, 2); assert.equal(surrender.d.history.length, 1);
  const kill = fixture(); kill.d.enemy.stamina = 2; kill.ctx._runRound(); kill.ctx._runRound();
  assert.equal(kill.d.player.heroPoints, 2); assert.equal(kill.d.history.length, 1);
});

test('catalog surrender ceiling controls the resolver without changing captured progress', () => {
  const old = definition.FEAR_RULES.surrenderStaminaMax;
  try {
    definition.FEAR_RULES.surrenderStaminaMax = 1;
    const {ctx, d} = fixture(); d.enemy.stamina = 2; ctx._resolveRoundEnd(d);
    assert.equal(d.pendingSurrender, false); d.enemy.stamina = 1; ctx._resolveRoundEnd(d);
    assert.equal(d.pendingSurrender, true); assert.equal(d.roundsThisBattle, 5);
    assert.deepEqual(d.extension, {kept: true});
  } finally { definition.FEAR_RULES.surrenderStaminaMax = old; }
});

test('successful Energy Blast cannot be repeated against a defeated enemy', () => {
  const {ctx, d} = fixture(); d.roundsThisBattle = 0; ctx._attemptEnergyBlast();
  assert.equal(d.player.stamina, 15); assert.equal(d.enemy.stamina, 0);
  assert.equal(d.history.length, 1); assert.equal(d.player.heroPoints, 3);
  const saved = JSON.stringify(d); ctx._roll2d6 = () => {throw Error('Completed blast rolled again');};
  ctx._attemptEnergyBlast(); assert.equal(JSON.stringify(d), saved);
});

test('Energy Blast cannot act for a dead player or bypass unresolved Luck/surrender', () => {
  for (const blocked of ['dead', 'luck', 'surrender']) {
    const {ctx, d} = fixture(); d.roundsThisBattle = 0;
    if (blocked === 'dead') d.player.stamina = 0;
    if (blocked === 'luck') d.pendingLuckQueue = [{kind: 'enemy-hit'}];
    if (blocked === 'surrender') d.pendingSurrender = true;
    const saved = JSON.stringify(d); ctx._attemptEnergyBlast(); assert.equal(JSON.stringify(d), saved);
  }
});

test('custom incoming wounds, saved Luck and advisory round limits retain their behavior', () => {
  const {ctx, d} = fixture(); d.enemy.skill = 20; ctx._runRound();
  assert.equal(d.player.stamina, 12); assert.equal(d.roundsThisBattle, 6);
  assert.equal(d.history.length, 0); ctx._testLuck();
  assert.equal(d.player.stamina, 13); assert.equal(d.player.luck, 6);
  assert.ok(d.log.includes('battlesim213.log.round_limit'));
  ctx._runRound(); assert.equal(d.roundsThisBattle, 7); assert.equal(d.player.stamina, 8);
});
