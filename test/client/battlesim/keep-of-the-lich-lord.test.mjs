import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim239.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function fixture(saved) {
  const pt = saved ? { sim239: structuredClone(saved) } : {};
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState() {}, t: k => k, escapeHtml: s => s });
  vm.runInContext(source + '\n_renderAll = () => {}; _roll2d6 = () => 7;', context);
  const run = s => vm.runInContext(s, context);
  const d = run('_data()');
  if (!saved) {
    Object.assign(d.player, { skill: 8, skillInitial: 8, stamina: 20, staminaInitial: 20, luck: 8 });
    Object.assign(d.enemy, { name: 'Ogre', skill: 7, stamina: 10, staminaMax: 10 });
    Object.assign(d.secondEnemy, { active: true, name: 'Orc', skill: 7, stamina: 8, staminaMax: 8 });
    d.rolled = true;
  }
  return { d, run };
}

test('paired ties miss against either selected target', () => {
  for (const target of ['enemy', 'second']) {
    const { d, run } = fixture();
    d.secondEnemy.target = target;
    d.enemy.skill = 8;
    d.secondEnemy.skill = 8;
    run('_runRound()');
    assert.equal(d.enemy.stamina, 10);
    assert.equal(d.secondEnemy.stamina, 8);
    assert.equal(d.player.stamina, 20);
    assert.equal(d.pendingLuckQueue.length, 0);
  }
});

test('each enemy above player AS wounds, even when tied with each other', () => {
  for (const skill of [9, 10]) {
    const { d, run } = fixture();
    d.enemy.skill = 9;
    d.secondEnemy.skill = skill;
    run('_runRound()');
    assert.equal(d.player.stamina, 16);
    assert.equal(d.pendingLuckQueue.length, 2);
    run('_testLuck(); _testLuck()');
    assert.equal(d.player.stamina, 18);
    assert.equal(d.player.luck, 6);
  }
});

test('player can wound selected enemy while unselected enemy wounds player', () => {
  const { d, run } = fixture();
  d.secondEnemy.skill = 9;
  run('_runRound()');
  assert.equal(d.enemy.stamina, 8);
  assert.equal(d.secondEnemy.stamina, 8);
  assert.equal(d.player.stamina, 18);
  assert.equal(d.pendingLuckQueue.length, 2);
  run('_testLuck(); _testLuck()');
  assert.equal(d.enemy.stamina, 6);
  assert.equal(d.player.stamina, 19);
});

test('Lucky second-target damage stays on second and all other Luck adjustments remain correct', () => {
  const { d, run } = fixture();
  d.secondEnemy.target = 'second';
  run('_runRound(); _testLuck()');
  assert.equal(d.secondEnemy.stamina, 4);
  assert.equal(d.enemy.stamina, 10);
  d.player.luck = 1;
  run('_runRound(); _testLuck()');
  assert.equal(d.secondEnemy.stamina, 3);
  d.player.stamina = 18;
  d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  d.player.luck = 1;
  run('_testLuck()');
  assert.equal(d.player.stamina, 17);
});

test('both foes must die, survivor fights alone, final victory recorded once', () => {
  const { d, run } = fixture();
  d.enemy.stamina = 2;
  d.secondEnemy.stamina = 2;
  run('_runRound()');
  assert.equal(d.history.length, 0);
  run('_runRound(); _runRound()');
  assert.equal(d.history.length, 1);
  assert.equal(d.history[0].outcome, 'win');
  assert.equal(d.secondEnemy.stamina, 0);
});

test('Unlucky lethal wound records one loss and clears pending events', () => {
  const { d, run } = fixture();
  d.player.stamina = 1;
  d.player.luck = 1;
  d.pendingLuckQueue.push({ kind: 'enemy-hit' }, { kind: 'enemy-hit' });
  run('_testLuck(); _testLuck(); _runRound()');
  assert.equal(d.history.length, 1);
  assert.equal(d.history[0].outcome, 'loss');
  assert.equal(d.pendingLuckQueue.length, 0);
});

test('same player AS is shared across opponents; dead opponent does not roll or attack', () => {
  const { d, run } = fixture();
  run('let rolls = [7, 7, 9]; _roll2d6 = () => { if (!rolls.length) throw Error("Extra roll"); return rolls.shift(); }; _runRound()');
  assert.equal(d.enemy.stamina, 8);
  assert.equal(d.player.stamina, 18);
  run('_skipLuck(); _skipLuck()');
  d.enemy.stamina = 0;
  run('rolls = [7, 7]; _runRound()');
  assert.equal(d.secondEnemy.stamina, 6);
});

test('legacy load/reset keeps old highest-only rule and Lucky extra one; new encounter opt-in preserves character', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  delete saved.correctedCombatRules;
  const { d, run } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(d)), saved);
  run('_runRound(); _testLuck(); _resetBattle()');
  assert.equal(d.correctedCombatRules, undefined);
  run('_runRound(); _testLuck()');
  assert.equal(d.enemy.stamina, 7);
  run('_resetBattle()');
  d.enemy.skill = 9;
  d.secondEnemy.skill = 10;
  run('_runRound()');
  assert.equal(d.player.stamina, 18);
  const player = JSON.parse(JSON.stringify(d.player));
  run('_resetEncounterKnobs(_data())');
  assert.equal(d.correctedCombatRules, true);
  assert.deepEqual(JSON.parse(JSON.stringify(d.player)), player);
  const updated = JSON.parse(JSON.stringify(d));
  assert.deepEqual(JSON.parse(JSON.stringify(fixture(updated).d)), updated);
});
