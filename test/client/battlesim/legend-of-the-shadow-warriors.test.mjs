import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim240.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function fixture(saved) {
  const pt = saved ? { sim240: structuredClone(saved) } : {};
  let saves = 0;
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState() { saves++; }, t: k => k, escapeHtml: s => s });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  const run = s => vm.runInContext(s, context);
  return { d: run('_data()'), run, saves: () => saves };
}

test('new characters start without provisions and cannot eat an unowned meal', () => {
  const { d, run, saves } = fixture();
  assert.equal(d.player.provisionsLeft, 0);
  d.rolled = true;
  d.player.stamina = 10;
  d.player.staminaInitial = 20;
  run('_eatProvisions()');
  assert.equal(d.player.stamina, 10);
  assert.equal(d.player.provisionsLeft, 0);
  assert.equal(saves(), 0);
});

test('saved character and fight state are unchanged on repeated loading', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  delete saved.correctedCombatRules;
  saved.player.provisionsLeft = 7;
  saved.rolled = true;
  saved.enemy = { name: 'Clown', skill: 9, stamina: 6, staminaMax: 10 };
  saved.roundsThisBattle = 3;
  saved.log = ['Existing battle'];
  const { d, run, saves } = fixture(saved);
  run('_data(); _data()');
  assert.deepEqual(JSON.parse(JSON.stringify(d)), saved);
  assert.equal(saves(), 0);
});

function combat(legacy = false) {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  if (legacy) delete saved.correctedCombatRules;
  saved.rolled = true;
  Object.assign(saved.player, { skill: 6, stamina: 20, staminaInitial: 20, luck: 12, weapon: 'axe' });
  saved.enemy = { name: 'Clown', skill: 20, stamina: 20, staminaMax: 20 };
  const f = fixture(saved);
  f.run('_roll2d6 = () => 7');
  return f;
}

test('enemy damage is independent of the player axe in new fights only', () => {
  for (const legacy of [false, true]) {
    const { d, run } = combat(legacy);
    run('_runRound()');
    assert.equal(d.player.stamina, legacy ? 16 : 18);
  }
});

test('final chainmail hit keeps its Luck damage table after armour breaks', () => {
  for (const lucky of [false, true]) {
    const { d, run } = combat();
    Object.assign(d.player, { armour: 'chainmail', armourHitsLeft: 1, luck: lucky ? 12 : 1 });
    run('_runRound()');
    assert.equal(d.player.armour, 'none');
    assert.equal(d.player.stamina, 19);
    run('_testLuck()');
    assert.equal(d.player.stamina, lucky ? 20 : 18);
    assert.equal(d.player.armourHitsLeft, 0);
  }
});

test('unarmoured Lucky and Unlucky wounds total one and three points', () => {
  for (const lucky of [false, true]) {
    const { d, run } = combat();
    d.player.luck = lucky ? 12 : 1;
    run('_runRound(); _testLuck()');
    assert.equal(d.player.stamina, lucky ? 19 : 17);
  }
});

test('Luck refunds Voivod only the final damage actually inflicted', () => {
  const { d, run } = combat();
  d.voivodThrives = true;
  run('_runRound(); _testLuck()');
  assert.equal(d.player.stamina, 19);
  assert.equal(d.enemy.stamina, 21);
});

test('plate absorbs its final hit without queuing a phantom wound', () => {
  const { d, run } = combat();
  Object.assign(d.player, { armour: 'plate', armourHitsLeft: 1 });
  run('_runRound()');
  assert.equal(d.player.stamina, 20);
  assert.equal(d.player.armour, 'none');
  assert.equal(d.pendingLuckQueue.length, 0);
});

test('reset does not silently upgrade legacy combat rules', () => {
  const { d, run } = combat(true);
  run('_resetBattle()');
  assert.equal(d.correctedCombatRules, undefined);
});

test('legacy states without a provision field retain their existing fallback', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  delete saved.player.provisionsLeft;
  const { d, run } = fixture(saved);
  assert.equal(d.player.provisionsLeft, 10);
  run('_data()');
  assert.equal(d.player.provisionsLeft, 10);
});

test('owned meals still heal four points and consume exactly one provision', () => {
  const { d, run, saves } = fixture();
  d.rolled = true;
  d.player.provisionsLeft = 2;
  d.player.stamina = 10;
  d.player.staminaInitial = 20;
  run('_eatProvisions()');
  assert.equal(d.player.stamina, 14);
  assert.equal(d.player.provisionsLeft, 1);
  assert.equal(saves(), 1);
});

test('resetting a fight does not grant or remove provisions', () => {
  for (const count of [0, 7]) {
    const { d, run } = fixture();
    d.player.provisionsLeft = count;
    run('_resetBattle()');
    assert.equal(d.player.provisionsLeft, count);
  }
});
