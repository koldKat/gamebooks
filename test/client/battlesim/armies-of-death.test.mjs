import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim232.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function fixture(saved) {
  const pt = saved ? { sim232: structuredClone(saved) } : {};
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState: () => {}, t: k => k });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  const run = s => vm.runInContext(s, context);
  return { run, d: run('_data()') };
}

test('new characters start without potions or provisions', () => {
  const f = fixture();
  assert.equal(f.d.player.potionUsesLeft, 0);
  assert.equal(f.d.player.provisionsLeft, 0);
  f.run('_data()');
  assert.equal(f.d.player.potionUsesLeft, 0);
  assert.equal(f.d.player.provisionsLeft, 0);
});

test('existing supplies, stats and saved fights remain unchanged', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  Object.assign(saved.player, { skill: 9, stamina: 12, luck: 7, potionUsesLeft: 1, provisionsLeft: 7 });
  Object.assign(saved.enemy, { name: 'Tree Man', skill: 8, stamina: 5, staminaMax: 8 });
  saved.rolled = true;
  saved.pendingLuckQueue = [{ kind: 'enemy-hit' }];
  saved.history = [{ enemy: 'Goblin', outcome: 'win', ts: 123 }];
  saved.log = ['Existing round'];
  assert.deepEqual(JSON.parse(JSON.stringify(fixture(saved).d)), saved);
});

test('older characters with missing supply fields keep legacy defaults', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  delete saved.player.potionUsesLeft;
  delete saved.player.provisionsLeft;
  const f = fixture(saved);
  assert.equal(f.d.player.potionUsesLeft, 1);
  assert.equal(f.d.player.provisionsLeft, 10);
});

test('new characters cannot consume absent supplies', () => {
  const f = fixture();
  Object.assign(f.d.player, { skill: 6, skillInitial: 9, stamina: 8, staminaInitial: 20, luck: 6 });
  f.d.rolled = true;
  const before = JSON.stringify(f.d);
  f.run('_usePotion(); _eatProvisions()');
  assert.equal(JSON.stringify(f.d), before);
});
