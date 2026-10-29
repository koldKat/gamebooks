import { readRosterDocument } from '../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as definition from '../../../public/js/battlesim/books/205/definition.js';
import {createCombat} from '../../../public/js/battlesim/books/205/combat.js';
import {createState} from '../../../public/js/battlesim/books/205/state.js';
import {loadFixtureRoster} from './roster-fixtures.mjs';

await loadFixtureRoster(205);
function fixture(...faces) {
  const run = {}, ctx = {...definition, currentPlaythrough: () => run, saveState() {}, _renderAll() {}, t: key => key, escapeHtml: String};
  Object.assign(ctx, createState(() => ctx), createCombat(() => ctx));
  let calls = 0;
  ctx._roll1d6 = () => { assert(faces.length, 'Unexpected extra roll'); calls++; return faces.shift(); };
  ctx._roll2d6 = () => 2;
  const d = ctx._data();
  Object.assign(d, {rolled: true, roundsThisBattle: 5, extension: {kept: true}});
  Object.assign(d.player, {skill: 10, skillInitial: 12, stamina: 17, staminaInitial: 24, luck: 7, luckInitial: 12, iceDemonGas: true, whiteDragonBreath: true, potionUsesLeft: 0, provisionsLeft: 3});
  Object.assign(d.enemy, {name: 'Saved rival', skill: 10, stamina: 8, staminaMax: 8});
  return {ctx, d, calls: () => calls};
}

test('all gas and breath faces retain damage, ordering and separate Luck behavior', () => {
  for (let gas = 1; gas <= 6; gas++) for (let breath = 1; breath <= 6; breath++) {
    const {ctx, d, calls} = fixture(gas, breath); ctx._runRound();
    assert.equal(d.player.stamina, 17 - Number(gas <= 3) - 2 * Number(breath <= 2));
    assert.equal(calls(), 2); assert.deepEqual(d.pendingLuckQueue, []);
    assert.equal(d.roundsThisBattle, 6); assert.equal(d.player.potionUsesLeft, 0);
    assert.equal(d.player.provisionsLeft, 3);
  }
});

test('gold ring still consumes the breath roll while fatal gas prevents that roll', () => {
  const ring = fixture(1, 1); ring.d.player.hasGoldRing = true; ring.ctx._extraRoundEffects(ring.d);
  assert.equal(ring.d.player.stamina, 16); assert.equal(ring.calls(), 2);
  const fatal = fixture(1); fatal.d.player.stamina = 1; fatal.ctx._extraRoundEffects(fatal.d);
  assert.equal(fatal.d.player.stamina, 0); assert.equal(fatal.calls(), 1);
});

test('saved queued Luck resolves without repeating gas, breath or combat turns', () => {
  const {ctx, d, calls} = fixture();
  d.pendingLuckQueue = JSON.parse(JSON.stringify([{kind: 'enemy-hit', extension: true}, {kind: 'side-hit'}]));
  ctx._testLuck(); ctx._skipLuck();
  assert.equal(d.player.stamina, 18); assert.equal(d.player.luck, 6);
  assert.deepEqual(d.pendingLuckQueue, []); assert.equal(d.roundsThisBattle, 5);
  assert.equal(calls(), 0); assert.deepEqual(d.extension, {kept: true});
});

test('catalog settings supply both public damage exports and encounter thresholds', async () => {
  const isolated = await import('../../../public/js/battlesim/books/205/definition.js?settings-test');
  const seed = readRosterDocument(205);
  Object.assign(seed.enemies[0].stats.entry, {gasDamage: 3, gasHitMax: 4, breathDamage: 4, breathHitMax: 5});
  await isolated.loadRoster(async () => ({ok: true, json: async () => seed.enemies}));
  assert.equal(isolated.ICE_DEMON_GAS_DMG, 3); assert.equal(isolated.WHITE_DRAGON_BREATH_DMG, 4);
  assert.equal(isolated.SNOW_RULES.gasHitMax, 4); assert.equal(isolated.SNOW_RULES.breathHitMax, 5);
  assert.equal(definition.ICE_DEMON_GAS_DMG, 1); assert.equal(definition.WHITE_DRAGON_BREATH_DMG, 2);
});
