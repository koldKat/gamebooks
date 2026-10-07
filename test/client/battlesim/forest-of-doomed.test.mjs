import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim462.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function fixture(saved) {
  const pt = saved ? { sim462: structuredClone(saved) } : {};
  const dice = [];
  const context = vm.createContext({
    currentPlaythrough: () => pt, saveState: () => {}, escapeHtml: value => value,
    t: (key, params) => JSON.stringify({ key, params }),
    Math: Object.assign(Object.create(Math), { random: () => {
      assert.ok(dice.length, 'unexpected die');
      return (dice.shift() - 1) / 6;
    } }),
  });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  const run = value => vm.runInContext(value, context);
  const d = run('_data()');
  const action = (command, values) => {
    dice.push(...values); run(command); assert.equal(dice.length, 0);
  };
  return { d, run, roll: (...values) => action('_runRound()', values), luck: (...values) => action('_testLuck()', values) };
}

function ready(f) {
  Object.assign(f.d.player, { skill: 6, skillInitial: 6, stamina: 20, staminaInitial: 20, luck: 8, luckInitial: 8 });
  Object.assign(f.d.enemy, { name: 'Main', skill: 6, stamina: 12, staminaMax: 12 });
  f.d.rolled = true;
  return f;
}

function paired() {
  const f = ready(fixture());
  Object.assign(f.d.sideEnemy, { name: 'Side', skill: 6, stamina: 8, staminaMax: 8 });
  f.d.encounter.paired = true;
  return f;
}

test('ordinary ties miss and ordinary wounds cost two', () => {
  const f = ready(fixture()); f.roll(3, 3, 3, 3);
  assert.equal(f.d.player.stamina, 20); assert.equal(f.d.enemy.stamina, 12);
  f.roll(6, 6, 1, 1); assert.equal(f.d.enemy.stamina, 10);
  f.luck(1, 1); assert.equal(f.d.enemy.stamina, 8); assert.equal(f.d.player.luck, 7);
});

test('new encounter setup applies only verified section-specific modifiers', () => {
  for (const [id, modifier] of [[49, -3], [71, -3], [165, -3], [193, -3], [352, -2], [128, 0]]) {
    const f = ready(fixture()); f.d.enemy.name = 'Enemy §' + id;
    f.run('_resetEncounterKnobs(_data())'); assert.equal(f.d.player.attackModifier, modifier);
    assert.equal(f.d.player.stamina, 20);
  }
  const f = ready(fixture()); f.d.enemy.name = 'ВАМПИР §227';
  f.run('_resetEncounterKnobs(_data())'); assert.equal(f.d.encounter.paralyzeAfter, 4);
  f.d.enemy.name = 'ОГНЕН ДЕМОН §107'; f.run('_resetEncounterKnobs(_data())'); assert.equal(f.d.encounter.whip, true);
});

test('paired fights attack separately, only the selected enemy takes outgoing damage', () => {
  const f = paired(); f.roll(6, 6, 1, 1, 1, 1, 6, 6);
  assert.equal(f.d.enemy.stamina, 10); assert.equal(f.d.sideEnemy.stamina, 8);
  assert.equal(f.d.player.stamina, 18); assert.equal(f.d.pendingLuckQueue.length, 2);
  f.run('_switchSourceTarget()'); assert.equal(f.d.enemy.name, 'Main');
  f.run('_skipLuck(); _skipLuck(); _switchSourceTarget()');
  assert.equal(f.d.enemy.name, 'Side'); assert.equal(f.d.sideEnemy.stamina, 10);
});

test('paired opponents can both wound; ties against the side enemy miss', () => {
  const f = paired(); f.roll(1, 1, 6, 6, 1, 1, 6, 6);
  assert.equal(f.d.player.stamina, 16); assert.equal(f.d.encounter.wounds, 2);
  f.luck(1, 1); f.luck(1, 1); assert.equal(f.d.player.stamina, 18);
  f.roll(3, 3, 3, 3, 3, 3, 3, 3); assert.equal(f.d.player.stamina, 18);
});

test('defeating one target promotes the survivor but does not award victory', () => {
  const f = paired(); f.d.enemy.stamina = 2;
  f.roll(6, 6, 1, 1, 6, 6, 1, 1);
  assert.equal(f.d.history.length, 0); assert.equal(f.d.enemy.name, 'Side');
  assert.equal(f.d.enemy.stamina, 8); assert.equal(f.d.sideEnemy.stamina, 0);
  f.d.enemy.stamina = 2; f.roll(6, 6, 1, 1);
  assert.equal(f.d.history.length, 1); assert.equal(f.d.history[0].outcome, 'win');
  f.run('_runRound()'); assert.equal(f.d.history.length, 1);
});

