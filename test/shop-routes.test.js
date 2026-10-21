'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(purchase) {
  const sent = [], headers = new Map();
  let badges = 0;
  const context = vm.createContext({ module: { exports: {} }, require(name) {
    if (name === '../db') return { purchaseShopItem: purchase };
    if (name === '../db/diamond-exchange') return {};
    if (name === '../sse') return { userBadgePush() { badges++; } };
    if (name === '../request-helpers') return {
      authenticate: async () => 17, readBody: async () => ({ item: 'gc_mint' }),
      send(res, status, body) { sent.push({ status, body }); },
    };
    throw Error('Unexpected import: ' + name);
  } });
  vm.runInContext(fs.readFileSync(require.resolve('../server/routes/shop'), 'utf8'), context);
  return { run: () => context.module.exports.handleShopPurchase({}, { setHeader: (key, value) => headers.set(key, value) }), sent, headers, badges: () => badges };
}

for (const code of ['SQLITE_BUSY', 'SQLITE_BUSY_SNAPSHOT']) {
  test(`locked shop purchase returns a retryable response for ${code}`, async () => {
    const h = fixture(() => { throw Object.assign(Error('database is locked'), { code }); });
    await h.run();
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].status, 503);
    assert.match(h.sent[0].body.error, /shop is busy.*try again/i);
    assert.equal(h.headers.get('Retry-After'), '2');
    assert.equal(h.badges(), 0);
  });
}

test('shop does not disguise unrelated database failures as lock contention', async () => {
  const error = Object.assign(Error('bad column'), { code: 'SQLITE_ERROR' });
  const h = fixture(() => { throw error; });
  await assert.rejects(h.run(), candidate => candidate === error);
  assert.equal(h.sent.length, 0);
});
