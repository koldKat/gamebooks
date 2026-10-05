import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/reading/access.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace('export async function', 'async function');
function setup({ locked = true, cost = 0, balance = 5 } = {}) {
  let token = 'player-one', connected = true, unlocked = 0, fail = false;
  const requests = [];
  const events = {};
  const element = tag => ({ tag, style: {}, disabled: false, listeners: {}, children: [],
    focus() {},
    append(...children) { this.children.push(...children); },
    setAttribute() {}, addEventListener(type, fn) { this.listeners[type] = fn; } });
  const mount = { classList: { add() {}, remove() {} }, children: [], scrollTop: 10, replaceChildren() { this.children = []; },
    append(...children) { this.children.push(...children); } };
  const context = vm.createContext({ document: { createElement: element, querySelectorAll: () => [mount], addEventListener() {} },
    window: { addEventListener: (type, fn) => { events[type] = fn; } },
    COIN_SVG: '<svg class="coin-icon"></svg>',
    renderReadingMatter: () => false,
    getToken: () => token, t: (key, params) => params ? `${key}:${params.cost}` : key,
    apiFetch: async (url, options) => {
      requests.push([url, options?.method || 'GET']);
      if (options?.method === 'POST') return { ok: !fail, json: async () => ({ error: fail === 'insufficient_coins' ? fail : 'failed' }) };
      return { ok: true, json: async () => ({ name: 'Trial book', locked, introText: '<script>alert(1)</script>', rulesText: 'Rules', cost, balance, canAfford: cost === 0 || balance >= cost }) };
    } });
  vm.runInContext(source, context);
  return { mount, requests, context,
    set balance(value) { balance = value; },
    emitBalance: value => events['coins-balance-changed']({ detail: { token, balance: value } }),
    show: () => context.showReadingGate(mount, 263, { isCurrent: () => connected, onUnlock: () => unlocked++ }),
    set token(value) { token = value; }, set connected(value) { connected = value; }, set fail(value) { fail = value; },
    confirm: () => mount.children[1].children[1].children[1].children[1].listeners.click(),
    cancel: () => mount.children[1].children[1].children[1].children[0].listeners.click(),
    get unlocked() { return unlocked; } };
}

test('paid unlock controls follow live balance and preflight catches spending elsewhere', async () => {
  const s = setup({ cost: 4, balance: 1 });
  await s.show();
  const button = s.mount.children[1].children[0];
  const accept = s.mount.children[1].children[1].children[1].children[1];
  assert.equal(button.disabled, true);
  assert.equal(accept.disabled, true);
  s.emitBalance(5);
  assert.equal(button.disabled, false);
  button.listeners.click();
  s.emitBalance(0);
  assert.equal(accept.disabled, true);
  await s.confirm();
  assert.equal(s.requests.length, 1);
  s.emitBalance(5);
  s.balance = 0;
  await s.confirm();
  assert.equal(s.requests.filter(([, method]) => method === 'POST').length, 0);
  assert.equal(accept.disabled, true);
  assert.equal(s.mount.children[1].children.at(-1).textContent, 'reading_access.insufficient');
});

test('server insufficient-coins rejection disables stale paid controls; free trial stays available', async () => {
  const paid = setup({ cost: 4 });
  await paid.show();
  paid.mount.children[1].children[0].listeners.click();
  paid.fail = 'insufficient_coins';
  await paid.confirm();
  assert.equal(paid.mount.children[1].children[0].disabled, true);
  assert.equal(paid.unlocked, 0);
  const free = setup({ balance: -1 });
  await free.show();
  free.emitBalance(-5);
  assert.equal(free.mount.children[1].children[0].disabled, false);
});

test('frontmatter renders safely; zero-cost unlock is single-flight', async () => {
  const s = setup();
  assert.equal(await s.show(), true);
  assert.equal(s.mount.children[0].children[1].textContent, '<script>alert(1)</script>');
  assert.equal(s.mount.children[0].children[1].innerHTML, undefined, 'imported prose is never injected as HTML');
  const button = s.mount.children[1].children[0];
  assert.equal(button.children[0].textContent, 'reading_access.unlock:0');
  assert.match(button.children[1].innerHTML, /coin-icon/);
  assert.equal(s.mount.children[0].children[1].className, 'reading-frontmatter');
  button.listeners.click();
  const first = s.confirm();
  await s.confirm();
  assert.equal(button.disabled, true);
  await first;
  assert.equal(s.unlocked, 1);
  assert.equal(s.requests.filter(([, method]) => method === 'POST').length, 1);
});

