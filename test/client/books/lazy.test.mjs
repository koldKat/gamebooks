import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lazyState, _materializeLazyGroup, _maybeReclaimLazyGroup } from '../../../public/js/books/lazy.js';

test('lazy chunks finish for search and cannot repopulate reclaimed or detached groups', () => {
  const saved = Object.fromEntries(['document', 'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]));
  const frames = [];
  globalThis.document = { getElementById: () => null };
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = fn => { frames.push(fn); return frames.length; };
  globalThis.cancelAnimationFrame = () => {};
  const flush = () => { while (frames.length) frames.shift()(); };
  const group = () => ({
    dataset: { lazyGroup: 'test' }, children: [], isConnected: true,
    set innerHTML(html) { this.children = html.match(/<card>/g) || []; },
    insertAdjacentHTML(_, html) { this.children.push(...(html.match(/<card>/g) || [])); },
    querySelectorAll(selector) { return selector.includes('.book-item') ? this.children : []; },
    replaceChildren() { this.children = []; },
  });
  const previousWire = lazyState.wireContent;
  let wired = 0;
  lazyState.wireContent = () => { wired++; };
  lazyState.builders.set('test', () => Array(251).fill('<card>'));
  try {
    const immediate = group();
    _materializeLazyGroup(immediate, { immediate: true });
    assert.equal(immediate.children.length, 251);
    assert.equal(immediate.dataset.lazyGroup, undefined);
    flush();

    wired = 0;
    const pending = group();
    _materializeLazyGroup(pending);
    assert.equal(pending.children.length, 0);
    frames.shift()();
    assert.equal(pending.children.length, 100);
    _materializeLazyGroup(pending, { immediate: true });
    assert.equal(pending.children.length, 251);
    assert.equal(pending.dataset.materializingGroup, undefined);
    assert.equal(wired, 251);
    flush();
    assert.equal(pending.children.length, 251, 'queued callbacks cannot duplicate completed chunks');

    const reclaimed = group();
    _materializeLazyGroup(reclaimed);
    frames.shift()();
    _maybeReclaimLazyGroup(reclaimed);
    assert.equal(reclaimed.dataset.lazyGroup, 'test');
    assert.equal(reclaimed.children.length, 0);
    _materializeLazyGroup(reclaimed);
    flush();
    assert.equal(reclaimed.children.length, 251, 'old callback cannot append into the new expansion');

    const detached = group();
    _materializeLazyGroup(detached);
    detached.isConnected = false;
    flush();
    assert.equal(detached.children.length, 0);
    assert.equal(detached.dataset.materializingGroup, undefined);
  } finally {
    lazyState.builders.delete('test');
    lazyState.wireContent = previousWire;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
