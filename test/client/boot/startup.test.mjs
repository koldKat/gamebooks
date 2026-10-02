import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/startup.js', import.meta.url), 'utf8');

function setup(online = true) {
  const handlers = new Map();
  let tick, cleared = false, removed = false, reloads = 0;
  const retry = { hidden: false, addEventListener: (_, fn) => handlers.set('click', fn) };
  const message = { textContent: 'Loading Gamebook Tracker...' };
  const panel = { remove: () => { removed = true; } };
  const nodes = { 'app-startup': panel, 'app-startup-message': message, 'app-startup-retry': retry };
  const window = {
    addEventListener: (name, fn) => handlers.set(name, fn),
    removeEventListener: name => handlers.delete(name),
  };
  vm.runInNewContext(source, {
    window, document: { getElementById: id => nodes[id] },
    navigator: { onLine: online }, location: { reload: () => reloads++ },
    setTimeout: (fn, ms) => { assert.equal(ms, 12000); tick = fn; return 1; },
    clearTimeout: () => { cleared = true; },
  });
  return { window, retry, message, handlers, tick: () => tick(),
    get cleared() { return cleared; }, get removed() { return removed; },
    get reloads() { return reloads; } };
}

test('slow startup offers manual recovery without automatically reloading', () => {
  const s = setup();
  assert.equal(s.retry.hidden, true);
  s.tick();
  assert.match(s.message.textContent, /longer than usual/);
  assert.equal(s.retry.hidden, false);
  assert.equal(s.reloads, 0);
  s.handlers.get('click')();
  assert.equal(s.reloads, 1);
});

test('offline startup explains reconnection; successful startup disposes its watchdog', () => {
  const s = setup(false);
  s.tick();
  assert.match(s.message.textContent, /offline/);
  s.window.appStartup.ready();
  s.window.appStartup.ready();
  assert.equal(s.cleared, true);
  assert.equal(s.removed, true);
  assert.equal(s.handlers.has('error'), false);
});

test('script failures offer retry; unrelated image failures do not', () => {
  const s = setup();
  s.handlers.get('error')({ target: { tagName: 'IMG' } });
  assert.equal(s.retry.hidden, true);
  s.handlers.get('error')({ target: { tagName: 'SCRIPT' } });
  assert.match(s.message.textContent, /could not start/);
  assert.equal(s.retry.hidden, false);
  assert.equal(s.cleared, true);
  s.window.appStartup.ready();
  assert.equal(s.removed, true);
});

test('both install entry points draw startup feedback before loading application scripts', () => {
  for (const name of ['index.html', 'mobile/index.html']) {
    const html = readFileSync(new URL('../../../public/' + name, import.meta.url), 'utf8');
    assert.match(html, /<script defer src="\/vendor\/vis-network\/vis-network.min.js"><\/script>/);
    const startup = html.slice(html.indexOf('id="app-startup"'), html.indexOf('<script src="/startup.js">'));
    assert.match(startup, /<svg class="(?:feed-loading-graph|mlg-graph)"/);
    assert.equal((startup.match(/<circle /g) || []).length, 5);
    assert.ok(!startup.includes('startup-spinner'));
    assert.ok(html.indexOf('id="app-startup"') < html.indexOf('<script src="/startup.js">'));
    assert.ok(html.indexOf('<script src="/startup.js">') < html.indexOf('<script type="module"'));
  }
});
