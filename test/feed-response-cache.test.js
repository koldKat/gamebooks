'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createFeedResponseCache } = require('../server/feed-response');

function fixture() {
  let time = 1_800_000_000_000, revision = 'feed-1', external = 1, builds = 0;
  let data = { entries: [{ type: 'book_created', completedAt: time }], pinned: { body: 'Pinned' } };
  const cache = createFeedResponseCache({
    now: () => time, version: () => revision, externalVersion: () => external,
    build: () => { builds++; return structuredClone(data); },
  });
  return { cache, builds: () => builds, advance: ms => { time += ms; },
    revision: v => { revision = v; }, external: () => { external++; },
    data: value => { data = value; }, time: () => time };
}

test('unchanged feed is shared across requests without changing its payload', () => {
  const f = fixture(), first = f.cache.get();
  for (let i = 0; i < 100; i++) assert.strictEqual(f.cache.get(), first);
  assert.equal(f.builds(), 1);
  assert.deepEqual(first.pinned, { body: 'Pinned' });
  f.revision('feed-2');
  assert.notStrictEqual(f.cache.get(), first);
  assert.equal(f.builds(), 2);
});

test('privacy/deletion invalidation and external database writes cannot reuse old entries', () => {
  const f = fixture();
  f.cache.get();
  f.data({ entries: [], pinned: null });
  f.cache.invalidate();
  assert.deepEqual(f.cache.get(), { entries: [], pinned: null });
  f.data({ entries: [{ type: 'announcement', body: 'Edited' }], pinned: null });
  f.external();
  assert.equal(f.cache.get().entries[0].body, 'Edited');
  assert.equal(f.builds(), 3);
});

test('time alone expires the cache and rolling-window entries', () => {
  const f = fixture();
  f.cache.get();
  f.advance(29_999); f.cache.get(); assert.equal(f.builds(), 1);
  f.advance(1); f.cache.get(); assert.equal(f.builds(), 2);
  f.data({ entries: [{ completedAt: f.time() - 30 * 86400_000 + 1000 }], pinned: null });
  f.cache.invalidate(); f.cache.get();
  f.advance(2000); f.cache.get(); assert.equal(f.builds(), 4);
});

test('a failed rebuild is retried rather than serving a stale success', () => {
  let fail = true;
  const cache = createFeedResponseCache({ version: () => 1, externalVersion: () => 1,
    build: () => { if (fail) throw new Error('database unavailable'); return { entries: [] }; } });
  assert.throws(() => cache.get(), /database unavailable/);
  fail = false;
  assert.deepEqual(cache.get(), { entries: [] });
});

test('feed and catalog SSE invalidate even with no connected clients', () => {
  let invalidated = 0;
  const context = { module: { exports: {} }, require(name) {
    if (name === './db') return { setXpFeedHook() {}, setAppXpHook() {} };
    if (name === './sse-transport') return { writeEvent() {} };
    if (name === './feed-response') return { invalidateFeedResponse() { invalidated++; } };
    throw new Error('Unexpected module: ' + name);
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../server/sse'), 'utf8'), context);
  context.module.exports.feedPush();
  context.module.exports.publicCatalogPush({ type: 'public_catalog_changed' });
  assert.equal(invalidated, 2);
});

test('unsharing a completed run invalidates the feed, ordinary navigation does not', async () => {
  const source = fs.readFileSync(require.resolve('../server/routes/books'), 'utf8');
  const start = source.indexOf('async function handleSaveState(');
  const end = source.indexOf('\nasync function ', start + 1);
  const old = { graph: { 1: { choices: [] } }, playthroughs: [
    { startedAt: 1000, completed: true, isPublic: true, path: [1] },
  ] };
  let next = structuredClone(old), pushes = 0;
  const save = vm.runInNewContext(source.slice(start, end) + '\nhandleSaveState', {
    authenticate: async () => 1, isRequestImpersonating: () => false,
    readBody: async () => next, send() {}, bookStreamPush() {},
    feedPush() { pushes++; }, db: {
      getBookState: () => old, saveBookState: () => true,
      getPartyForBook: () => null, getBookContainerFields: () => ({}), processStateXp() {},
    },
  });
  next.playthroughs[0].isPublic = false;
  await save({ headers: {} }, {}, 10);
  assert.equal(pushes, 1, 'privacy changes must discard the shared response immediately');
  next = structuredClone(old);
  next.playthroughs[0].path.push(2);
  await save({ headers: {} }, {}, 10);
  assert.equal(pushes, 1, 'ordinary node visits must not discard everyone\'s cached feed');
});
