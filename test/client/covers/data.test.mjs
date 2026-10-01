import { test } from 'node:test';
import assert from 'node:assert/strict';

test('catalog refresh preserves pause, queued-request, auth, and fingerprint behavior', async () => {
  const saved = Object.fromEntries(['window', 'localStorage', 'document', 'fetch', 'setInterval', 'clearInterval'].map(key => [key, globalThis[key]]));
  let token = 'token';
  globalThis.localStorage = { getItem: key => key === 'gamebook_auth_token' ? token : null };
  globalThis.window = { innerWidth: 1280, matchMedia: () => ({ matches: false }) };
  const classes = new Set();
  const panel = { style: {}, classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) }, removeEventListener() {} };
  const wrapper = { style: { display: 'none' } }, grid = { innerHTML: '' };
  const elements = { 'covers-panel': panel, 'covers-grid': grid, 'landing-wrapper': wrapper, 'main-screen': { style: { display: 'none' } }, 'books-screen': { style: {} }, 'covers-toggle': panel };
  globalThis.document = { getElementById: id => elements[id] || null, documentElement: { style: { setProperty() {} } } };
  globalThis.setInterval = () => 1;
  globalThis.clearInterval = () => {};
  const calls = [];
  globalThis.fetch = (url, options) => new Promise(resolve => calls.push({ url, options, resolve }));
  try {
    const { loadCovers, pauseCoversAutoRefresh, resumeCoversAutoRefresh, _coversFingerprint } = await import('../../../public/js/covers/data.js');
    const rows = [{ id: 1, name: 'Alpha', coverUrl: '/a.jpg', libraryCount: 1 }, { id: 2, name: 'Beta' }];
    const fingerprint = _coversFingerprint(rows, rows, []);
    assert.equal(fingerprint, _coversFingerprint([...rows].reverse(), rows.map(r => ({ ...r, libraryCount: 100 })), []));
    assert.notEqual(fingerprint, _coversFingerprint(rows.map(r => ({ ...r, coverUrl: '/new.jpg' })), rows, []));
    for (const changes of [{ authors: 'New author' }, { childNames: ['New child'] }, { hasBattleSim: true }, { hasLiveReading: true }, { totalSections: 50 }, { seriesName: 'New series' }]) {
      assert.notEqual(fingerprint, _coversFingerprint(rows, [{ ...rows[0], ...changes }, rows[1]], []));
    }
    assert.notEqual(_coversFingerprint([], [], [{ id: 1, name: 'Series' }]), _coversFingerprint([], [], [{ id: 1, name: 'Series', is_open_world: true }]));
    pauseCoversAutoRefresh();
    await loadCovers();
    assert.equal(calls.length, 0);
    resumeCoversAutoRefresh();
    const first = loadCovers();
    assert.equal(calls.length, 3);
    assert.equal(calls.find(c => c.url === '/api/public/books').options.headers.Authorization, 'Bearer token');
    assert.ok(calls.every(c => c.options.cache === 'no-store'));
    await loadCovers({ force: false });
    await loadCovers({ force: true });
    assert.equal(calls.length, 3, 'concurrent triggers do not start parallel catalog fetches');
    for (const call of calls.slice(0, 3)) call.resolve(new Response('[]'));
    await first;
    assert.equal(calls.length, 6, 'all concurrent triggers drain as one follow-up refresh');
    for (const call of calls.slice(3)) call.resolve(new Response('[]'));
    await new Promise(resolve => setImmediate(resolve));
    const { coversState } = await import('../../../public/js/covers/state.js');
    coversState._coversKindMode = 'favorites';
    const refresh = async (books, covers = [], status = 200) => {
      const start = calls.length;
      const pending = loadCovers();
      for (const call of calls.slice(start)) {
        const payload = call.url.endsWith('/books') ? books : call.url.endsWith('/covers') ? covers : [];
        call.resolve(new Response(JSON.stringify(payload), { status }));
      }
      await pending;
    };
    wrapper.style.display = '';
    await refresh([{ id: 1, name: 'Alpha', authors: 'Original' }]);
    assert.equal(coversState._allBooks[0].authors, 'Original');
    wrapper.style.display = 'none';
    await refresh([{ id: 1, name: 'Alpha', authors: 'Changed while hidden' }]);
    assert.equal(coversState._allBooks[0].authors, 'Original');
    wrapper.style.display = '';
    await refresh([{ id: 1, name: 'Alpha', authors: 'Changed while hidden' }]);
    assert.equal(coversState._allBooks[0].authors, 'Changed while hidden', 'hidden fetch does not mark unapplied data current');
    await refresh([{ id: 1, name: 'Alpha', authors: 'Changed while hidden', hasLiveReading: true }]);
    assert.equal(coversState._allBooks[0].hasLiveReading, true);
    await refresh([{ id: 1, name: 'Alpha' }], [{ id: 1, name: 'Alpha', coverUrl: '/a.jpg' }]);
    await refresh([], [], 502);
    assert.equal(coversState._allBooks.length, 1, 'failed refresh preserves successful catalog');
    assert.ok(classes.has('active'));
    grid.innerHTML = 'stale thumbnails';
    await refresh([]);
    assert.deepEqual(coversState._allCovers, [], 'empty catalog removes the old rotation pool');
    assert.equal(grid.innerHTML, '');
    const pausedStart = calls.length;
    const pausedRequest = loadCovers();
    pauseCoversAutoRefresh();
    for (const call of calls.slice(pausedStart)) call.resolve(new Response(JSON.stringify(call.url.endsWith('/books') ? [{ id: 2, name: 'Transient upload state' }] : [])));
    await pausedRequest;
    assert.deepEqual(coversState._allBooks, [], 'pausing also prevents an already-running request from rendering');
    resumeCoversAutoRefresh();
    const switchStart = calls.length;
    const oldAccountRequest = loadCovers();
    token = 'new-token';
    for (const call of calls.slice(switchStart)) call.resolve(new Response(JSON.stringify(call.url.endsWith('/books') ? [{ id: 3, name: 'Old account response', pdfPath: '/old.pdf' }] : [])));
    await oldAccountRequest;
    assert.deepEqual(coversState._allBooks, [], 'previous-account response is discarded');
    const freshCalls = calls.slice(switchStart + 3);
    assert.equal(freshCalls.length, 3, 'account change schedules one fresh catalog fetch');
    assert.equal(freshCalls.find(call => call.url.endsWith('/books')).options.headers.Authorization, 'Bearer new-token');
    for (const call of freshCalls) call.resolve(new Response(JSON.stringify(call.url.endsWith('/books') ? [{ id: 3, name: 'Current account response' }] : [])));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(coversState._allBooks[0].name, 'Current account response');
    assert.equal(coversState._allBooks[0].pdfPath, undefined);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
