import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/mobile/js/app.js', import.meta.url), 'utf8');

function setup() {
  let ready = 0, failed = 0, renderCalls = 0, resolveReader, rejectReader;
  const pending = new Promise((resolve, reject) => { resolveReader = resolve; rejectReader = reject; });
  const mount = { innerHTML: '' };
  const context = vm.createContext({
    window: { innerHeight: 800, location: {}, addEventListener() {}, appStartup: {
      ready: () => ready++, fail: () => failed++,
    } },
    document: { documentElement: { style: { setProperty() {} } },
      getElementById: id => id === 'screen' ? mount : { addEventListener() {} } },
    location: { search: '?book=1' }, URLSearchParams,
    getToken: () => 'account',
    apiFetch: async path => ({ ok: true, json: async () => path === '/api/profile' ? {} : [{ id: 1, hasLiveReading: true }] }),
    renderReader: () => { renderCalls++; return pending; }, renderLogin() {},
    setCurrentUserLevel() {}, setBonusUndos() {}, setBonusFastTravels() {},
    setInterval: () => 1, clearInterval() {}, t: key => key,
    console: { error() {} },
  });
  vm.runInContext(source.replace(/^import .*;$/gm, ''), context);
  return { resolveReader, rejectReader, mount,
    get ready() { return ready; }, get failed() { return failed; },
    get renderCalls() { return renderCalls; } };
}

test('mobile startup stays recoverable until asynchronous reader initialization finishes', async () => {
  const s = setup();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.renderCalls, 1);
  assert.equal(s.ready, 0);
  s.resolveReader();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.ready, 1);
  assert.equal(s.failed, 0);
});

test('mobile reader initialization failure is caught and offers recovery', async () => {
  const s = setup();
  await new Promise(resolve => setImmediate(resolve));
  s.rejectReader(new Error('Reader failed'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.ready, 0);
  assert.equal(s.failed, 1);
  assert.match(s.mount.innerHTML, /m-load-back/);
});
