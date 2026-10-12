import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/mobile/js/reader.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;$/gm, '').replace(/^export /gm, '');

function setup() {
  let links = [], run = { path: [94] }, auth = 'one', deferred;
  const requests = [], navigated = [], previewed = [];
  const top = { scrollTop: 4, querySelectorAll: () => links };
  Object.defineProperty(top, 'innerHTML', { set() {
    links = ['#section-100', '#section-81', '#other-aside'].map(href => ({
      id: '', getAttribute: () => href,
      addEventListener(_type, listener) { this.click = () => listener({ preventDefault() {} }); },
    }));
  } });
  const context = vm.createContext({
    console, t: key => key, document: { getElementById: id => id === 'm-top' ? top : { addEventListener() {} } },
    currentBookId: 650, getToken: () => auth, currentPlaythrough: () => run,
    currentSection: () => run?.path.at(-1), parseSecId: raw => Number(raw),
    isSectionMapped: sec => sec === 100, navigated, previewed,
    bindReadingMapEntry() {},
    apiFetch: async url => {
      requests.push(url);
      if (deferred) await deferred;
      return { ok: true, json: async () => ({ html: '<p>aside</p>', choices: [] }) };
    },
  });
  vm.runInContext(source, context);
  vm.runInContext('_navigate = sec => navigated.push(sec); _onGraphTap = sec => previewed.push(sec)', context);
  return { context, requests, navigated, previewed, show: readOnly => context._showExtra('original-aside', readOnly),
    get links() { return links; }, set run(value) { run = value; }, set auth(value) { auth = value; },
    set deferred(value) { deferred = value; } };
}

test('mobile aside links navigate from the active run without mapping the aside', async () => {
  const s = setup();
  await s.show(false);
  s.links[0].click();
  assert.deepEqual(s.navigated, [100]);
  assert.deepEqual(s.previewed, []);
});

test('mobile aside preview links open only mapped destinations and stay read-only when nested', async () => {
  const s = setup();
  await s.show(true);
  s.links[0].click(); s.links[1].click();
  assert.deepEqual(s.previewed, [100]);
  assert.deepEqual(s.navigated, []);
  s.links[2].click();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(s.requests.at(-1).endsWith('/other-aside'));
  s.links[0].click();
  assert.deepEqual(s.navigated, []);
  assert.deepEqual(s.previewed, [100, 100]);
});

test('mobile aside links reject replaced runs, account changes and detached links', async () => {
  const s = setup();
  await s.show(false);
  const old = s.links[0];
  s.run = { path: [94] }; old.click();
  assert.deepEqual(s.navigated, []);
  await s.show(false);
  old.click();
  assert.deepEqual(s.navigated, []);
  s.auth = 'two'; s.links[0].click();
  assert.deepEqual(s.navigated, []);
});

test('mobile aside responses do not replace content after switching accounts', async () => {
  const s = setup();
  let resolve;
  s.deferred = new Promise(done => { resolve = done; });
  const request = s.show(false);
  s.auth = 'two'; resolve(); await request;
  assert.deepEqual(s.links, []);
});
