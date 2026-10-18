import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../../public/js/core/event-stream.js', import.meta.url), 'utf8');

function harness() {
  let now = 0, timerId = 0, throwConstructor = false;
  const streams = [], timers = new Map();
  class EventSource {
    constructor(url) {
      if (throwConstructor) throw Error('temporarily unavailable');
      this.url = url;
      this.readyState = 0;
      streams.push(this);
    }
    close() { this.readyState = 2; this.closed = true; }
  }
  const connect = runInNewContext(source.replace('export function ', 'function ') + '\nconnectEventStream;', {
    EventSource, Date: { now: () => now },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  return {
    connect, streams, timers,
    latest: () => streams.at(-1),
    open() { const stream = streams.at(-1); stream.readyState = 1; stream.onopen(); },
    fail() { streams.at(-1).onerror(); },
    tick() { const [id, task] = timers.entries().next().value; timers.delete(id); now += task.delay; task.fn(); return task.delay; },
    advance: ms => { now += ms; },
    throwConstructor: value => { throwConstructor = value; },
  };
}

test('terminal SSE errors recover and catch up exactly once without leaking connections', () => {
  const h = harness(), messages = [], reconnects = [];
  h.connect('/stream', { onMessage: e => messages.push(e.data), onReconnect: () => reconnects.push(true) });
  h.open();
  assert.equal(h.timers.size, 0, 'healthy connections add no polling timers');
  assert.equal(reconnects.length, 0, 'initial connection is not a replay');
  const old = h.latest(), staleMessage = old.onmessage;
  old.readyState = 2;
  h.fail();
  assert.ok(old.closed);
  assert.equal(h.timers.size, 1);
  assert.equal(h.tick(), 1000);
  h.open();
  staleMessage({ data: 'old' });
  h.latest().onmessage({ data: 'new' });
  assert.deepEqual(messages, ['new']);
  assert.equal(reconnects.length, 1);
  assert.equal(h.timers.size, 0);
  assert.equal(h.streams.filter(s => !s.closed).length, 1);
});

test('SSE retries are exponentially backed off, capped and cancelled on close', () => {
  const h = harness(), stream = h.connect('/stream');
  const delays = [];
  for (let i = 0; i < 8; i++) { h.fail(); delays.push(h.tick()); }
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  h.fail(); stream.close();
  assert.equal(h.timers.size, 0);
  assert.ok(h.streams.every(s => s.closed));
  stream.resume(true);
  assert.ok(h.streams.every(s => s.closed), 'disposed streams cannot reopen');
});

test('constructor failures and stalled connects recover without a manual reload', () => {
  const h = harness(); h.throwConstructor(true);
  const stream = h.connect('/stream');
  assert.equal(h.streams.length, 0);
  assert.equal(h.timers.size, 1);
  h.throwConstructor(false); h.tick();
  const old = h.latest();
  h.advance(30000); stream.resume();
  assert.ok(old.closed);
  h.open();
  assert.equal(h.timers.size, 0);
  const healthy = h.latest(); stream.resume();
  assert.equal(h.latest(), healthy);
});

test('retries use fresh credentials and respect disabled owners', () => {
  const h = harness(); let enabled = true, token = 'old';
  const stream = h.connect(() => '/stream?token=' + token, { enabled: () => enabled });
  h.open(); h.fail(); token = 'new'; h.tick();
  assert.equal(h.latest().url, '/stream?token=new');
  h.fail(); enabled = false; h.tick();
  assert.equal(h.timers.size, 0);
  assert.ok(h.streams.every(s => s.closed));
  stream.resume(true);
  assert.ok(h.streams.every(s => s.closed));
});

test('a connection that never opens times out and retries automatically', () => {
  const h = harness(), reconnects = [];
  const stream = h.connect('/stream', { onReconnect: () => reconnects.push(true) });
  const old = h.latest();
  assert.equal(h.tick(), 30000);
  assert.ok(old.closed);
  assert.equal(h.tick(), 1000);
  h.open();
  assert.equal(reconnects.length, 1);
  assert.equal(h.timers.size, 0);
  stream.close();
});
