import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim237.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function fixture(saved) {
  const pt = saved ? { sim237: structuredClone(saved) } : {};
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState: () => {}, t: k => k, escapeHtml: s => s });
  vm.runInContext(source + '\n_renderAll = () => {}; _roll2d6 = () => 7;', context);
  const run = s => vm.runInContext(s, context);
  const d = run('_data()');
  if (!saved) {
    Object.assign(d.player, { skill: 8, stamina: 20, staminaInitial: 20, luck: 8 });
    Object.assign(d.enemy, { name: 'First', skill: 8, stamina: 10, staminaMax: 10 });
    Object.assign(d.secondEnemy, { active: true, name: 'Second', skill: 8, stamina: 10, staminaMax: 10 });
    d.rolled = true;
  }
  return { run, d };
}

test('highest ties cause no damage or Luck prompt, including enemy-only ties', () => {
  for (const skills of [[8, 8, 8], [8, 8, 7], [8, 7, 8], [7, 8, 8]]) {
    const { d, run } = fixture();
    [d.player.skill, d.enemy.skill, d.secondEnemy.skill] = skills;
    run('_runRound()');
    assert.deepEqual([d.player.stamina, d.enemy.stamina, d.secondEnemy.stamina], [20, 10, 10]);
    assert.equal(d.pendingLuckQueue.length, 0);
    assert.equal(d.roundsThisBattle, 1);
  }
});

test('unique highest fighter alone lands a hit; lower ties do not cancel it', () => {
  for (const winner of ['player', 'enemy', 'secondEnemy']) {
    const { d, run } = fixture();
    d[winner].skill = 9;
    run('_runRound()');
    assert.deepEqual([d.player.stamina, d.enemy.stamina, d.secondEnemy.stamina], winner === 'player' ? [20, 8, 10] : [18, 10, 10]);
    assert.equal(d.pendingLuckQueue.length, 1);
  }
});

test('chosen second target receives the hit and two extra Lucky damage', () => {
  const { d, run } = fixture();
  d.player.skill = 9;
  d.secondEnemy.target = 'second';
  run('_runRound(); _testLuck()');
  assert.equal(d.enemy.stamina, 10);
  assert.equal(d.secondEnemy.stamina, 6);
  assert.equal(d.player.luck, 7);
});

test('all four Luck outcomes preserve the source adjustments', () => {
  for (const kind of ['player-hit', 'enemy-hit']) {
    for (const lucky of [true, false]) {
      const { d, run } = fixture();
      d.enemy.stamina = 8;
      d.player.stamina = 18;
      d.player.luck = lucky ? 8 : 1;
      d.pendingLuckQueue.push({ kind, on: 'enemy' });
      run('_testLuck()');
      assert.equal(d.enemy.stamina, kind === 'player-hit' ? (lucky ? 6 : 9) : 8);
      assert.equal(d.player.stamina, kind === 'enemy-hit' ? (lucky ? 19 : 17) : 18);
    }
  }
});

test('legacy fights load unchanged and retain old ties and Lucky damage', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  delete saved.correctedCombatRules;
  const { d, run } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(d)), saved);
  run('_runRound(); _testLuck()');
  assert.equal(d.enemy.stamina, 7);
  run('_resetBattle()');
  assert.equal(d.correctedCombatRules, undefined);
});

test('new encounter opts in without migrating character stats; reload preserves it', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  delete saved.correctedCombatRules;
  const { d, run } = fixture(saved);
  const player = JSON.parse(JSON.stringify(d.player));
  run('_resetEncounterKnobs(_data())');
  assert.equal(d.correctedCombatRules, true);
  assert.deepEqual(JSON.parse(JSON.stringify(d.player)), player);
  const reloaded = fixture(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(JSON.parse(JSON.stringify(reloaded.d)), JSON.parse(JSON.stringify(d)));
});

test('single-opponent ties still miss and a fallen paired enemy becomes a single fight', () => {
  const { d, run } = fixture();
  d.enemy.stamina = 0;
  run('_runRound()');
  assert.equal(d.player.stamina, 20);
  assert.equal(d.secondEnemy.stamina, 10);
  d.player.skill = 9;
  run('_runRound(); _testLuck()');
  assert.equal(d.secondEnemy.stamina, 6);
});
