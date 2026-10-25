import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFixtureRoster } from './roster-fixtures.mjs';
import { KRIS_KNIFE_RULES } from '../../../public/js/battlesim/books/206/definition.js';
import { createCombat } from '../../../public/js/battlesim/books/206/combat.js';
import * as definition from '../../../public/js/battlesim/books/206/definition.js';
import {createState} from '../../../public/js/battlesim/books/206/state.js';
import {readFileSync} from 'node:fs';

await loadFixtureRoster(206);

function context(rules = KRIS_KNIFE_RULES) {
  const ctx = { KRIS_KNIFE_RULES: rules, t: () => 'Enemy' };
  Object.assign(ctx, createCombat(() => ctx));
  return ctx;
}

for (const [name, expected] of [
  ['Hell Demon', 6], ['  HELL DEMON (§400)  ', 6], ['Earl of Drumer', 3],
  ['Franklins', 3], ['Franklins disguised as a Hell Demon', 6],
  ['Not Franklins after all', 3], ['Ghoul', 0], ['', 0],
]) {
  test('Kris Knife retains selected, saved and custom-name matching: ' + name, () => {
    const ctx = context();
    const data = { player: { hasKrisKnife: true }, enemy: { name } };
    const saved = structuredClone(data);
    assert.equal(ctx._krisBonus(data), expected);
    assert.deepEqual(data, saved, 'reading metadata never migrates a saved fight');
    data.player.hasKrisKnife = false;
    assert.equal(ctx._krisBonus(data), 0);
  });
}

test('Kris bonus follows supplied metadata and coexists with uncapped weapon bonuses', () => {
  const ctx = context([{ nameIncludes: ['custom opponent'], bonus: 9 }]);
  const data = { enemy: { name: 'Custom Opponent' }, player: {
    skill: 4, skillInitial: 12, hasLetterOpener: true, hasWoodenBranch: true,
    hasMeatKnife: true, hasSilverDagger: true, hasKrisKnife: true, attackModifier: -2,
  } };
  assert.equal(ctx._effectiveSkill(data), 27);
  data.enemy.name = 'Hell Demon';
  assert.equal(ctx._krisBonus(data), 0, 'names and bonuses come only from loaded metadata');
});

test('metadata does not change manual encounter controls or their reset behavior', () => {
  const ctx = context();
  const data = { enemy: { name: 'Ghoul' }, player: {
    hasKrisKnife: true, attackModifier: 8, enemyWoundDamage: 7,
    fireSpriteWound: true, ghoulWoundCounter: true, woundEventsThisFight: 3,
  } };
  ctx._resetEncounterKnobs(data);
  assert.equal(data.player.fireSpriteWound, false);
  assert.equal(data.player.ghoulWoundCounter, false);
  assert.equal(data.player.woundEventsThisFight, 0);
  assert.equal(data.player.enemyWoundDamage, 2);
  assert.equal(data.player.hasKrisKnife, true);
});

function savedWound(roll = 2) {
  const run = {}, ctx = {...definition, currentPlaythrough: () => run, saveState() {}, _renderAll() {}, t: key => key, escapeHtml: String};
  Object.assign(ctx, createState(() => ctx), createCombat(() => ctx)); ctx._roll2d6 = () => roll;
  const d = ctx._data();
  Object.assign(d, {rolled: true, roundsThisBattle: 7, pendingLuckQueue: [{kind: 'fire-sprite-wound', extension: true}], extension: {kept: true}});
  Object.assign(d.player, {skill: 8, skillInitial: 12, stamina: 17, staminaInitial: 24, luck: 7, luckInitial: 12, fireSpriteWound: true, ghoulWoundCounter: true, woundEventsThisFight: 2});
  Object.assign(d.enemy, {name: 'Saved rival', skill: 10, stamina: 8, staminaMax: 8});
  return {ctx, d};
}

test('saved Fire Sprite wounds retain lucky, unlucky and declined damage', () => {
  for (const [roll, method, damage, luck] of [[2, '_testLuck', 0, 6], [12, '_testLuck', 4, 6], [2, '_skipLuck', 3, 7]]) {
    const {ctx, d} = savedWound(roll); ctx[method]();
    assert.equal(d.player.stamina, 17 - damage); assert.equal(d.player.luck, luck);
    assert.equal(d.player.woundEventsThisFight, 3); assert.equal(d.roundsThisBattle, 7);
    assert.deepEqual(d.pendingLuckQueue, []); assert.equal(d.history.length, 0);
    assert.deepEqual(d.extension, {kept: true});
  }
});

test('the captured fourth wound paralyses once even when its Luck damage is zero', () => {
  const {ctx, d} = savedWound(); d.player.woundEventsThisFight = 3;
  d.pendingLuckQueue.push({kind: 'enemy-hit'}); ctx._testLuck();
  assert.equal(d.player.stamina, 0); assert.equal(d.player.woundEventsThisFight, 4);
  assert.equal(d.history.length, 1); assert.equal(d.history[0].outcome, 'loss');
  assert.deepEqual(d.pendingLuckQueue, []); ctx._testLuck(); ctx._skipLuck();
  assert.equal(d.history.length, 1);
});

test('paralysis uses its loaded threshold rather than a literal fourth wound', () => {
  const {ctx, d} = savedWound(); ctx.GHOUL_PARALYSIS_THRESHOLD = 3; ctx._skipLuck();
  assert.equal(d.player.stamina, 0); assert.equal(d.history.length, 1);
});

test('metadata supplies damage exports without adding support fields to Kris rules', async () => {
  const seed = JSON.parse(readFileSync(new URL('../../../data/simulator-rosters/206.json', import.meta.url), 'utf8'));
  const rules = seed.enemies.map(row => { const {support, ...rule} = row.stats.entry; return rule; });
  assert.deepEqual(KRIS_KNIFE_RULES, rules);
  const isolated = await import('../../../public/js/battlesim/books/206/definition.js?settings-test');
  Object.assign(seed.enemies[0].stats.entry.support.rules, {fireSpriteLuckyDamage: 1, fireSpriteUnluckyDamage: 5, fireSpriteBaselineDamage: 2, ghoulParalysisThreshold: 6});
  await isolated.loadRoster(async () => ({ok: true, json: async () => seed.enemies}));
  assert.deepEqual([isolated.FIRESPRITE_LUCKY_DMG, isolated.FIRESPRITE_UNLUCKY_DMG, isolated.FIRESPRITE_BASELINE_DMG, isolated.GHOUL_PARALYSIS_THRESHOLD], [1, 5, 2, 6]);
  assert.deepEqual(isolated.KRIS_KNIFE_RULES, rules);
});
