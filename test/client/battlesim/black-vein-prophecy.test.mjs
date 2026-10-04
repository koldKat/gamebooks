import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim238.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function fixture(saved) {
  const pt = saved ? { sim238: structuredClone(saved) } : {};
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState: () => {}, t: k => k, escapeHtml: s => s });
  vm.runInContext(source + '\n_renderAll = () => {}; _roll2d6 = () => 7;', context);
  const run = s => vm.runInContext(s, context);
  const d = run('_data()');
  if (!saved) {
    Object.assign(d.player, { skill: 8, skillInitial: 8, stamina: 20, staminaInitial: 20, luck: 8 });
    Object.assign(d.enemy, { name: 'Robber', skill: 7, stamina: 10, staminaMax: 10 });
    d.rolled = true;
  }
  return { d, run };
}

test('new fight Lucky hit costs four STAMINA in total and one LUCK', () => {
  const { d, run } = fixture();
  run('_runRound(); _testLuck()');
  assert.equal(d.enemy.stamina, 6);
  assert.equal(d.player.luck, 7);
});

test('all other Luck outcomes keep their source adjustments', () => {
  for (const [kind, luck, player, enemy] of [['player-hit', 1, 18, 9], ['enemy-hit', 8, 19, 8], ['enemy-hit', 1, 17, 8]]) {
    const { d, run } = fixture();
    d.enemy.stamina = 8;
    d.player.stamina = 18;
    d.player.luck = luck;
    d.pendingLuckQueue.push({ kind });
    run('_testLuck()');
    assert.equal(d.player.stamina, player);
    assert.equal(d.enemy.stamina, enemy);
  }
});

test('saved legacy fight is unchanged on load and keeps one extra Lucky damage', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  delete saved.correctedLuckDamage;
  const { d, run } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(d)), saved);
  run('_runRound(); _testLuck(); _resetBattle()');
  assert.equal(d.correctedLuckDamage, undefined);
  run('_runRound(); _testLuck()');
  assert.equal(d.enemy.stamina, 7);
});

test('new encounter adopts correction without changing character stats, survives reload', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  delete saved.correctedLuckDamage;
  const { d, run } = fixture(saved);
  const player = JSON.parse(JSON.stringify(d.player));
  run('_resetEncounterKnobs(_data())');
  assert.equal(d.correctedLuckDamage, true);
  assert.deepEqual(JSON.parse(JSON.stringify(d.player)), player);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture(JSON.parse(JSON.stringify(d))).d)), JSON.parse(JSON.stringify(d)));
});

test('Lucky killing blow records victory once, without negative enemy STAMINA', () => {
  const { d, run } = fixture();
  d.enemy.stamina = 3;
  run('_runRound(); _testLuck(); _testLuck(); _runRound()');
  assert.equal(d.enemy.stamina, 0);
  assert.equal(d.history.length, 1);
  assert.equal(d.history[0].outcome, 'win');
});

test('single-opponent ties miss; parry opponent can wound but cannot be wounded', () => {
  const { d, run } = fixture();
  d.enemy.skill = 8;
  Object.assign(d.secondEnemy, { active: true, name: 'Slaver', skill: 9 });
  run('_runRound()');
  assert.equal(d.enemy.stamina, 10);
  assert.equal(d.player.stamina, 18);
  assert.equal(d.pendingLuckQueue[0].kind, 'enemy-hit');
  run('_skipLuck()');
  d.secondEnemy.skill = 7;
  run('_runRound()');
  assert.equal(d.enemy.stamina, 10);
  assert.equal(d.player.stamina, 18);
  assert.equal(d.pendingLuckQueue.length, 0);
});

test('new character rolls SKILL die plus four without rerolling saved characters', () => {
  const handler = source.match(/document\.getElementById\('sim238-roll'\)\.addEventListener\('click', \(\) => \{([\s\S]*?)\n  \}\);/)[1];
  for (const die of [1, 6]) {
    const { d, run } = fixture();
    d.rolled = false;
    run('_roll1d6 = () => ' + die);
    run('(function () {' + handler + '})()');
    assert.equal(d.player.skillInitial, die + 4);
    assert.equal(d.player.skill, die + 4);
    assert.equal(d.player.staminaInitial, 19);
    assert.equal(d.player.luckInitial, die + 6);
    assert.equal(d.rolled, true);
    const saved = JSON.parse(JSON.stringify(d));
    const loaded = fixture(saved);
    loaded.run('(function () {' + handler + '})()');
    assert.deepEqual(JSON.parse(JSON.stringify(loaded.d)), saved);
  }
  const { d, run } = fixture();
  d.player.skill = 12;
  d.player.skillInitial = 12;
  const saved = JSON.parse(JSON.stringify(d));
  run('(function () {' + handler + '})()');
  assert.deepEqual(JSON.parse(JSON.stringify(d)), saved);
});
