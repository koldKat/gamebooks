import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim230.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function fixture(saved) {
  const pt = saved ? { sim230: structuredClone(saved) } : {};
  const dice = [];
  const context = vm.createContext({
    currentPlaythrough: () => pt, saveState: () => {}, escapeHtml: v => v,
    t: (key, params) => JSON.stringify({ key, params }),
    Math: Object.assign(Object.create(Math), { random: () => {
      assert.ok(dice.length, 'unexpected dice roll');
      return (dice.shift() - 1) / 6;
    } }),
  });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  const run = s => vm.runInContext(s, context);
  const d = run('_data()');
  return { d, run, roll: (...values) => {
    dice.push(...values); run('_runRound()'); assert.equal(dice.length, 0);
  }, luck: (...values) => {
    dice.push(...values); run('_testLuck()'); assert.equal(dice.length, 0);
  } };
}

function ready(f) {
  Object.assign(f.d.player, { skill: 6, skillInitial: 6, stamina: 20, staminaInitial: 20, luck: 6 });
  Object.assign(f.d.enemy, { name: 'Main', skill: 6, stamina: 12, staminaMax: 12 });
  Object.assign(f.d.sideEnemy, { name: 'Side', skill: 6, stamina: 8, staminaMax: 8 });
  f.d.rolled = true;
  f.d.pairedFight = true;
  return f;
}

test('only the highest attacker wounds, using one shared player roll', () => {
  const f = ready(fixture());
  f.roll(2, 2, 1, 1, 6, 6);
  assert.equal(f.d.enemy.stamina, 12);
  assert.equal(f.d.player.stamina, 18);
  assert.equal(f.d.pendingLuckQueue.length, 1);
  assert.equal(f.d.pendingLuckQueue[0].kind, 'side-hit');
});

test('highest main opponent lands just one configured wound', () => {
  const f = ready(fixture()); f.d.player.enemyWoundDamage = 3;
  f.roll(1, 1, 6, 6, 3, 3);
  assert.equal(f.d.player.stamina, 17);
  assert.equal(f.d.pendingLuckQueue.length, 1);
});

test('a tie for highest causes no damage or luck event', () => {
  for (const rolls of [[6, 6, 6, 6, 1, 1], [1, 1, 6, 6, 6, 6], [6, 6, 1, 1, 6, 6]]) {
    const f = ready(fixture()); f.roll(...rolls);
    assert.equal(f.d.player.stamina, 20);
    assert.equal(f.d.enemy.stamina, 12);
    assert.equal(f.d.pendingLuckQueue.length, 0);
  }
});

test('defeating one opponent promotes the survivor without awarding a win', () => {
  const f = ready(fixture()); f.d.enemy.stamina = 2;
  f.roll(6, 6, 1, 1, 2, 2);
  assert.equal(f.d.enemy.name, 'Side');
  assert.equal(f.d.enemy.stamina, 8);
  assert.equal(f.d.sideEnemy.stamina, 0);
  assert.equal(f.d.history.length, 0);
  f.d.enemy.stamina = 2;
  f.roll(6, 6, 1, 1);
  assert.equal(f.d.history.length, 1);
  assert.equal(f.d.history[0].outcome, 'win');
  f.run('_runRound()'); assert.equal(f.d.history.length, 1);
});

test('luck finishing a target preserves the other opponent and remaining HP', () => {
  const f = ready(fixture()); f.d.enemy.stamina = 4;
  f.roll(6, 6, 1, 1, 2, 2);
  f.run('_switchTarget()'); assert.equal(f.d.enemy.name, 'Main');
  f.luck(1, 1);
  assert.equal(f.d.enemy.name, 'Side');
  assert.equal(f.d.enemy.stamina, 8);
  assert.equal(f.d.history.length, 0);
  assert.equal(f.d.player.luck, 5);
});

test('switching targets preserves injuries and reset restores both opponents', () => {
  const f = ready(fixture()); f.d.sideEnemy.stamina = 5;
  f.run('_switchTarget()');
  assert.equal(f.d.enemy.name, 'Side'); assert.equal(f.d.enemy.stamina, 5);
  f.roll(6, 6, 1, 1, 2, 2);
  assert.equal(f.d.enemy.stamina, 3);
  assert.equal(f.d.sideEnemy.stamina, 12);
  f.run('_skipLuck(); _resetBattle()');
  assert.equal(f.d.enemy.stamina, 8); assert.equal(f.d.sideEnemy.stamina, 12);
});

test('fatal damage records one loss and cannot be rolled again', () => {
  const f = ready(fixture()); f.d.player.stamina = 2;
  f.roll(1, 1, 2, 2, 6, 6);
  assert.equal(f.d.player.stamina, 0); assert.equal(f.d.history[0].outcome, 'loss');
  assert.equal(f.d.pendingLuckQueue.length, 0);
  f.run('_runRound()'); assert.equal(f.d.history.length, 1);
});

test('loading an existing fight preserves all saved fields and legacy independent rolls', () => {
  const saved = ready(fixture()).d; delete saved.combatRulesVersion; delete saved.sideEnemy.stamina;
  const f = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(f.d)), JSON.parse(JSON.stringify(saved)));
  f.roll(2, 2, 1, 1, 1, 1, 6, 6);
  assert.equal(f.d.enemy.stamina, 10); assert.equal(f.d.player.stamina, 18);
  assert.equal(f.d.pendingLuckQueue.length, 2);
  f.run('_resetEncounterKnobs(_data())');
  assert.equal(f.d.combatRulesVersion, 2);
  assert.equal(f.d.player.skill, 6); assert.equal(f.d.player.stamina, 18);
});

test('single-opponent and first-strike overrides do not roll extra dice', () => {
  const f = ready(fixture()); f.d.pairedFight = false;
  f.roll(6, 6, 1, 1); assert.equal(f.d.enemy.stamina, 10);
  f.run('_skipLuck(); _resetBattle()'); f.d.player.enemyAutoWinFirstRound = true;
  f.roll(); assert.equal(f.d.player.stamina, 18);
});

test('every simulator translation is defined, including the new target controls', () => {
  const text = readFileSync(new URL('../../../public/js/i18n/en/battlesim/battlesim230.js', import.meta.url), 'utf8');
  const context = { table: null };
  vm.runInNewContext(text.replace('export default', 'table ='), context);
  for (const match of source.matchAll(/['"](battlesim230\.[\w.]+)['"]/g)) {
    assert.equal(typeof context.table[match[1]], 'string', match[1]);
  }
  assert.equal(context.table['battlesim230.btn.switch_target'], 'Switch attack target');
});
