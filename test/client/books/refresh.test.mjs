import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function setup() {
  let books = [{ id: 42, series_id: 1, series_name: 'Old series' }];
  let release;
  const requests = [], renders = [], errors = [];
  const booksState = { _hooks: {}, _activeSeriesRuns: [], _invalidateAutocompleteCaches() {},
    renderBooksList: rows => { booksState._cachedBooks = rows; renders.push(rows); } };
  const context = {
    booksState, getToken: () => 'token', _captureExpandedPrefsFromDom() {},
    naturalCompareByName: (a, b) => a.name.localeCompare(b.name),
    console: { error: (...args) => errors.push(args) },
    apiFetch: async url => {
      requests.push(url);
      const snapshot = structuredClone(books);
      if (url.startsWith('/api/books?')) {
        if (release === undefined) await new Promise(resolve => { release = resolve; });
        return { ok: true, json: async () => snapshot };
      }
      return { ok: true, json: async () => [] };
    },
  };
  const source = readFileSync(new URL('../../../public/js/books/data.js', import.meta.url), 'utf8');
  runInNewContext(source.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
  return { context, booksState, requests, renders, errors, release: () => release(),
    move: seriesId => { books = [{ ...books[0], series_id: seriesId, series_name: seriesId ? 'New series' : null }]; } };
}

for (const seriesId of [2, null]) {
  test(`a save refresh waits for stale polling and fetches the saved series ${seriesId}`, async () => {
    const app = setup();
    const oldPoll = app.context._refreshBooksListOnly();
    app.move(seriesId);
    const save = app.context._refreshLibraryUi();
    app.release();
    await Promise.all([oldPoll, save]);
    assert.equal(app.requests.filter(url => url.startsWith('/api/books?')).length, 2);
    assert.equal(app.renders.at(-1)[0].series_id, seriesId);
    assert.equal(app.booksState._cachedBooks[0].series_id, seriesId);
    assert.equal(app.booksState._booksDataFresh, true);
    assert.deepEqual(app.errors, []);
  });
}

test('ordinary overlapping polls share one request and unchanged results preserve the DOM', async () => {
  const app = setup();
  const first = app.context._refreshBooksListOnly();
  const second = app.context._refreshBooksListOnly();
  app.release();
  await Promise.all([first, second]);
  assert.equal(app.requests.length, 4);
  await app.context._refreshBooksListOnly();
  assert.equal(app.requests.length, 8);
  assert.equal(app.renders.length, 1);
  assert.deepEqual(app.errors, []);
});

test('saved metadata updates the cache without a fetch and cannot be undone by an older poll', async () => {
  const app = setup();
  const untouched = { id: 99, name: 'Unchanged' };
  app.booksState._cachedBooks = [{ id: 42, visited: 23, userRating: 4, series_id: 1,
    extra_anthology_ids: [8, 9], extra_anthology_orders: { 8: 2, 9: 3 } }, untouched];
  app.booksState._cachedAllSeries = [];
  const pending = app.context._refreshBooksListOnly();
  await app.context._applySavedBookResponse({ json: async () => ({
    book: { id: 42, name: 'Saved title', series_id: 2, series_name: 'New series', parent_book_id: 8 },
    series: { id: 2, name: 'New series', is_owner: true },
  }) });
  app.release();
  await pending;
  assert.equal(app.requests.length, 4, 'only the already-running poll made requests');
  assert.equal(app.renders.length, 1, 'the stale poll never renders over the save');
  const saved = app.booksState._cachedBooks[0];
  assert.equal(saved.series_id, 2);
  assert.equal(saved.visited, 23);
  assert.equal(saved.userRating, 4);
  assert.deepEqual([...saved.extra_anthology_ids], [9]);
  assert.deepEqual(Object.keys(saved.extra_anthology_orders), ['9']);
  assert.equal(app.booksState._cachedBooks[1], untouched);
  assert.deepEqual(app.errors, []);
});
