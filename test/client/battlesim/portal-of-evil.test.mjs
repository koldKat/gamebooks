import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim233.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function fixture(saved) {
  const pt = saved ? { sim233: structuredClone(saved) } : {};
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState: () => {}, t: k => k });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  const run = s => vm.runInContext(s, context);
  return { run, d: run('_data()') };
}

test('new characters start with two meals', () => {
  const f = fixture();
  assert.equal(f.d.player.provisionsLeft, 2);
  f.run('_data()');
  assert.equal(f.d.player.provisionsLeft, 2);
});

test('existing supplies, stats and saved fights remain unchanged', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  Object.assign(saved.player, { skill: 9, stamina: 12, luck: 7, provisionsLeft: 7 });
  Object.assign(saved.enemy, { name: 'Koailit', skill: 6, stamina: 2, staminaMax: 3 });
  saved.rolled = true;
  saved.pendingLuckQueue = [{ kind: 'enemy-hit' }];
  saved.history = [{ enemy: 'Goblin', outcome: 'win', ts: 123 }];
  saved.log = ['Existing round'];
  assert.deepEqual(JSON.parse(JSON.stringify(fixture(saved).d)), saved);
});

test('older characters with no meal field keep the legacy default', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  delete saved.player.provisionsLeft;
  assert.equal(fixture(saved).d.player.provisionsLeft, 10);
});

test('new characters consume their two meals and no more', () => {
  const f = fixture();
  Object.assign(f.d.player, { stamina: 1, staminaInitial: 20 });
  f.d.rolled = true;
  f.run('_eatProvisions(); _eatProvisions()');
  assert.equal(f.d.player.provisionsLeft, 0);
  assert.equal(f.d.player.stamina, 9);
  const before = JSON.stringify(f.d);
  f.run('_eatProvisions()');
  assert.equal(JSON.stringify(f.d), before);
});
