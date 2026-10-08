import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../server/db/xp.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function _normSec('), source.indexOf('// Fall back to the permanent visit ledger'));

test('server progress excludes only configured entries, including references and normalized paths', () => {
  const context = {};
  runInNewContext(helpers, context);
  const graph = { prologue: { choices: ['20', 140] }, 20: { choices: ['prologue'] } };
  assert.deepEqual([...context._discoveredSet(graph, ['prologue'])], [20, 140]);
  assert.deepEqual([...context._mappedSet(graph, ['prologue'])], [20]);
  assert.deepEqual([...context._visitedSet([{ path: ['prologue', 20, '20', -1] }], ['prologue'])], [20]);
  assert.equal(context._discoveredSet(graph).has('prologue'), true);
  assert.deepEqual([...context._visitedSet([{ path: ['20', 21] }], [20])], [21]);
});

test('unnumbered entry cannot award node XP or trigger an early completion milestone', () => {
  const awards = [], coins = [];
  const context = {
    db: { prepare: sql => ({ get: () => sql.includes('FROM books') ? { uncounted_entry: 'prologue' } : { n: 0 } }) },
    awardXp: (_user, event, ref) => awards.push([event, ref]),
    awardCoins: (_user, event, ref) => coins.push([event, ref]),
    _checkGroupMilestone() {}, SIM_HISTORY_KEYS: [], _xpRefSeq: 0,
    _permanentVisitedCount: () => 0,
  };
  runInNewContext(helpers, context);
  runInNewContext(source.slice(source.indexOf('function processStateXp('), source.indexOf('function migrateXpForUser(')), context);
  const state = { graph: { prologue: { choices: [20] }, 20: { choices: [] } }, playthroughs: [{ path: ['prologue', 20] }] };
  context.processStateXp(1, 534, {}, state, 2);
  assert.deepEqual(awards, [['discover_node', '534:20'], ['visit_node', '534:20']]);
  assert.deepEqual(coins, []);
  const next = structuredClone(state); next.graph[140] = { choices: [] }; next.playthroughs[0].path.push(140);
  context.processStateXp(1, 534, state, next, 2);
  assert.equal(awards.some(([event]) => event === 'discover_all'), true);
  assert.equal(awards.some(([event]) => event === 'visit_all'), true);
  assert.deepEqual(coins, [['book_completed', 534]]);
});
