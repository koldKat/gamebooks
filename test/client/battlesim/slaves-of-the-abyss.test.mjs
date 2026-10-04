import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim228.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function fixture(saved) {
  const pt = saved ? { sim228: structuredClone(saved) } : {};
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
  Object.assign(d.player, { skill: 6, skillInitial: 6, stamina: 20, staminaInitial: 20, luck: 6 });
  Object.assign(d.enemy, { name: 'Main', skill: 6, stamina: 12, staminaMax: 12 });
  Object.assign(d.sideEnemies[0], { name: 'Side', skill: 6, staminaMax: 8 });
  d.rolled = true;
  return { d, run, roll: (...values) => {
    dice.push(...values); run('_runRound()'); assert.equal(dice.length, 0);
  } };
}

test('simultaneous opponents retain independent player rolls', () => {
  const f = fixture(); f.d.extraAttackers = 1;
  f.roll(1, 2, 1, 1, 6, 6, 1, 1);
  assert.equal(f.d.enemy.stamina, 10);
  assert.equal(f.d.player.stamina, 20);
  assert.equal(f.d.sideEnemies[0].staminaMax, 8);
});

test('fatal side damage overrides victory and clears pending luck', () => {
  const f = fixture(); f.d.extraAttackers = 1;
  f.d.player.stamina = 2; f.d.enemy.stamina = 2;
  f.roll(1, 2, 1, 1, 1, 1, 6, 6);
  assert.equal(f.d.enemy.stamina, 0);
  assert.equal(f.d.player.stamina, 0);
  assert.equal(f.d.history.length, 1);
  assert.equal(f.d.history[0].outcome, 'loss');
  assert.equal(f.d.pendingLuckQueue.length, 0);
  f.run('_runRound()'); assert.equal(f.d.history.length, 1);
});

test('loading legacy fights does not enable new outcome rules', () => {
  const saved = fixture().d; delete saved.combatRulesVersion;
  const f = fixture(saved); f.d.extraAttackers = 1;
  f.d.player.stamina = 2; f.d.enemy.stamina = 2;
  f.roll(1, 2, 1, 1, 1, 1, 6, 6);
  assert.equal(f.d.history[0].outcome, 'win');
  f.run('_resetEncounterKnobs(_data())');
  assert.equal(f.d.combatRulesVersion, 2);
  assert.equal(f.d.player.stamina, 0);
  assert.equal(f.d.player.skill, 6);
});

test('ties, wound settings and first strikes remain unchanged', () => {
  const f = fixture(); f.d.player.enemyWoundDamage = 3;
  f.roll(1, 2, 1, 2);
  assert.equal(f.d.player.stamina, 20);
  assert.equal(f.d.enemy.stamina, 12);
  f.roll(1, 1, 6, 6);
  assert.equal(f.d.player.stamina, 17);
  const first = fixture(); first.d.player.enemyAutoWinFirstRound = true;
  first.roll();
  assert.equal(first.d.player.stamina, 18);
});
