import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load(file, globals) {
  const code = readFileSync(new URL(file, import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  const context = vm.createContext(globals);
  vm.runInContext(code, context);
  return context;
}

function mainNavigation(navState = null) {
  const classes = new Set(), calls = [], location = { hash: '' };
  const history = { state: navState,
    pushState(state, _, hash) { this.state = state; if (hash) location.hash = hash; calls.push('push'); },
    replaceState(state, _, hash) { this.state = state; if (hash) location.hash = hash; calls.push('replace'); } };
  const context = load('../../../public/js/boot/navigation.js', { history, location,
    bootState: { _suppressHistory: false }, Date,
    document: { body: { classList: { contains: c => classes.has(c), add: c => classes.add(c), remove: (...cs) => cs.forEach(c => classes.delete(c)) } } } });
  return { context, history, location, classes, calls };
}

test('launch and login replace the current entry; desktop book navigation still pushes', () => {
  for (const initial of [null, { view: 'login' }]) {
    const s = mainNavigation(initial);
    s.context._pushNav('home', { view: 'books' });
    assert.deepEqual(s.calls, ['replace']);
    s.context._pushNav('book/1', { view: 'book', bookId: 1 });
    s.context._pushNav('home', { view: 'books' });
    assert.deepEqual(s.calls, ['replace', 'push', 'push']);
  }
});

test('mobile panel switches do not stack and main refresh preserves dialog history', () => {
  const s = mainNavigation();
  s.context._pushNav('home', { view: 'books' });
  s.context._openMobilePanel('books');
  s.context._openMobilePanel('addbook');
  assert.deepEqual(s.calls, ['replace', 'push', 'replace']);
  assert.equal(s.history.state.view, 'books');
  s.history.state.dialogOpen = true;
  s.context._pushNav('home', { view: 'books' });
  assert.equal(s.history.state.mobilePanel, 'addbook');
  assert.equal(s.history.state.dialogOpen, true);
  s.context._syncMobilePanelHistory({ mobilePanel: 'books' });
  assert.deepEqual([...s.classes], ['mobile-books-open']);
  s.context._syncMobilePanelHistory({ view: 'books' });
  assert.equal(s.classes.size, 0);
});

test('reader returns through history only to a known main app entry', () => {
  for (const [referrer, length, expected] of [
    ['https://tracker.test/#home', 2, 'back'],
    ['https://tracker.test/', 3, 'back'],
    ['', 1, 'replace'],
    ['https://other.test/', 2, 'replace'],
    ['https://tracker.test/mobile?book=1', 2, 'replace'],
  ]) {
    const calls = [], history = { state: null, length,
      replaceState(state) { this.state = state; }, back() { calls.push('back'); } };
    const c = load('../../../public/mobile/js/navigation.js', { history, URL,
      document: { referrer }, location: { origin: 'https://tracker.test', replace: path => calls.push(path === '/' ? 'replace' : path) } });
    c.initMainAppReturn(); c.returnToMainApp();
    assert.deepEqual(calls, [expected], referrer);
    if (expected === 'back') {
      c.document.referrer = ''; c.initMainAppReturn(); c.returnToMainApp();
      assert.deepEqual(calls, ['back', 'back'], 'reader reload retains its return destination');
    }
  }
});

test('panel and dialog Back events do not rebuild the already visible main screen', async () => {
  const handlers = {}, calls = [];
  const c = load('../../../public/js/boot/routing.js', {
    window: { addEventListener: (name, handler) => { handlers[name] = handler; } },
    bootState: { _suppressHistory: false }, currentBookId: null,
    location: { pathname: '/', hash: '' }, getToken: () => 'account',
    document: { getElementById: () => ({ style: { display: 'flex' } }) },
    showBooks: async () => calls.push('home'), navigateToBook: async id => calls.push(id),
  });
  await c.initRouting();
  for (const state of [{ view: 'books', mobilePanel: 'books' }, { view: 'books', dialogOpen: true }, { view: 'books' }]) {
    await handlers.popstate({ state });
    assert.equal(c.bootState._suppressHistory, false);
  }
  assert.deepEqual(calls, ['home']);
  c.currentBookId = 1;
  await handlers.popstate({ state: { view: 'books' } });
  await handlers.popstate({ state: { view: 'book', bookId: 2 } });
  assert.deepEqual(calls, ['home', 'home', 2]);
});
