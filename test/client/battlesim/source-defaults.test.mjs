import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(id, saved) {
  const source = readFileSync(new URL(`../../../public/js/battlesim/battlesim${id}.js`, import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const pt = saved ? { [`sim${id}`]: structuredClone(saved) } : {};
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState: () => {}, t: k => k, escapeHtml: s => s });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  return { run: s => vm.runInContext(s, context), d: vm.runInContext('_data()', context), source };
}

for (const [id, meals, legacy] of [[243, 2, 10], [254, 12, 0], [257, 10, 0], [258, 10, 0], [263, 10, 0], [267, 10, 0]]) {
  test(`${id}: new supplies change without migrating saved characters or fights`, () => {
    const f = fixture(id);
    assert.equal(f.d.player.provisionsLeft, meals);
    const saved = JSON.parse(JSON.stringify(f.d));
    saved.player.provisionsLeft = 3;
    saved.player.stamina = 9;
    saved.enemy = { name: 'Caldwell', skill: 8, stamina: 4, staminaMax: 8 };
    saved.roundsThisBattle = 2;
    saved.pendingLuck = 'enemy-hit';
    assert.deepEqual(JSON.parse(JSON.stringify(fixture(id, saved).d)), saved);
    delete saved.player.provisionsLeft;
    assert.equal(fixture(id, saved).d.player.provisionsLeft, legacy);
  });
}

for (const [id, skill, stamina] of [[243, [1, 6], [2, 12]], [258, [8, 10], [12, 22]]]) {
  test(`${id}: corrected initial rolls stay within printed ranges`, () => {
    const f = fixture(id);
    const rolls = f.source.match(/d\.player\.skillInitial\s*=.*;\n\s*d\.player\.staminaInitial\s*=.*;/)[0];
    for (const [random, index] of [[0, 0], [0.999, 1]]) {
      f.run(`Math.random = () => ${random}; const d = _data(); ${rolls}`.replace('const d', 'var d'));
      assert.equal(f.d.player.skillInitial, skill[index]);
      assert.equal(f.d.player.staminaInitial, stamina[index]);
    }
  });
}

test('Caldwell winning doubles apply only to opted-in future fights', () => {
  for (const [enabled, dice, damage] of [[true, [0, 0, 0.999, 0.999], 4], [false, [0, 0, 0.999, 0.999], 2], [true, [0, 0, 0.999, 0.8], 2]]) {
    const f = fixture(267);
    f.d.rolled = true;
    f.d.caldwellDoubles = enabled;
    Object.assign(f.d.player, { skill: 1, stamina: 20, staminaInitial: 20 });
    Object.assign(f.d.enemy, { name: 'Caldwell', skill: 8, stamina: 8, staminaMax: 8 });
    f.run(`var rolls = ${JSON.stringify(dice)}; Math.random = () => rolls.shift(); _runRound()`);
    assert.equal(f.d.player.stamina, 20 - damage);
  }
});

test('Caldwell doubles do not damage a player who wins or ties', () => {
  for (const skill of [8, 9]) {
    const f = fixture(267);
    f.d.rolled = true;
    f.d.caldwellDoubles = true;
    Object.assign(f.d.player, { skill, stamina: 20, staminaInitial: 20 });
    Object.assign(f.d.enemy, { name: 'Caldwell', skill: 8, stamina: 8, staminaMax: 8 });
    f.run('Math.random = () => 0.5; _runRound()');
    assert.equal(f.d.player.stamina, 20);
  }
});
