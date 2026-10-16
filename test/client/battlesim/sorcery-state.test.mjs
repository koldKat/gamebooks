import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../../public/js/battlesim/books/724/state.js';

function fixture() {
  let run = { startedAt: 1, sim723: { preserved: true } }, book = 724, saves = 0;
  const store = createState(() => ({ currentBookId: book, currentPlaythrough: () => run, saveState: () => saves++ }));
  return { store, get run() { return run; }, get saves() { return saves; }, switchRun() { run = { startedAt: 2 }; }, switchBook() { book = 723; } };
}

test('reading or rejected updates never initialize or overwrite saved state', () => {
  const f = fixture();
  assert.equal(f.store.read(), null);
  assert.equal(f.saves, 0);
  assert.throws(() => f.store.change(() => { throw Error('Invalid update'); }));
  assert.throws(() => f.store.change(() => Promise.resolve()));
  assert.equal(f.run.sim724, undefined);
  f.store.change(data => { data.character = { stamina: 12 }; });
  const before = f.run.sim724;
  assert.throws(() => f.store.change(data => { data.character.stamina = 0; throw Error('Invalid update'); }));
  assert.equal(f.run.sim724, before);
  assert.equal(before.character.stamina, 12);
  assert.deepEqual(f.run.sim723, { preserved: true });
});

test('run, book and concurrent-state switches abort a stale transaction', () => {
  for (const change of ['switchRun', 'switchBook', 'replace']) {
    const f = fixture(), original = f.run;
    const result = f.store.change(data => {
      data.character = { stamina: 1 };
      if (change === 'replace') original.sim724 = { anotherAction: true };
      else f[change]();
    });
    assert.equal(result, false);
    assert.equal(f.saves, 0);
    assert.equal(original.sim724?.character, undefined);
    assert.equal(f.run.sim724?.character, undefined);
  }
});

test('only fresh wins and losses enter history once, with unique XP timestamps', () => {
  const f = fixture();
  const fight = outcome => ({ outcome, name: 'Named encounter', config: { key: 'wolf' }, player: { stamina: 8, staminaInitial: 20 } });
  f.store.change(data => { data.fight = fight('win'); });
  assert.equal(f.store.read().history.length, 1);
  f.store.change(data => { data.log.push('Another action'); });
  assert.equal(f.store.read().history.length, 1);
  const ts = Date.now() + 100000;
  f.store.change(data => { data.history[0].ts = ts; data.fight = fight('loss'); });
  assert.equal(f.store.read().history[1].ts, ts + 1);
  for (const outcome of ['continue', 'cancelled']) f.store.change(data => { data.fight = fight(outcome); });
  assert.equal(f.store.read().history.length, 2);
  f.store.change(data => { data.log = Array.from({ length: 150 }, (_, i) => String(i)); });
  assert.equal(f.store.read().log.length, 100);
  assert.equal(f.store.read().log[0], '50');
  assert.equal(f.store.read().history[0].enemy, 'Named encounter');
});
