'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

for (const kind of ['book', 'series']) {
  test(`${kind} library removal sends party membership SSE only for committed removals`, async () => {
    const events = [], responses = [];
    let cascade, options, userId = 1;
    const db = {
      getBookIdentifiers: () => ({ is_public: 1 }),
      getSeriesById: () => ({ created_by: 2 }),
      deleteBook: (_userId, _id, requestedCascade, suppliedOptions) => {
        cascade = requestedCascade; options = suppliedOptions;
        options.onPartyChanged(7); return true;
      },
      removeSeriesFromLibrary: (_userId, _id, suppliedOptions) => {
        cascade = true; options = suppliedOptions; options.onPartyChanged(7);
      },
      removeSeriesEntryOnly: () => { cascade = false; },
    };
    const context = vm.createContext({ module: { exports: {} }, URL, require: name => {
      if (name === '../db') return db;
      if (name === '../request-helpers') return {
        authenticate: async () => userId,
        send: (_res, status) => responses.push(status),
      };
      if (name === '../sse') return {
        ssePush: (id, excluded, payload) => events.push([id, excluded, payload.type]),
        publicCatalogPush() {}, feedPush() {},
      };
      return {};
    } });
    vm.runInContext(fs.readFileSync(require.resolve('../server/routes/books'), 'utf8'), context);
    const handler = context.module.exports[kind === 'book' ? 'handleDeleteBook' : 'handleDeleteSeries'];
    await handler({ url: '/api/' + kind + '/11' }, {}, 11);
    assert.equal(cascade, true);
    assert.deepEqual(events, [[7, 1, 'party_changed']]);
    assert.deepEqual(responses, [200]);
    if (kind === 'series') {
      await handler({ url: '/api/series/11?cascade=0' }, {}, 11);
      assert.equal(cascade, false);
      assert.equal(events.length, 1, 'keeping books does not alter party membership');
    }
    userId = null;
    await handler({ url: '/api/' + kind + '/11' }, {}, 11);
    assert.equal(events.length, 1, 'unauthenticated requests cannot alter parties');
  });
}
