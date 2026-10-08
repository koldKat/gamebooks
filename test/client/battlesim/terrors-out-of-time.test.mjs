import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim541.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const pt = saved ? { sim541: structuredClone(saved) } : {};
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState: () => {}, t: key => key, escapeHtml: s => s });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  return { run: code => vm.runInContext(code, context), d: vm.runInContext('_data()', context) };
}

test('new fights ignore absent enemy health pools', () => {
  const f = fixture();
  assert.equal(f.d.combatRulesVersion, 2);
  for (const enemy of [
    { sta: 12, staMax: 12, end: 0, endMax: 0 },
    { sta: 0, staMax: 0, end: 10, endMax: 10 },
    { sta: 12, staMax: 12, end: 10, endMax: 10 },
    { sta: 0, staMax: 0, end: 0, endMax: 0 },
  ]) {
    Object.assign(f.d.enemy, enemy);
    assert.equal(f.run('_enemyDefeated(_data())'), false);
  }
});

test('either exhausted tracked health pool ends a future fight', () => {
  const f = fixture();
  for (const enemy of [
    { sta: 0, staMax: 12, end: 0, endMax: 0 },
    { sta: 0, staMax: 0, end: 0, endMax: 10 },
    { sta: 0, staMax: 12, end: 10, endMax: 10 },
    { sta: 12, staMax: 12, end: 0, endMax: 10 },
  ]) {
    Object.assign(f.d.enemy, enemy);
    assert.equal(f.run('_enemyDefeated(_data())'), true);
  }
});

test('loading a legacy fight does not migrate its rules or saved values', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  delete saved.combatRulesVersion;
  Object.assign(saved.enemy, { name: 'Hunchback', sta: 8, staMax: 15, end: 0, endMax: 0 });
  saved.player.stamina = 9;
  saved.roundsThisBattle = 3;
  const f = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(f.d)), saved);
  assert.equal(f.run('_enemyDefeated(_data())'), true);
  f.run('_resetBattle()');
  assert.equal(f.d.combatRulesVersion, 2);
  assert.equal(f.run('_enemyDefeated(_data())'), false);
});

test('Stamina-only encounters play rounds instead of granting instant victory', () => {
  const f = fixture();
  f.d.rolled = true;
  Object.assign(f.d.player, { strength: 7, stamina: 14, staminaInitial: 14, endurance: 14, enduranceInitial: 14 });
  Object.assign(f.d.enemy, { name: 'Hunchback', value: 7, sta: 12, staMax: 12, end: 0, endMax: 0 });
  f.run('Math.random = () => 0.3; _runRound()');
  assert.equal(f.d.roundsThisBattle, 1);
  assert.equal(f.d.enemy.sta, 10);
  assert.equal(f.d.player.stamina, 12);
  assert.equal(f.d.history.length, 0);
});
