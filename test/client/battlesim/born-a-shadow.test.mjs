import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const pt = saved ? { sim399: structuredClone(saved) } : {};
  const nodes = new Map();
  const document = { getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '', disabled: false });
    return nodes.get(id);
  } };
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim399.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const context = vm.createContext({ document, currentPlaythrough: () => pt, saveState() {}, t: key => key, escapeHtml: value => value });
  vm.runInContext(source + '\n_renderAll = () => {}; _roll1d6 = () => 1; globalThis.sim = { data: _data, select: _applyEnemy, reset: _resetBattle, attack: _attack, over: _battleOver, render: _renderInputs };', context);
  return { sim: context.sim, data: context.sim.data(), nodes };
}

const corporate = { name: 'Неизвестен корпоративен служител', attack: 0, defense: 3, hp: 14, pb: 10 };

test('new enemy selection clears previous physical and equipment values without changing the player', () => {
  const { sim, data } = fixture();
  for (const key of ['speed', 'str', 'acc', 'reflex', 'resil', 'skill', 'power', 'eqspeed', 'weapon', 'maneuver']) data.enemy[key] = 99;
  const player = JSON.parse(JSON.stringify(data.player));
  sim.select(data, { name: 'Киберпаяк', attack: 0, defense: 8, hp: 16, pb: 8 });
  assert.deepEqual(JSON.parse(JSON.stringify(data.enemy)), {
    mode: 'gunfight', speed: 4, str: 0, acc: 8, reflex: 5, resil: 8,
    skill: 0, power: 4, eqspeed: 2, weapon: 0, maneuver: 0,
    endurance: 16, enduranceInitial: 16, enduranceCritical: 8, critApplied: false, name: 'Киберпаяк',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(data.player)), player);
});

test('known enemy presets load printed physical and equipment values', () => {
  const presets = [
    ['Гигантски гущер', 6, 10, 0, 6, 0, 0],
    ['Служителка на "Бионаги"', 2, 2, 2, 2, 3, 3],
    ['Виртуален фехтовач', 3, 0, 4, 3, 3, 4],
    ['Киберчудовище', 4, 8, 0, 5, 0, 0],
    ['Киберпаяк', 4, 0, 8, 5, 4, 2],
    ['Виртуална котка-сънувач "Баст"', 4, 0, 4, 5, 4, 5],
    ['Неизвестен корпоративен служител', 2, 2, 0, 2, 0, 0],
    ['Уличен дилър', 1, 2, 0, 1, 0, 0],
    ['Защитна програма', 2, 0, 2, 2, 3, 3],
    ['Виртуални младежи (момче)', 1, 2, 0, 2, 0, 0],
    ['Андроидка убиец', 2, 2, 0, 2, 1, 5],
    ['Спецгард на "Саурон"', 2, 0, 4, 2, 0, 5],
    ['Неизвестен противник', 3, 0, 3, 2, 0, 5],
  ];
  const { sim, data } = fixture();
  for (const [name, ...expected] of presets) {
    sim.select(data, { name, attack: 5, defense: 3, hp: 20, pb: 6 });
    assert.deepEqual(['speed', 'str', 'acc', 'reflex', 'power', 'eqspeed'].map(key => data.enemy[key]), expected, name);
  }
});

test('unreadable or absent source values remain manual rather than inheriting the previous enemy', () => {
  const { sim, data } = fixture();
  data.enemy.str = data.enemy.power = 9;
  sim.select(data, { name: 'Спецгард на "Саурон"', attack: 4, defense: 3, hp: 15, pb: 6 });
  assert.equal(data.enemy.str, 0);
  assert.equal(data.enemy.power, 0);
  assert.ok(data.log.includes('battlesim399.log.manual_stats'));
});

test('unknown enemy selection clears stats and special stop rules', () => {
  const { sim, data } = fixture();
  sim.select(data, corporate);
  sim.select(data, { name: 'Custom opponent', attack: 3, defense: 4, hp: 12, pb: 2 });
  assert.equal(data.stopBelowEndurance, 0);
  assert.equal(data.enemy.speed, 0);
  assert.equal(data.enemy.reflex, 0);
  assert.equal(data.enemy.power, 0);
  assert.equal(data.enemy.mode, 'unarmed');
});

test('section 122 stops strictly below ten for either fighter, not at ten', () => {
  const { sim, data } = fixture();
  sim.select(data, corporate);
  assert.equal(data.enemy.enduranceCritical, 0);
  data.player.endurance = data.enemy.endurance = 10;
  assert.equal(sim.over(data), false);
  data.enemy.endurance = 9;
  assert.equal(sim.over(data), true);
  data.enemy.endurance = 10;
  data.player.endurance = 9;
  assert.equal(sim.over(data), true);
});

test('threshold victory immediately stops the round before a counterattack', () => {
  const { sim, data } = fixture();
  sim.select(data, corporate);
  Object.assign(data.player, { speed: 10, str: 10 });
  data.enemy.endurance = 11;
  sim.attack();
  assert.equal(data.enemy.endurance, 5);
  assert.equal(data.player.endurance, 15);
  assert.equal(data.enemy.critApplied, false);
  assert.equal(data.history[0].outcome, 'win');
  sim.attack();
  assert.equal(data.roundsThisBattle, 1);
  assert.equal(data.history.length, 1);
});

test('threshold loss is nonfatal and records the correct outcome after backlash', () => {
  const { sim, data } = fixture();
  sim.select(data, corporate);
  Object.assign(data.player, { speed: 10, str: 0, endurance: 12 });
  sim.attack();
  assert.equal(data.player.endurance, 8);
  assert.equal(data.enemy.endurance, 14);
  assert.equal(data.history[0].outcome, 'loss');
  assert.ok(data.log.includes('battlesim399.log.stopped_loss'));
});

test('UI disables attack below the threshold and shows a nonfatal loss', () => {
  const { sim, data, nodes } = fixture();
  sim.select(data, corporate);
  data.player.endurance = 10;
  sim.render();
  assert.equal(nodes.get('sim399-attack').disabled, false);
  data.player.endurance = 9;
  sim.render();
  assert.equal(nodes.get('sim399-attack').disabled, true);
  assert.equal(nodes.get('sim399-status').innerHTML, 'battlesim399.status.stopped_loss');
});

test('loading legacy section 122 fights preserves saved values and old stopping behavior', () => {
  const original = fixture().data;
  Object.assign(original.enemy, { ...corporate, endurance: 9, enduranceInitial: 14, enduranceCritical: 10, str: 7 });
  original.roundsThisBattle = 4;
  original.log.push('Saved round');
  const saved = JSON.parse(JSON.stringify(original));
  const { sim, data } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), saved);
  assert.equal(sim.over(data), false);
});

test('explicit reset starts a corrected fight without replacing character stats', () => {
  const { sim, data } = fixture();
  Object.assign(data.enemy, { name: corporate.name, enduranceInitial: 14, enduranceCritical: 10 });
  data.player.str = 7;
  sim.reset();
  assert.equal(data.stopBelowEndurance, 10);
  assert.equal(data.enemy.enduranceCritical, 0);
  assert.equal(data.player.str, 7);
  assert.equal(data.player.endurance, data.player.enduranceInitial);
});
