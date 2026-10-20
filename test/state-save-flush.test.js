'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('navigation waits for the latest queued save, including after a failed older response', async () => {
  for (const firstOk of [true, false]) {
    const source = fs.readFileSync(require.resolve('../public/js/core/state'), 'utf8');
    const fragment = source.slice(source.indexOf('let _saveInFlight ='), source.indexOf('// Canvas drags'))
      .replaceAll('export ', '');
    const requests = [], state = { version: 1 };
    const api = vm.runInNewContext(fragment + '\n({saveState,flushStateSaves})', {
      state, currentBookId: 2, CustomEvent: class {}, window: { dispatchEvent() {} },
      apiFetch: (url, options) => new Promise(resolve => requests.push({ url, body: JSON.parse(options.body), resolve })),
    });
    api.saveState(); state.version = 2; api.saveState();
    let flushed = false;
    const waiting = api.flushStateSaves().then(() => { flushed = true; });
    assert.equal(requests.length, 1);
    requests[0].resolve({ ok: firstOk });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(flushed, false, 'an earlier response cannot release navigation while newer edits are queued');
    assert.equal(requests.length, 2);
    assert.equal(requests[1].body.version, 2);
    assert.equal(requests[1].url, '/api/books/2/state');
    requests[1].resolve({ ok: true });
    await waiting;
    assert.equal(flushed, true);
  }
});
