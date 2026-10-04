import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim220.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function fixture(saved) {
  const pt = saved ? { sim220: structuredClone(saved) } : {};
  const random = [];
  const context = vm.createContext({
    currentPlaythrough: () => pt, saveState: () => {}, escapeHtml: value => value,
    t: (key, params) => JSON.stringify({key, params}),
    Math: Object.assign(Object.create(Math), {random: () => {
      assert.ok(random.length, 'unexpected dice roll');
      return (random.shift() - 1) / 6;
    }}),
  });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  const run = expression => vm.runInContext(expression, context);
  const d = run('_data()');
  return {d, run, roll: (...dice) => {random.push(...dice); run('_runRound()'); assert.equal(random.length, 0);}};
}

function ready(f) {
  Object.assign(f.d.player, {skill:6, stamina:20, staminaInitial:20, luck:6, luckInitial:6});
  Object.assign(f.d.enemy, {name:'Foe',skill:20,stamina:12,staminaMax:12});
  f.d.rolled = true;
  return f;
}

test('new encounters use one-point enemy wounds and preserve custom damage', () => {
  const f = ready(fixture());
  f.roll(1,2,5,6);
  assert.equal(f.d.player.stamina,19);
  f.run('_skipLuck()');
  f.d.player.enemyWoundDamage = 3;
  f.roll(1,2,5,6);
  assert.equal(f.d.player.stamina,16);
});

test('player attack doubles kill despite losing attack strength, without a luck prompt', () => {
  const f = ready(fixture());
  f.roll(1,1,5,6);
  assert.equal(f.d.enemy.stamina,0);
  assert.equal(f.d.player.stamina,20);
  assert.equal(f.d.pendingLuckQueue.length,0);
  assert.equal(f.d.history[0].outcome,'win');
  f.run('_runRound()');
  assert.equal(f.d.history.length,1);
});

test('enemy doubles do not cause instant death', () => {
  const f = ready(fixture());
  f.roll(1,2,6,6);
  assert.equal(f.d.player.stamina,19);
  assert.equal(f.d.enemy.stamina,12);
});

test('legacy saved fights retain damage, statistics and lack of instant kills', () => {
  const saved = ready(fixture()).d;
  delete saved.combatRulesVersion;
  saved.player.enemyWoundDamage = 4;
  const f = fixture(saved);
  assert.equal(f.d.player.skill,6);
  assert.equal(f.d.player.enemyWoundDamage,4);
  f.roll(1,1,5,6);
  assert.equal(f.d.enemy.stamina,12);
  assert.equal(f.d.player.stamina,16);
  f.run('_resetEncounterKnobs(d = _data())');
  assert.equal(f.d.combatRulesVersion,2);
  assert.equal(f.d.player.enemyWoundDamage,1);
  assert.equal(f.d.player.stamina,16);
  assert.equal(f.d.player.skill,6);
});

test('simultaneous attackers reuse the player roll and cannot be wounded', () => {
  const f = ready(fixture());
  f.d.extraAttackers = 1;
  Object.assign(f.d.sideEnemies[0], {name:'Side',skill:20,staminaMax:8});
  f.roll(1,2,5,6,5,6);
  assert.equal(f.d.player.stamina,18);
  assert.equal(f.d.sideEnemies[0].staminaMax,8);
  assert.equal(f.d.pendingLuckQueue.length,2);
});

test('a fatal side attack cannot record victory after an instant kill', () => {
  const f = ready(fixture());
  f.d.player.stamina = 1;
  f.d.extraAttackers = 1;
  Object.assign(f.d.sideEnemies[0], {name:'Side',skill:20,staminaMax:8});
  f.roll(1,1,5,6,5,6);
  assert.equal(f.d.enemy.stamina,0);
  assert.equal(f.d.player.stamina,0);
  assert.equal(f.d.history.length,1);
  assert.equal(f.d.history[0].outcome,'loss');
  assert.equal(f.d.pendingLuckQueue.length,0);
});

test('luck cancels a normal enemy wound, and opening-strike overrides remain effective', () => {
  const f = ready(fixture());
  f.d.player.enemyAutoWinFirstRound = true;
  f.roll();
  assert.equal(f.d.player.stamina,19);
  f.run('_roll2d6 = () => 2; _testLuck()');
  assert.equal(f.d.player.stamina,20);
  assert.equal(f.d.player.luck,5);
});
