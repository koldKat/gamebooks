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
      state, currentBookId: 2, AbortController, setTimeout, clearTimeout, getToken: () => "test", CustomEvent: class {}, window: { dispatchEvent() {} },
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

function queueHarness() {
  const source = fs.readFileSync(require.resolve('../public/js/core/state'), 'utf8');
  const fragment = source.slice(source.indexOf('let _saveInFlight ='), source.indexOf('// Canvas drags')).replaceAll('export ', '');
  const requests = [], timers = new Map(), events = [];
  const context = vm.createContext({
    state: { version: 1 }, currentBookId: 2, AbortController, getToken: () => 'test',
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    window: { dispatchEvent: event => events.push(event) },
    setTimeout: fn => { const id = Symbol(); timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    apiFetch: (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Error('timeout')), { once: true });
      requests.push({ url, body: JSON.parse(options.body), resolve, reject });
    }),
  });
  const api = vm.runInContext(fragment + '\n({saveState,flushStateSaves,retryStateSaves})', context);
  return { api, context, requests, timers, events };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('a hung save is aborted and retried with the latest edits, not left blocking the queue', async () => {
  const h = queueHarness();
  h.api.saveState(); h.context.state.version = 2; h.api.saveState();
  [...h.timers.values()][0](); await tick();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].body.version, 2);
  h.requests[1].resolve({ ok: true }); await h.api.flushStateSaves();
  assert.deepEqual(h.events.map(e => e.type), ['book-state-save-failed', 'book-state-saved']);
  assert.equal(h.timers.size, 0);
});

test('repeated failures retain the unsaved snapshot for explicit retry and block unsafe navigation', async () => {
  const h = queueHarness(); h.api.saveState();
  for (let i = 0; i < 3; i++) { h.requests[i].reject(Error('offline')); await tick(); }
  assert.equal(h.requests.length, 3, 'retries are bounded');
  await assert.rejects(h.api.flushStateSaves(), /has not been saved/);
  h.api.retryStateSaves();
  assert.equal(h.requests[3].body.version, 1);
  h.requests[3].resolve({ ok: true }); await h.api.flushStateSaves();
});

test('queued edits keep their original book even if the active book changes', async () => {
  const h = queueHarness(); h.api.saveState();
  h.context.state.version = 2; h.api.saveState();
  h.context.currentBookId = 9; h.context.state = { version: 9 }; h.api.saveState();
  h.requests[0].resolve({ ok: true }); await tick();
  assert.equal(h.requests[1].url, '/api/books/2/state');
  assert.equal(h.requests[1].body.version, 2);
  h.requests[1].resolve({ ok: true }); await tick();
  assert.equal(h.requests[2].url, '/api/books/9/state');
  assert.equal(h.requests[2].body.version, 9);
  h.requests[2].resolve({ ok: true }); await h.api.flushStateSaves();
});

test('rejected saves are visible and are not automatically retried as network failures', async () => {
  const h = queueHarness(); h.api.saveState();
  h.requests[0].resolve({ ok: false, status: 409 }); await tick();
  assert.equal(h.requests.length, 1);
  assert.equal(h.events[0].type, 'book-state-save-failed');
  await assert.rejects(h.api.flushStateSaves(), /has not been saved/);
});

test('a failed save cannot be retried using another account session', async () => {
  const h = queueHarness(); h.api.saveState();
  h.requests[0].resolve({ ok: false, status: 409 }); await tick();
  h.context.getToken = () => 'different-account';
  await h.api.retryStateSaves();
  assert.equal(h.requests.length, 1);
});
