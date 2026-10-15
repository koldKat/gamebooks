import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/startup.js', import.meta.url), 'utf8');

function setup(online = true, store = new Map(), storageThrows = false) {
  const handlers = new Map();
  const timers = new Map();
  let timerId = 0, removed = false, reloads = 0;
  const retry = { hidden: false, addEventListener: (_, fn) => handlers.set('click', fn) };
  const message = { textContent: 'Loading Gamebook Tracker...' };
  const panel = { remove: () => { removed = true; } };
  const nodes = { 'app-startup': panel, 'app-startup-message': message, 'app-startup-retry': retry };
  const window = {
    addEventListener: (name, fn) => handlers.set(name, fn),
    removeEventListener: name => handlers.delete(name),
  };
  const navigator = { onLine: online };
  vm.runInNewContext(source, {
    window, document: { getElementById: id => nodes[id] },
    navigator, location: { pathname: '/mobile/', search: '?book=1', reload: () => reloads++ },
    sessionStorage: {
      getItem: key => { if (storageThrows) throw Error('Storage denied'); return store.get(key) ?? null; },
      setItem: (key, value) => { if (storageThrows) throw Error('Storage denied'); store.set(key, value); },
      removeItem: key => { if (storageThrows) throw Error('Storage denied'); store.delete(key); },
    },
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  return { window, retry, message, handlers, navigator, timers, store,
    tick: (ms = 12000) => {
      const entry = [...timers.entries()].find(([, timer]) => timer.ms === ms);
      assert.ok(entry, `expected a ${ms}ms timer`);
      timers.delete(entry[0]); entry[1].fn();
    },
    get removed() { return removed; },
    get reloads() { return reloads; } };
}

test('slow startup keeps waiting without offering retry or reloading', () => {
  const s = setup();
  assert.equal(s.retry.hidden, true);
  s.tick();
  assert.match(s.message.textContent, /longer than usual/);
  assert.equal(s.retry.hidden, true);
  assert.equal(s.reloads, 0);
  assert.equal(s.timers.size, 0);
});

test('offline startup explains reconnection; successful startup disposes its watchdog', () => {
  const s = setup(false);
  s.tick();
  assert.match(s.message.textContent, /offline/);
  s.window.appStartup.ready();
  s.window.appStartup.ready();
  assert.equal(s.timers.size, 0);
  assert.equal(s.removed, true);
  assert.equal(s.handlers.has('error'), false);
  assert.equal(s.handlers.has('online'), false);
  assert.equal(s.handlers.has('offline'), false);
  assert.equal(s.store.size, 0);
});

test('script failures schedule automatic recovery; unrelated image failures do not', () => {
  const s = setup();
  s.handlers.get('error')({ target: { tagName: 'IMG' } });
  assert.equal(s.retry.hidden, true);
  s.handlers.get('error')({ target: { tagName: 'SCRIPT' } });
  assert.match(s.message.textContent, /could not start/);
  assert.equal(s.retry.hidden, true);
  assert.equal(s.timers.size, 1);
  assert.equal([...s.timers.values()][0].ms, 2000);
  s.window.appStartup.ready();
  assert.equal(s.removed, true);
  assert.equal(s.timers.size, 0);
  assert.equal(s.reloads, 0);
});

test('startup retries have increasing delays and stop after three reloads across page loads', () => {
  const store = new Map();
  for (const delay of [2000, 5000, 10000]) {
    const s = setup(true, store);
    s.window.appStartup.fail();
    s.window.appStartup.fail();
    assert.equal(s.timers.size, 1, 'duplicate errors do not schedule duplicate retries');
    assert.equal(s.retry.hidden, true);
    s.tick(delay);
    assert.equal(s.reloads, 1);
  }
  const s = setup(true, store);
  s.window.appStartup.fail();
  assert.equal(s.timers.size, 0);
  assert.equal(s.reloads, 0);
  assert.equal(s.retry.hidden, false);
  s.handlers.get('click')();
  assert.equal(s.reloads, 1);
  assert.equal(store.size, 0, 'manual recovery starts a new retry budget');
});

test('offline failures wait for connectivity and do not consume retry attempts', () => {
  const s = setup(false);
  s.window.appStartup.fail();
  assert.equal(s.timers.size, 0);
  assert.match(s.message.textContent, /reconnect/);
  s.navigator.onLine = true;
  s.handlers.get('online')();
  assert.equal(s.timers.size, 1);
  s.navigator.onLine = false;
  s.handlers.get('offline')();
  assert.equal(s.timers.size, 0);
  assert.equal(JSON.parse([...s.store.values()][0]).attempts, 0);
  s.navigator.onLine = true;
  s.handlers.get('online')();
  s.tick(2000);
  assert.equal(s.reloads, 1);
});

test('reconnection does not reload a startup that is still progressing', () => {
  const s = setup(false);
  s.tick();
  s.navigator.onLine = true;
  s.handlers.get('online')();
  assert.equal(s.timers.size, 0);
  assert.equal(s.reloads, 0);
  assert.equal(s.retry.hidden, true);
});

test('blocked session storage falls back to manual recovery without an automatic reload loop', () => {
  const s = setup(true, new Map(), true);
  s.window.appStartup.fail();
  assert.equal(s.retry.hidden, false);
  assert.equal(s.timers.size, 0);
  assert.equal(s.reloads, 0);
});

test('malformed or expired retry state does not prevent a fresh recovery attempt', () => {
  for (const saved of ['bad JSON', JSON.stringify({ attempts: 3, startedAt: Date.now() - 300001 })]) {
    const s = setup(true, new Map([['app-startup-retries:/mobile/?book=1', saved]]));
    s.window.appStartup.fail();
    s.tick(2000);
    assert.equal(s.reloads, 1);
  }
});

test('both install entry points draw startup feedback before loading application scripts', () => {
  for (const name of ['index.html', 'mobile/index.html']) {
    const html = readFileSync(new URL('../../../public/' + name, import.meta.url), 'utf8');
    if (name === 'index.html') assert.ok(!html.includes('<script defer src="/vendor/vis-network/vis-network.min.js">'));
    else assert.match(html, /<script defer src="\/vendor\/vis-network\/vis-network.min.js"><\/script>/);
    const startup = html.slice(html.indexOf('id="app-startup"'), html.indexOf('<script src="/startup.js">'));
    assert.match(startup, /<svg class="(?:feed-loading-graph|mlg-graph)"/);
    assert.equal((startup.match(/<circle /g) || []).length, 5);
    assert.ok(!startup.includes('startup-spinner'));
    assert.match(startup, /<button\b[^>]*id="app-startup-retry"[^>]*\bhidden(?:\s|>)/);
    assert.ok(html.indexOf('id="app-startup"') < html.indexOf('<script src="/startup.js">'));
    assert.ok(html.indexOf('<script src="/startup.js">') < html.indexOf('<script type="module"'));
  }
});
