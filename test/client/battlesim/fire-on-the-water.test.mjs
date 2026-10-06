import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const pt = saved ? { sim430: structuredClone(saved) } : {};
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim430.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const math = Object.create(Math);
  math.random = () => 0.1;
  const context = vm.createContext({ Math: math, currentPlaythrough: () => pt, saveState() {}, t: key => key, escapeHtml: value => value, SVG_SKULL: '', SVG_TROPHY: '' });
  vm.runInContext(source + '\n_renderAll = () => {}; globalThis.sim = { data: _data, end: _checkBattleEnd, potion: _usePotion, reset: _resetBattle, capture: _captureFightEffects, round: _runRound };', context);
  return { sim: context.sim, data: context.sim.data() };
}

test('new fights resolve simultaneous deaths as a loss', () => {
  const { sim, data } = fixture();
  data.endurance = 0;
  data.enemy.endurance = 0;
  sim.end(data);
  assert.equal(data.history[0].outcome, 'loss');
});

test('new fights cannot revive a dead character with a potion', () => {
  const { sim, data } = fixture();
  data.rolled = true;
  data.enduranceInitial = 25;
  sim.potion();
  assert.equal(data.endurance, 0);
  assert.equal(data.healingPotionUsed, false);
});

test('living characters can still use a potion after combat', () => {
  const { sim, data } = fixture();
  data.rolled = true;
  data.enduranceInitial = 25;
  data.endurance = 12;
  data.roundsThisBattle = 3;
  sim.potion();
  assert.equal(data.endurance, 16);
  assert.equal(data.healingPotionUsed, true);
});

test('opening a saved fight preserves its values and legacy resolution', () => {
  const saved = JSON.parse(JSON.stringify(fixture().data));
  delete saved.printedDeathRules;
  saved.rolled = true;
  saved.enduranceInitial = 25;
  const { sim, data } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), saved);
  sim.end(data);
  assert.equal(data.history[0].outcome, 'win');
  sim.potion();
  assert.equal(data.endurance, 4);
});

test('explicitly resetting a legacy fight opts into the corrected rules', () => {
  const saved = JSON.parse(JSON.stringify(fixture().data));
  delete saved.printedDeathRules;
  const { sim, data } = fixture(saved);
  sim.reset();
  assert.equal(data.printedDeathRules, 1);
});

function combat() {
  const result = fixture();
  Object.assign(result.data, { rolled: true, endurance: 30, enduranceInitial: 30, ratio: 0 });
  Object.assign(result.data.enemy, { endurance: 100, enduranceMax: 100 });
  return result;
}

test('undead damage doubles only enemy losses', () => {
  const { sim, data } = combat();
  data.nextDoubleDamage = true;
  sim.capture(data);
  sim.round();
  assert.equal(data.enemy.endurance, 94);
  assert.equal(data.endurance, 25);
});

test('the surprise bonus applies only to the first round without changing SKILL', () => {
  const { sim, data } = combat();
  data.combatSkill = 17;
  data.nextFirstRoundBonus = true;
  sim.capture(data);
  sim.round();
  assert.equal(data.enemy.endurance, 96);
  sim.round();
  assert.equal(data.enemy.endurance, 93);
  assert.equal(data.combatSkill, 17);
  assert.equal(data.ratio, 0);
});

test('Halvorc protection lasts exactly two rounds', () => {
  const { sim, data } = combat();
  data.nextHalvorcProtection = true;
  sim.capture(data);
  sim.round();
  sim.round();
  assert.equal(data.endurance, 30);
  sim.round();
  assert.equal(data.endurance, 25);
});

test('unshielded Mindblast adds two damage per round', () => {
  const { sim, data } = combat();
  data.nextUnshieldedMindblast = true;
  sim.capture(data);
  sim.round();
  assert.equal(data.endurance, 23);
});

test('changing next-fight controls cannot alter the current fight', () => {
  const { sim, data } = combat();
  sim.capture(data);
  data.nextDoubleDamage = true;
  data.nextUnshieldedMindblast = true;
  sim.round();
  assert.equal(data.enemy.endurance, 97);
  assert.equal(data.endurance, 25);
  sim.capture(data);
  sim.round();
  assert.equal(data.enemy.endurance, 91);
  assert.equal(data.endurance, 18);
});

test('legacy fights ignore pending controls until a new fight is started', () => {
  const saved = JSON.parse(JSON.stringify(combat().data));
  delete saved.printedDeathRules;
  delete saved.combatEffects;
  saved.nextDoubleDamage = true;
  saved.nextHalvorcProtection = true;
  const { sim, data } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), saved);
  sim.round();
  assert.equal(data.enemy.endurance, 97);
  assert.equal(data.endurance, 25);
});

test('all control labels are defined in the simulator translations', () => {
  const source = readFileSync(new URL('../../../public/js/i18n/en/battlesim/battlesim430.js', import.meta.url), 'utf8');
  const labels = vm.runInNewContext(source.replace('export default', 'globalThis.labels ='));
  for (const key of ['next_fight', 'double_damage', 'first_bonus', 'halvorc', 'mindblast']) assert.equal(typeof labels['battlesim430.ui.' + key], 'string');
});
