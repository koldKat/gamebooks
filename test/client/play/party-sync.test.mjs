import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = file => readFileSync(new URL(`../../../public/js/${file}`, import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/\bexport /g, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
const initial = () => ({ graph: { 1: { choices: [2, 3] } }, positions: {},
  playthroughs: [{ startedAt: 123, path: [1], completed: false }], activePtIndex: 0 });

// Two independent state singletons and stream subscriptions share the saved party state.
function setup() {
  let saved = initial();
  const clients = [];
  function client() {
    const streams = [], timers = new Map(), frames = [];
    let delay = null, fail = false, reads = 0, depth = 0, redraws = 0;
    const button = { classList: { add() {}, remove() {} }, innerHTML: '' };
    const storage = new Map([['gamebook_auth_token', String(clients.length + 1)]]);
    const context = vm.createContext({
      console, URL, Date,
      localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
      window: { dispatchEvent() {} }, CustomEvent: class {},
      document: { getElementById: id => id === 'party-btn' ? button : null },
      setTimeout: (fn, ms) => { const id = Symbol(); timers.set(id, { fn, ms }); return id; },
      clearTimeout: id => timers.delete(id),
      EventSource: class {
        constructor() { streams.push(this); }
        close() { this.closed = true; }
      },
      fetch: async (path, options = {}) => {
        if (path.endsWith('/party')) return { ok: true, json: async () => ({ party: { members: [] } }) };
        if (options.method === 'PUT') {
          saved = JSON.parse(options.body);
          for (const other of clients) if (other.context !== context) other.emit();
          return { ok: true };
        }
        reads++;
        const snapshot = structuredClone(saved), pending = delay;
        delay = null;
        if (pending) await pending;
        if (fail) throw Error('offline');
        return { ok: true, json: async () => snapshot };
      },
      render: () => frames.push(JSON.parse(vm.runInContext('JSON.stringify({ state, viewingPt })', context))),
      suppressAutoNav: enabled => { depth += enabled ? 1 : -1; },
      network: { redraw() { redraws++; } }, shortcutLabel: x => x, t: x => x,
      visNodes: { get: () => null }, graphRuntime: { _dragNodeIds: new Set() },
    });
    vm.runInContext(source('core/state.js') + source('core/event-stream.js') + source('play/party.js'), context);
    const c = { context, streams, frames, timers,
      run: code => vm.runInContext(code, context),
      emit: () => streams.at(-1)?.onmessage?.({ data: JSON.stringify({ type: 'state_updated', bookId: 1 }) }),
      async open() { await this.run('loadState(1)'); await this.run('connectPartySSE(1)'); streams.at(-1).onopen(); await tick(); },
      delayRead() { let resolve; delay = new Promise(r => { resolve = r; }); return resolve; },
      set fail(value) { fail = value; }, get reads() { return reads; }, get depth() { return depth; },
      get redraws() { return redraws; },
    };
    clients.push(c);
    return c;
  }
  return { client, set saved(value) { saved = value; } };
}

test('a move by either party client updates the other graph and run without navigating twice', async () => {
  const s = setup(), a = s.client(), b = s.client();
  await a.open(); await b.open();
  await a.run('state.playthroughs[0].path.push(2); state.graph[2] = { choices: [4, 5] }; saveState()');
  await tick();
  assert.deepEqual(b.frames.at(-1).state.playthroughs[0].path, [1, 2]);
  assert.deepEqual(b.frames.at(-1).state.graph[2].choices, [4, 5]);
  await b.run('state.playthroughs[0].path.push(4); saveState()');
  await tick();
  assert.deepEqual(a.frames.at(-1).state.playthroughs[0].path, [1, 2, 4]);
  assert.equal(a.redraws, a.frames.length); assert.equal(b.redraws, b.frames.length);
  assert.equal(a.depth, 0); assert.equal(b.depth, 0);
});

test('opening/reconnecting catches moves missed while the stream was disconnected', async () => {
  const s = setup(), a = s.client(), b = s.client();
  await a.open(); await b.open();
  b.streams.at(-1).onerror();
  await a.run('state.playthroughs[0].path.push(3); saveState()');
  const retry = [...b.timers.values()].find(t => t.ms === 1000);
  retry.fn(); b.streams.at(-1).onopen(); await tick();
  assert.deepEqual(b.frames.at(-1).state.playthroughs[0].path, [1, 3]);
});

test('completion keeps the finished shared path visible and rebinds viewed run objects', async () => {
  const s = setup(), a = s.client(), b = s.client();
  await a.open(); await b.open();
  await a.run('state.playthroughs[0].path.push(2); state.playthroughs[0].completed = true; state.activePtIndex = null; saveState()');
  await tick();
  assert.deepEqual(b.frames.at(-1).viewingPt.path, [1, 2]);
  await a.run('state.playthroughs[0].path.push(4); saveState()');
  await tick();
  assert.deepEqual(b.frames.at(-1).viewingPt.path, [1, 2, 4]);
  assert.equal(b.run('viewingPt === state.playthroughs[0]'), true);
});

test('bursts are serialized and a response arriving after navigation cannot change the new book', async () => {
  const s = setup(), b = s.client(); await b.open();
  const release = b.delayRead(), before = b.reads;
  b.emit(); b.emit(); b.emit();
  assert.equal(b.reads, before + 1);
  const newer = initial(); newer.playthroughs[0].path.push(3); s.saved = newer;
  release(); await tick();
  assert.equal(b.reads, before + 2);
  assert.deepEqual(b.frames.at(-1).state.playthroughs[0].path, [1, 3]);
  const releaseStale = b.delayRead(); b.emit();
  b.run('disconnectPartySSE(); setCurrentBookId(2); state.bookName = "Other book"');
  releaseStale(); await tick();
  assert.equal(b.run('currentBookId'), 2);
  assert.equal(b.run('state.bookName'), 'Other book');
  assert.equal(b.depth, 0);
});

test('failed refresh preserves the current canvas and later events recover', async () => {
  const s = setup(), b = s.client(); await b.open();
  const before = b.frames.length; b.fail = true; b.emit(); await tick();
  assert.equal(b.frames.length, before);
  assert.equal(b.run('state.playthroughs.length'), 1);
  b.fail = false; b.emit(); await tick();
  assert.equal(b.frames.length, before + 1);
  assert.equal(b.depth, 0);
});