test('Luck finishing a target preserves the second enemy and damage', () => {
  const f = paired(); f.d.enemy.stamina = 4;
  f.roll(6, 6, 1, 1, 6, 6, 1, 1); f.luck(1, 1);
  assert.equal(f.d.enemy.name, 'Side'); assert.equal(f.d.enemy.stamina, 8);
  assert.equal(f.d.history.length, 0);
});

test('a defeat threshold cannot revive the first opponent after promotion', () => {
  const f = paired(); f.d.enemy.stamina = 4; f.d.player.enemyDefeatThreshold = 2;
  f.roll(6, 6, 1, 1, 6, 6, 1, 1);
  assert.equal(f.d.enemy.name, 'Side'); assert.equal(f.d.sideEnemy.stamina, 0);
  f.d.enemy.stamina = 2; f.roll(6, 6, 1, 1);
  assert.equal(f.d.history.length, 1); assert.equal(f.d.history[0].outcome, 'win');
});

test('a fatal side attack takes precedence over defeating the main target', () => {
  const f = paired(); f.d.enemy.stamina = 2; f.d.player.stamina = 2;
  f.roll(6, 6, 1, 1, 1, 1, 6, 6);
  assert.equal(f.d.history.length, 1); assert.equal(f.d.history[0].outcome, 'loss');
  assert.equal(f.d.sideEnemy.stamina, 8);
});

test('a final-round whip can kill the player; simultaneous death is a loss', () => {
  const f = ready(fixture()); f.d.encounter.whip = true;
  f.d.enemy.stamina = 2; f.d.player.stamina = 1;
  f.roll(6, 6, 1, 1, 1);
  assert.equal(f.d.history.length, 1); assert.equal(f.d.history[0].outcome, 'loss');
  assert.equal(f.d.pendingLuckQueue.length, 0);
});

test('whip misses on 3–6 and its one-point wound can be Luck-tested', () => {
  const f = ready(fixture()); f.d.encounter.whip = true;
  f.roll(3, 3, 3, 3, 3); assert.equal(f.d.player.stamina, 20);
  f.roll(3, 3, 3, 3, 2); assert.equal(f.d.player.stamina, 19);
  f.luck(1, 1); assert.equal(f.d.player.stamina, 20);
});

test('emperor shield reduces damage on 4–6 and cancelled wounds cannot heal via Luck', () => {
  const f = ready(fixture()); f.d.encounter.shield = true;
  f.roll(1, 1, 6, 6, 4); assert.equal(f.d.player.stamina, 19);
  f.run('_skipLuck()'); f.d.encounter.whip = true;
  f.roll(3, 3, 3, 3, 1, 6); assert.equal(f.d.player.stamina, 19);
  f.luck(1, 1); assert.equal(f.d.player.stamina, 19);
});

test('vampire paralyses after four wounds, not four elapsed rounds', () => {
  const f = ready(fixture()); f.d.encounter.paralyzeAfter = 4;
  f.roll(3, 3, 3, 3); assert.equal(f.d.encounter.wounds, 0);
  for (let i = 0; i < 4; i++) {
    f.roll(1, 1, 6, 6); if (i < 3) f.run('_skipLuck()');
  }
  assert.equal(f.d.player.stamina, 0); assert.equal(f.d.history[0].outcome, 'loss');
  assert.equal(f.d.pendingLuckQueue.length, 0);
});

test('reset restores both targets and wound count; unconfigured pairs cannot roll', () => {
  const f = paired(); f.d.sideEnemy.stamina = 4; f.d.encounter.wounds = 3;
  f.run('_resetBattle()'); assert.equal(f.d.sideEnemy.stamina, 8); assert.equal(f.d.encounter.wounds, 0);
  f.d.sideEnemy.staminaMax = 0; f.run('_runRound()'); assert.equal(f.d.roundsThisBattle, 0);
});

test('loading a saved fight adds no new fields and preserves legacy combat', () => {
  const saved = ready(fixture()).d;
  delete saved.combatRulesVersion; delete saved.encounter; delete saved.sideEnemy;
  const f = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(f.d)), JSON.parse(JSON.stringify(saved)));
  f.roll(6, 6, 1, 1); assert.equal(f.d.enemy.stamina, 10);
  f.run('_skipLuck(); _resetEncounterKnobs(_data())');
  assert.equal(f.d.combatRulesVersion, 2); assert.equal(f.d.player.stamina, 20);
});

test('all simulator translation keys exist', () => {
  const text = readFileSync(new URL('../../../public/js/i18n/en/battlesim/battlesim462.js', import.meta.url), 'utf8');
  const context = { table: null }; vm.runInNewContext(text.replace('export default', 'table ='), context);
  for (const match of source.matchAll(/['"](battlesim462\.[\w.]+)['"]/g)) assert.equal(typeof context.table[match[1]], 'string', match[1]);
});
