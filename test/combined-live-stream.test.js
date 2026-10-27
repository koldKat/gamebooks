'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../server/routes/books'), 'utf8');
const handler = source.slice(source.indexOf('async function handleGetFeedStream('), source.indexOf('async function handleGetUserStream('));

for (const account of ['guest', 'player', 'sashii', 'admin']) test(`combined stream subscriptions and cleanup for ${account}`, async () => {
  const calls = [], registered = new Set(); let cleanup;
  const context = { URL, SSE_PING_MS: 30000,
    tokenFromReq: () => account === 'guest' ? null : 'fixture',
    db: { getSession: () => ({ user_id: 17 }), canSeeAppXp: () => ['sashii','admin'].includes(account), isUserAdmin: () => account === 'admin' },
    maintainStream: (_res, fn) => { cleanup = fn; },
  };
  for (const name of ['feed', 'publicCatalog', 'userBadge', 'appXp']) {
    context[name + 'Register'] = (...args) => { registered.add(name); calls.push([name, args]); };
    context[name + 'Unregister'] = () => registered.delete(name);
  }
  vm.runInNewContext(handler, context);
  await context.handleGetFeedStream({ url: '/api/feed/stream?combined=1' }, { writeHead() {}, write() {} });
  const expected = ['feed', 'publicCatalog'];
  if (account !== 'guest') expected.push('userBadge');
  if (['sashii','admin'].includes(account)) expected.push('appXp');
  assert.deepEqual([...registered], expected);
  if (expected.includes('appXp')) assert.equal(calls.find(c => c[0] === 'appXp')[1][1].summaryOnly, account !== 'admin');
  cleanup(); assert.equal(registered.size, 0);
});

test('legacy feed stream remains public and subscribes only to the feed', async () => {
  const registered = []; let cleanup;
  const context = { URL, SSE_PING_MS: 30000, tokenFromReq: () => { throw Error('must not inspect auth'); },
    feedRegister: () => registered.push('feed'), feedUnregister: () => registered.pop(),
    maintainStream: (_res, fn) => { cleanup = fn; },
  };
  vm.runInNewContext(handler, context);
  await context.handleGetFeedStream({ url: '/api/feed/stream' }, { writeHead() {}, write() {} });
  assert.deepEqual(registered, ['feed']); cleanup(); assert.deepEqual(registered, []);
});
