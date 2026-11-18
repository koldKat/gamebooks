import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import sectionCounts from '../../server/db/reading-section-counts.js';

const source = readFileSync(new URL('../../server/db/xp.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function _normSec('), source.indexOf('// Fall back to the permanent visit ledger'));

test('server progress excludes only configured entries, including references and normalized paths', () => {
  const context = { isMappedGraphNode: sectionCounts.isMappedGraphNode };
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
    isMappedGraphNode: sectionCounts.isMappedGraphNode,
    uncountedReadingSections: (_db, _book, entry) => entry == null ? [] : [entry],
    db: { prepare: sql => ({ get: () => sql.includes('FROM books') ? { uncounted_entry: 'prologue' } : { n: 0 } }) },
    awardXp: (_user, event, ref) => awards.push([event, ref]),
    awardCoins: (_user, event, ref) => coins.push([event, ref]),
    _checkGroupMilestone() {}, SIM_HISTORY_KEYS: [], _xpRefSeq: 0,
    _permanentVisitedCount: () => 0,
    isImpersonatingContext: () => false, createRubyCompletionChecker: () => () => 0,
    _rubyCompletionChecker: null, _discoveryRubyChecker: null, CUSTOM_NODE_SHAPES: new Set(),
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
  assert.deepEqual(coins, [], 'completion gold has been retired');
});

test('mapping completion waits for mapped nodes even when every destination was already visited', () => {
  const awards = [];
  const context = {
    isMappedGraphNode: sectionCounts.isMappedGraphNode,
    uncountedReadingSections: () => [],
    db: { prepare: () => ({ get: () => ({}) }) },
    awardXp: (_user, event, ref) => awards.push([event, ref]),
    awardCoins() {}, _checkGroupMilestone() {}, SIM_HISTORY_KEYS: [], _xpRefSeq: 0,
    _permanentVisitedCount: () => 999,
    isImpersonatingContext: () => false, createRubyCompletionChecker: () => () => 0,
    _rubyCompletionChecker: null, _discoveryRubyChecker: null, CUSTOM_NODE_SHAPES: new Set(),
  };
  runInNewContext(helpers, context);
  runInNewContext(source.slice(source.indexOf('function processStateXp('), source.indexOf('function migrateXpForUser(')), context);
  const state = { graph: {
    1: { choices: [2, 3, 4] }, 2: { choices: [1] },
    3: { discovered: true, choices: [0] },
  }, playthroughs: [{ path: [1, 2, 3, 4] }] };
  context.processStateXp(1, 1316, {}, state, 4);
  assert.equal(awards.filter(([event]) => event === 'visit_node').length, 4);
  assert.equal(awards.some(([event]) => event === 'visit_all'), false,
    'run destinations, discovered ending hints and permanent visit history cannot finish mapping');
  const mapped = structuredClone(state);
  mapped.graph[3] = { manual: true, choices: [0] };
  mapped.graph[4] = { discovered: true, choices: [], portals: [{ bookId: 42 }] };
  context.processStateXp(1, 1316, state, mapped, 4);
  assert.equal(awards.filter(([event]) => event === 'visit_all').length, 1,
    'manual and portal-only mapping completes even when the old run already visited every node');
  context.processStateXp(1, 1316, mapped, mapped, 4);
  assert.equal(awards.filter(([event]) => event === 'visit_all').length, 1);
});
