import { test } from 'node:test';
import assert from 'node:assert/strict';
import policy from '../../server/clean-run.js';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const win = { startedAt: 123, completed: true, result: 'success', path: [1, 2], undosUsed: 0, fastTravelsUsed: 0 };

test('clean run accepts victories and losses but requires a played, completed run', () => {
  for (const result of ['success', 'death', 'battle']) assert.equal(policy.isCleanRun({ ...win, result }), true);
  for (const patch of [{ startedAt: null }, { completed: false }, { result: null }, { result: 'portal' }, { path: [] }]) {
    assert.equal(policy.isCleanRun({ ...win, ...patch }), false);
  }
});

test('undo or fast travel disqualifies clean run, including previous and related runs', () => {
  for (const key of ['undosUsed', 'fastTravelsUsed']) {
    for (const count of [1, -1, NaN, Infinity, '0']) {
      const used = { ...win, [key]: count };
      assert.equal(policy.isCleanRun(used), false);
      assert.equal(policy.isCleanRun(win, used), false);
      assert.equal(policy.isCleanRun(win, null, [used]), false);
    }
  }
  assert.equal(policy.isCleanRun(win, win, [win]), true);
});

test('state XP awards clean runs once per book across winning and losing runs', () => {
  const source = readFileSync(new URL('../../server/db/xp.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('function processStateXp('), source.indexOf('function migrateXpForUser('));
  const ledger = new Set();
  const awards = [];
  const context = {
    isCleanRun: policy.isCleanRun,
    db: { prepare: sql => ({ get: () => sql.includes('FROM books') ? {} : { n: 100 } }) },
    awardXp(_userId, event, ref) {
      const key = `${event}:${ref}`;
      if (ledger.has(key)) return false;
      ledger.add(key);
      awards.push({ event, ref });
      return true;
    },
    awardCoins() {}, getXpAmount: () => 50,
    _discoveredSet: () => new Set(), _visitedSet: () => new Set(), _mappedSet: () => new Set(),
    _checkGroupWonAll() {}, SIM_HISTORY_KEYS: [], _xpRefSeq: 0,
  };
  runInNewContext(code, context);
  for (const result of ['death', 'success', 'battle']) {
    const run = { ...win, result, startedAt: Date.now() };
    context.processStateXp(1, 42, { playthroughs: [{ ...run, completed: false }] }, { playthroughs: [run] }, 0);
  }
  assert.deepEqual(awards.filter(row => row.event === 'clean_run'), [{ event: 'clean_run', ref: '42' }]);
  const used = { ...win, undosUsed: 1 };
  context.processStateXp(1, 43, { playthroughs: [{ ...used, completed: false }] }, { playthroughs: [used] }, 0);
  assert.equal(awards.filter(row => row.event === 'clean_run').length, 1);
});