test('failed unlock offers retry and account changes prevent another-account purchases', async () => {
  const s = setup();
  await s.show();
  const button = s.mount.children[1].children[0];
  s.fail = true;
  button.listeners.click();
  await s.confirm();
  assert.equal(button.disabled, false);
  assert.equal(s.mount.children[1].children.at(-1).textContent, 'auth.network_error');
  s.fail = false;
  s.token = 'player-two';
  await button.listeners.click();
  assert.equal(s.requests.length, 2, 'old dialog cannot purchase as the new player');
  assert.equal(s.unlocked, 0);
});

test('inline confirmation can cancel; stale confirmations cannot purchase', async () => {
  const s = setup();
  await s.show();
  const button = s.mount.children[1].children[0];
  button.listeners.click();
  assert.equal(s.requests.length, 1, 'opening confirmation sends no purchase');
  assert.equal(button.disabled, false);
  assert.equal(button.hidden, true);
  s.cancel();
  assert.equal(button.hidden, false);
  assert.equal(s.requests.length, 1, 'cancel sends no purchase');
  button.listeners.click();
  s.token = 'another-player';
  await s.confirm();
  assert.equal(s.requests.length, 1);
  assert.equal(s.unlocked, 0);
  s.token = 'player-one';
  button.listeners.click();
  await s.confirm();
  assert.equal(s.unlocked, 1);
});

test('unlocked books leave existing reader markup alone; stale access results do nothing', async () => {
  const s = setup({ locked: false });
  s.mount.children.push('existing reader');
  assert.equal(await s.show(), false);
  assert.deepEqual(s.mount.children, ['existing reader']);
  const stale = setup();
  const pending = stale.show();
  stale.connected = false;
  assert.equal(await pending, true);
  assert.equal(stale.mount.children.length, 0);
});

