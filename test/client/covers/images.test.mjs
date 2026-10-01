import { test } from 'node:test';
import assert from 'node:assert/strict';

test('image cache evicts beyond 24 entries and shares in-flight fetches', async () => {
  const saved = Object.fromEntries(['window', 'localStorage', 'fetch', 'setTimeout', 'document', 'IntersectionObserver'].map(key => [key, globalThis[key]]));
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  const revoked = [];
  let serial = 0, fetches = 0, resolveFetch;
  globalThis.localStorage = { getItem: () => null };
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  globalThis.setTimeout = () => 0;
  let observerCallback;
  globalThis.document = { getElementById: () => ({}) };
  globalThis.IntersectionObserver = class {
    constructor(callback) { observerCallback = callback; }
  };
  URL.createObjectURL = () => `blob:test-${serial++}`;
  URL.revokeObjectURL = url => revoked.push(url);
  globalThis.fetch = () => { fetches++; return new Promise(resolve => { resolveFetch = resolve; }); };
  try {
    const { _cacheCoverBlobUrl, _loadCoverWithProgress, _preloadCoverBlob, _enqueueCoverLoad, _ensureThumbVisibilityObserver } = await import('../../../public/js/covers/images.js');
    for (let i = 0; i < 25; i++) _cacheCoverBlobUrl(`/cover-${i}`, `blob:cached-${i}`);
    assert.deepEqual(revoked, ['blob:cached-0']);
    const cached = { style: {} }, cachedBar = { style: {} };
    await _loadCoverWithProgress('/cover-24', cached, cachedBar);
    assert.equal(cached.src, 'blob:cached-24');
    assert.equal(fetches, 0);
    const first = { style: {} }, second = { style: {} };
    const a = _loadCoverWithProgress('/shared', first, { style: {} });
    const b = _loadCoverWithProgress('/shared', second, { style: {} });
    assert.equal(fetches, 1);
    resolveFetch(new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Length': '3' } }));
    await Promise.all([a, b]);
    assert.equal(first.src, second.src);
    assert.equal(first.src, 'blob:test-0');
    assert.deepEqual(revoked, ['blob:cached-0', 'blob:cached-1']);
    const third = { style: {} };
    await _loadCoverWithProgress('/shared', third, { style: {} });
    assert.equal(third.src, first.src);
    assert.equal(fetches, 1);
    _preloadCoverBlob('/failed-prefetch');
    const fallback = { style: { opacity: '0' } };
    const pendingFallback = _loadCoverWithProgress('/failed-prefetch', fallback, { style: {} });
    resolveFetch(new Response('unavailable', { status: 503 }));
    await pendingFallback;
    assert.equal(fallback.src, '/failed-prefetch', 'failed prefetch falls back to the original URL, not undefined');
    fallback.onload();
    assert.equal(fallback.style.opacity, '1');
    const retry = { style: { opacity: '0' } };
    const pendingRetry = _loadCoverWithProgress('/failed-prefetch', retry, { style: {} });
    assert.equal(fetches, 3, 'error response was not cached as an image');
    resolveFetch(new Response('unavailable', { status: 503 }));
    await pendingRetry;
    assert.equal(retry.src, '/failed-prefetch');
    retry.onload();
    assert.equal(retry.style.opacity, '1');
    const { coversState } = await import('../../../public/js/covers/state.js');
    const discarded = { style: {} };
    _enqueueCoverLoad('/discarded-grid', discarded, { style: {} });
    coversState._coversPanelGen++;
    coversState._coversPanelQueue = [];
    coversState._coversPanelRunning = false;
    resolveFetch(new Response(new Uint8Array([4, 5, 6])));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(discarded.src, undefined, 'grid replacement invalidates an unfinished image load');
    const offscreen = { style: {}, removeAttribute() { delete this.src; } };
    const offscreenBar = { style: {} };
    const thumb = { dataset: { coverUrl: '/offscreen' }, querySelector: selector => selector === 'img' ? offscreen : offscreenBar };
    _ensureThumbVisibilityObserver();
    _enqueueCoverLoad('/offscreen', offscreen, offscreenBar);
    observerCallback([{ target: thumb, isIntersecting: false }]);
    resolveFetch(new Response(new Uint8Array([7, 8, 9])));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(offscreen.src, undefined, 'completion cannot refill a tile unloaded by the observer');
    const beforeReveal = fetches;
    observerCallback([{ target: thumb, isIntersecting: true }]);
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(offscreen.src.startsWith('blob:test-'));
    assert.equal(fetches, beforeReveal, 'revealing the tile reuses the completed blob cache');
  } finally {
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
