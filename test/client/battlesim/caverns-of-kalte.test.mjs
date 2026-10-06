import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const pt = saved ? { sim431: structuredClone(saved) } : {};
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim431.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const math = Object.create(Math);
  math.random = () => 0.1;
  const context = vm.createContext({ Math: math, currentPlaythrough: () => pt, saveState() {}, t: key => key, escapeHtml: value => value });
  vm.runInContext(source + '\n_renderAll = () => {}; globalThis.sim = { data: _data, end: _checkBattleEnd, potion: _usePotion, reset: _resetBattle, capture: _captureFightEffects, round: _runRound };', context);
  return { sim: context.sim, data: context.sim.data() };
}

function combat() {
  const result = fixture();
  Object.assign(result.data, { rolled: true, endurance: 30, enduranceInitial: 30, ratio: 0 });
  Object.assign(result.data.enemy, { endurance: 100, enduranceMax: 100 });
  return result;
}

test('new fights resolve simultaneous deaths as a loss', () => {
  const { sim, data } = fixture();
  sim.end(data);
  assert.equal(data.history[0].outcome, 'loss');
});

test('new fights cannot revive a dead character', () => {
  const { sim, data } = fixture();
  data.rolled = true;
  data.enduranceInitial = 25;
  sim.potion();
  assert.equal(data.endurance, 0);
  assert.equal(data.healingPotionUsed, false);
});

test('living characters can use a potion after combat', () => {
  const { sim, data } = fixture();
  Object.assign(data, { rolled: true, enduranceInitial: 25, endurance: 12, roundsThisBattle: 3 });
  sim.potion();
  assert.equal(data.endurance, 16);
  assert.equal(data.healingPotionUsed, true);
});

test('opening an existing fight preserves saved values and legacy behavior', () => {
  const saved = JSON.parse(JSON.stringify(fixture().data));
  delete saved.printedDeathRules;
  delete saved.combatEffects;
  Object.assign(saved, { rolled: true, enduranceInitial: 25 });
  const { sim, data } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), saved);
  sim.end(data);
  assert.equal(data.history[0].outcome, 'win');
  sim.potion();
  assert.equal(data.endurance, 4);
});

test('explicit reset opts a legacy fight into new rules', () => {
  const saved = JSON.parse(JSON.stringify(combat().data));
  delete saved.printedDeathRules;
  delete saved.combatEffects;
  saved.nextDoubleDamage = true;
  const { sim, data } = fixture(saved);
  sim.reset();
  assert.equal(data.printedDeathRules, 1);
  assert.equal(data.combatEffects.doubleDamage, true);
});

test('undead damage doubles enemy losses only', () => {
  const { sim, data } = combat();
  data.nextDoubleDamage = true;
  sim.capture(data);
  sim.round();
  assert.equal(data.enemy.endurance, 94);
  assert.equal(data.endurance, 25);
});

test('protection lasts exactly two rounds', () => {
  const { sim, data } = combat();
  data.nextFirstTwoRoundProtection = true;
  sim.capture(data);
  sim.round();
  sim.round();
  assert.equal(data.endurance, 30);
  sim.round();
  assert.equal(data.endurance, 25);
});

test('Fenor deals three additional enemy damage each round', () => {
  const { sim, data } = combat();
  data.nextCompanionDamage = true;
  sim.capture(data);
  sim.round();
  assert.equal(data.enemy.endurance, 94);
  assert.equal(data.endurance, 25);
});

test('Fenor damage is not doubled by Somerswerd', () => {
  const { sim, data } = combat();
  data.nextCompanionDamage = data.nextDoubleDamage = true;
  sim.capture(data);
  sim.round();
  assert.equal(data.enemy.endurance, 91);
});

test('Mindblast costs two additional endurance, including protected rounds', () => {
  const { sim, data } = combat();
  data.nextUnshieldedMindblast = data.nextFirstTwoRoundProtection = true;
  sim.capture(data);
  sim.round();
  assert.equal(data.endurance, 28);
});

test('next-fight controls do not change an ongoing fight', () => {
  const { sim, data } = combat();
  sim.capture(data);
  data.nextDoubleDamage = data.nextCompanionDamage = true;
  sim.round();
  assert.equal(data.enemy.endurance, 97);
  sim.capture(data);
  sim.round();
  assert.equal(data.enemy.endurance, 88);
});

test('legacy fights ignore pending controls', () => {
  const saved = JSON.parse(JSON.stringify(combat().data));
  delete saved.printedDeathRules;
  delete saved.combatEffects;
  saved.nextDoubleDamage = saved.nextFirstTwoRoundProtection = true;
  const { sim, data } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), saved);
  sim.round();
  assert.equal(data.enemy.endurance, 97);
  assert.equal(data.endurance, 25);
});

test('all new controls have translations', () => {
  const source = readFileSync(new URL('../../../public/js/i18n/en/battlesim/battlesim431.js', import.meta.url), 'utf8');
  const labels = vm.runInNewContext(source.replace('export default', 'globalThis.labels ='));
  for (const key of ['next_fight', 'double_damage', 'protection', 'companion', 'mindblast']) assert.equal(typeof labels['battlesim431.ui.' + key], 'string');
});
