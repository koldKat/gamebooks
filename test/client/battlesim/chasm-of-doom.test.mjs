import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const pt = saved ? { sim432: structuredClone(saved) } : {};
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim432.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const math = Object.create(Math);
  math.random = () => 0.1;
  const context = vm.createContext({ Math: math, currentPlaythrough: () => pt, saveState() {}, t: key => key, escapeHtml: value => value });
  vm.runInContext(source + '\n_renderAll = () => {}; globalThis.sim = { data: _data, end: _checkBattleEnd, potion: _usePotion, reset: _resetBattle, capture: _captureFightEffects, ratio: _roundRatio, round: _runRound };', context);
  return { sim: context.sim, data: context.sim.data() };
}

function combat(section) {
  const result = fixture();
  Object.assign(result.data, { rolled: true, endurance: 30, enduranceInitial: 30, ratio: 0 });
  Object.assign(result.data.enemy, { name: 'Enemy §' + section, endurance: 100, enduranceMax: 100 });
  result.sim.capture(result.data);
  return result;
}

test('new fights resolve simultaneous death as loss', () => {
  const { sim, data } = fixture();
  sim.end(data);
  assert.equal(data.history[0].outcome, 'loss');
});

test('new fights cannot revive a dead character', () => {
  const { sim, data } = fixture();
  Object.assign(data, { rolled: true, enduranceInitial: 25 });
  sim.potion();
  assert.equal(data.endurance, 0);
  assert.equal(data.healingPotionUsed, false);
});

test('living characters can heal after combat', () => {
  const { sim, data } = fixture();
  Object.assign(data, { rolled: true, enduranceInitial: 25, endurance: 12, roundsThisBattle: 3 });
  sim.potion();
  assert.equal(data.endurance, 16);
});

test('opening legacy fights preserves saved values and behavior', () => {
  const saved = JSON.parse(JSON.stringify(fixture().data));
  delete saved.printedDeathRules;
  delete saved.combatEffects;
  Object.assign(saved, { rolled: true, enduranceInitial: 25, nextMindblast: true });
  const { sim, data } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), saved);
  sim.end(data);
  assert.equal(data.history[0].outcome, 'win');
  sim.potion();
  assert.equal(data.endurance, 4);
});

test('explicit reset captures future rules without changing skill', () => {
  const saved = JSON.parse(JSON.stringify(combat(77).data));
  delete saved.printedDeathRules;
  delete saved.combatEffects;
  saved.nextMindshield = true;
  const { sim, data } = fixture(saved);
  sim.reset();
  assert.equal(data.printedDeathRules, 1);
  assert.equal(data.combatEffects.mindshield, true);
  assert.equal(data.combatSkill, saved.combatSkill);
});

test('section 62 penalty ends after exactly three rounds', () => {
  const { sim, data } = combat(62);
  data.roundsThisBattle = 3;
  assert.equal(sim.ratio(data), -2);
  data.roundsThisBattle = 4;
  assert.equal(sim.ratio(data), 0);
});

test('section 153 penalty ends after exactly two rounds', () => {
  const { sim, data } = combat(153);
  data.roundsThisBattle = 2;
  assert.equal(sim.ratio(data), -4);
  data.roundsThisBattle = 3;
  assert.equal(sim.ratio(data), 0);
});

test('section 316 penalty remains active throughout combat', () => {
  const { sim, data } = combat(316);
  data.roundsThisBattle = 10;
  assert.equal(sim.ratio(data), -2);
});

test('section 147 protects the first round only', () => {
  const { sim, data } = combat(147);
  sim.round();
  assert.equal(data.endurance, 30);
  sim.round();
  assert.equal(data.endurance, 25);
});

test('section 77 psychic damage is one additional endurance per round', () => {
  const { sim, data } = combat(77);
  sim.round();
  assert.equal(data.endurance, 24);
  data.nextMindshield = true;
  sim.capture(data);
  sim.round();
  assert.equal(data.endurance, 19);
});

test('section 122 psychic skill penalty requires absent Mindshield', () => {
  const { sim, data } = combat(122);
  assert.equal(sim.ratio(data), -4);
  data.nextMindshield = true;
  sim.capture(data);
  assert.equal(sim.ratio(data), 0);
});

test('Mindblast respects every printed immunity', () => {
  for (const section of [26, 77, 88, 122, 325, 14]) {
    const { sim, data } = combat(section);
    data.nextMindblast = data.nextMindshield = true;
    sim.capture(data);
    assert.equal(sim.ratio(data), section === 14 ? 2 : 0);
  }
});

test('pending controls do not change an active fight', () => {
  const { sim, data } = combat(14);
  data.nextMindblast = true;
  assert.equal(sim.ratio(data), 0);
  sim.capture(data);
  assert.equal(sim.ratio(data), 2);
});

test('legacy fights ignore new encounter effects', () => {
  const saved = JSON.parse(JSON.stringify(combat(77).data));
  delete saved.printedDeathRules;
  delete saved.combatEffects;
  const { sim, data } = fixture(saved);
  sim.round();
  assert.equal(data.endurance, 25);
});

test('new controls and manual limitations have translations', () => {
  const source = readFileSync(new URL('../../../public/js/i18n/en/battlesim/battlesim432.js', import.meta.url), 'utf8');
  const labels = vm.runInNewContext(source.replace('export default', 'globalThis.labels ='));
  for (const key of ['next_fight', 'mindblast', 'mindshield', 'manual_effects']) assert.equal(typeof labels['battlesim432.ui.' + key], 'string');
});
