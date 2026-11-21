'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createFeedResponseCache } = require('../server/feed-response');

function harness(playthroughs) {
  let saved = { graph: { 1: {} }, playthroughs };
  let incoming;
  const pushes = [];
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
      if (name === '../request-helpers') return {
        authenticate: async () => 1, readBody: async () => incoming,
        isRequestImpersonating: () => false,
        send: (_res, status) => assert.equal(status, 200),
      };
      if (name === '../sse') return {
        bookStreamPush() {},
        feedPush(payload) { pushes.push(payload); cache.invalidate(); },
      };
      return {};
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../server/routes/books'), 'utf8'), context);
  return {
    cache, pushes,
    async save(runs) {
      incoming = { graph: { 1: {} }, playthroughs: runs };
      await context.module.exports.handleSaveState({ headers: {} }, {}, 200);
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
