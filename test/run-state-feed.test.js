'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createFeedResponseCache } = require('../server/feed-response');

function harness(playthroughs, graph = { 1: {} }) {
  let saved = { graph, playthroughs };
  let incoming;
  const pushes = [];
  const updates = [];
  const cache = createFeedResponseCache({
    build: () => ({ entries: saved.playthroughs.filter(pt => pt.startedAt)
      .map(pt => ({ ...pt, completedAt: pt.completedAt || pt.startedAt })) }),
    version: () => 0, externalVersion: () => 0,
  });
  const db = {
    getBookState: () => saved,
    getPartyForBook: () => null,
    saveBookState: (_user, _book, state) => { saved = state; return true; },
    getBookContainerFields: () => ({}), processStateXp() {},
  };
  const context = {
    module: { exports: {} },
    require(name) {
      if (name === '../db') return db;
      if (name === '../db/run-endings') return require('../server/db/run-endings');
      if (name === '../request-helpers') return {
        authenticate: async () => 1, readBody: async () => incoming,
        isRequestImpersonating: () => false,
        send: (_res, status) => assert.equal(status, 200),
      };
      if (name === '../sse') return {
        bookStreamPush(_user, _book, excludedClient) { updates.push(excludedClient); },
        feedPush(payload) { pushes.push(payload); cache.invalidate(); },
      };
      return {};
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../server/routes/books'), 'utf8'), context);
  return {
    cache, pushes, updates,
    async save(runs, nextGraph = graph) {
      incoming = { graph: nextGraph, playthroughs: structuredClone(runs) };
      await context.module.exports.handleSaveState({ headers: { 'x-book-client': 'editor' } }, {}, 200);
    },
  };
}

test('deleting the last run invalidates the cached feed and broadcasts the removal', async () => {
  const h = harness([{ startedAt: Date.now(), path: [1] }]);
  assert.equal(h.cache.get().entries.length, 1);
  await h.save([]);
  assert.equal(h.pushes.length, 1);
  assert.equal(h.pushes[0].type, 'feed_changed');
  assert.equal(h.cache.get().entries.length, 0);
});

test('ending edits reclassify or reopen past story runs and refresh the editing tab', async () => {
  const win = { startedAt: 100, path: [1, 92], completed: true, completedAt: 300, result: 'success' };
  const battle = { ...win, startedAt: 150, result: 'battle' };
  const laterWin = { ...win, startedAt: 200, completedAt: 400, path: [1, 100] };
  const chart = { 92: { choices: [0] }, 100: { choices: [0] } };
  const h = harness([win, battle, laterWin], chart);
  await h.save([win, battle, laterWin], { ...chart, 92: { choices: [-1] } });
  assert.deepEqual(h.cache.get().entries.map(run => run.result), ['death', 'battle', 'success']);
  assert.equal(h.cache.get().entries[0].completedAt, 300);
  assert.equal(h.updates[0], null);
  const removed = harness([win, battle, laterWin], chart);
  await removed.save([win, battle, laterWin], { 100: chart[100] });
  assert.equal(removed.cache.get().entries[0].completed, false);
  assert.deepEqual(removed.cache.get().entries[0].path, [1, 92]);
});

test('adding or moving a sole mapped ending applies only at the affected run endpoint', async () => {
  const run = { startedAt: 100, path: [1, 91], completed: false };
  const other = { startedAt: 200, path: [1, 92], completed: true, completedAt: 400, result: 'success' };
  const chart = { 91: { choices: [92] }, 92: { choices: [0] } };
  const h = harness([run, other], chart);
  await h.save([run, other], { 91: { choices: [0] }, 92: { choices: [100] } });
  assert.deepEqual(h.cache.get().entries.map(run => run.result), ['success', null]);

  const ambiguous = harness([run, other], chart);
  await ambiguous.save([run, other], { ...chart, 91: { choices: [0, -1] } });
  assert.equal(ambiguous.cache.get().entries[0].completed, false);
});

test('run removals, replacements and completion changes refresh other players', async () => {
  const first = { startedAt: 100, path: [1] };
  const completed = { startedAt: 200, completed: true, completedAt: 300, result: 'success' };
  for (const [before, after] of [
    [[first, completed], [first]],
    [[first, completed], [completed]],
    [[first], [{ ...first, startedAt: 400 }]],
    [[completed], [{ ...completed, completed: false, result: null }]],
    [[completed], [{ ...completed, result: 'death' }]],
    [[completed], [{ ...completed, completedAt: 500 }]],
    [[first], [{ ...first, isPublic: true }]],
  ]) {
    const h = harness(before);
    h.cache.get();
    await h.save(after);
    assert.equal(h.pushes.length, 1, JSON.stringify({ before, after }));
  }
});

test('ordinary navigation still avoids a feed broadcast on every save', async () => {
  const h = harness([{ startedAt: 100, path: [1] }]);
  await h.save([{ startedAt: 100, path: [1, 2], lastActionAt: 500 }]);
  assert.equal(h.pushes.length, 0);
});