const desktop = readFileSync(new URL('../../../public/js/reading/liveread.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');

test('desktop wheel handler scrolls frontmatter pane and retains ordinary reader scrolling', () => {
  const handler = desktop.match(/body\.addEventListener\('wheel', e => \{([\s\S]*?)\}, \{ passive: false \}\)/)[1];
  const prose = { scrollTop: 0 };
  let target = prose, prevented = 0;
  const body = { scrollTop: 0, querySelector: () => target };
  const context = vm.createContext({ body, _renderedLineHeight: () => 24,
    e: { deltaY: 100, preventDefault: () => prevented++ } });
  vm.runInContext(`{ ${handler} }`, context);
  assert.equal(prose.scrollTop, 24);
  assert.equal(body.scrollTop, 0);
  target = null;
  vm.runInContext(`{ ${handler} }`, context);
  assert.equal(body.scrollTop, 24);
  assert.equal(prevented, 2);
});
function desktopSetup({ hasRun = true } = {}) {
  let gateOptions, resolveGate;
  let section = 25;
  const active = new Set();
  const panel = { classList: { add: x => active.add(x), remove: x => active.delete(x), contains: x => active.has(x) } };
  const body = { innerHTML: '', textContent: '' };
  const events = [], starts = [];
  const context = vm.createContext({
    document: { getElementById: id => id === 'liveread-panel' ? panel : body },
    t: key => key, currentBookId: 263, state: { startSection: 1 },
    getToken: () => 'account',
    currentPlaythrough: () => hasRun ? ({}) : null, currentSection: () => hasRun ? section : null,
    suppressAutoNav: value => events.push(value), setLightweightRestabilize() {},
    startPlaythrough: sec => { starts.push(sec); section = sec ?? 1; hasRun = true; }, showAlert: () => { throw new Error('Unexpected warning'); },
    showReadingGate: async (mount, id, options) => {
      gateOptions = options;
      return await new Promise(resolve => { resolveGate = resolve; });
    },
  });
  vm.runInContext(desktop, context);
  vm.runInContext('_showSection = sec => { globalThis.lastSection = sec; }', context);
  return { context, body, events, starts, get gateOptions() { return gateOptions; },
    resolve: value => resolveGate(value) };
}

test('desktop render cannot overwrite locked frontmatter; unlock starts at 1 without deleting a run', async () => {
  const s = desktopSetup();
  const opened = s.context._open();
  s.context.renderLiveRead();
  assert.equal(s.context.lastSection, undefined, 'pending access blocks section render');
  s.resolve(true);
  await opened;
  s.context.renderLiveRead();
  assert.equal(s.context.lastSection, undefined, 'locked access blocks section render');
  await s.gateOptions.onUnlock();
  assert.deepEqual(s.starts, [1]);
  assert.equal(s.context.lastSection, 1, 'normal reader starts at section one');
});

test('Read automatically starts a run when none is active and resumes an existing run', async () => {
  for (const bookId of [263, 202, 193]) {
  for (const hasRun of [false, true]) {
    const s = desktopSetup({ hasRun });
    s.context.currentBookId = bookId;
    const opened = s.context._open();
    s.resolve(false);
    await opened;
    assert.deepEqual(s.starts, hasRun ? [] : [null]);
    assert.equal(s.context.lastSection, hasRun ? 25 : 1);
  }
  }
});

test('desktop close cancels late access results and releases suppression', async () => {
  const s = desktopSetup();
  const opened = s.context._open();
  s.context._close();
  assert.equal(s.gateOptions.isCurrent(), false);
  s.resolve(false);
  await opened;
  assert.equal(s.context.lastSection, undefined);
  assert.deepEqual(s.events, [true, false]);
});

test('switching books closes an old unlock preview rather than retaining its lock', async () => {
  const s = desktopSetup();
  const opened = s.context._open();
  s.resolve(true);
  await opened;
  s.context.currentBookId = 202;
  s.context.renderLiveRead();
  assert.equal(s.gateOptions.isCurrent(), false);
  assert.equal(s.context.lastSection, undefined);
  assert.deepEqual(s.events, [true, false]);
});

const mobile = readFileSync(new URL('../../../public/mobile/js/reader.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;$/gm, '').replace(/^export /gm, '');
test('mobile locked preview initializes no graph or run; unlock preserves old runs and starts at 1', async () => {
  let options, loaded = 0, saved = 0, resumed;
  const body = { isConnected: true };
  const mount = { isConnected: true, querySelector: selector => selector === '#m-access-body' ? body : { addEventListener() {} } };
  const state = { playthroughs: [{ path: [1,25], completed: false }], activePtIndex: 0 };
  const context = vm.createContext({ state, t: key => key,
    getToken: () => 'account',
    showReadingGate: async (el, id, hooks) => { options = hooks; return true; },
    currentPlaythrough: () => state.playthroughs[state.activePtIndex],
    currentSection: () => state.playthroughs[state.activePtIndex]?.path.at(-1),
    loadState: async () => loaded++, saveState: async () => saved++,
    resumed: options => { resumed = options; },
  });
  vm.runInContext(mobile, context);
  await context.renderReader(mount, { id: 263 }, () => {});
  assert.equal(loaded, 0, 'locked preview cannot create or alter runs');
  assert.equal(saved, 0);
  vm.runInContext('renderReader = async (mount, book, back, options) => resumed(options)', context);
  await options.onUnlock();
  assert.equal(resumed.startAtOne, true);
  assert.equal(loaded, 0, 'handoff loads state only once in the normal reader');
  assert.equal(saved, 0);
  const finish = mobile.slice(mobile.indexOf('  await loadState(book.id, { strict:'), mobile.indexOf('\n}\n\n// Match desktop'));
  context.book = { id: 263 };
  context.isCurrent = () => true;
  context.startAtOne = true;
  context._updateRunControls = () => {};
  context._showSection = async () => {};
  vm.runInContext(`async function finishReading() { ${finish} }`, context);
  await context.finishReading();
  assert.equal(loaded, 1);
  assert.equal(saved, 1);
  assert.deepEqual(state.playthroughs[0].path, [1,25]);
  assert.equal(state.playthroughs[1].path[0], 1);
  assert.equal(state.activePtIndex, 1);
});

test('failed mobile unlock handoff offers visible retry without another purchase', async () => {
  let hooks;
  const nodes = new Map();
  const mount = { isConnected: true, querySelector: id => {
    if (!nodes.has(id)) nodes.set(id, { addEventListener(type, fn) { this.click = fn; } });
    return nodes.get(id);
  } };
  const context = vm.createContext({ getToken: () => 'account', t: key => key, console: { warn() {} },
    showReadingGate: async (body, bookId, options) => { hooks = options; return true; },
  });
  vm.runInContext(mobile, context);
  await context.renderReader(mount, { id: 263 }, () => {});
  vm.runInContext('renderReader = async () => { throw new Error("offline"); }', context);
  await hooks.onUnlock();
  assert.equal(nodes.get('#m-access-error').textContent, 'auth.network_error');
  assert.equal(typeof nodes.get('#m-access-retry').click, 'function');
  await nodes.get('#m-access-retry').click();
  assert.equal(nodes.get('#m-access-error').textContent, 'auth.network_error');
});
