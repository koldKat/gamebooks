import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function setup(authenticated) {
  const storage = new Map(), saved = [];
  const booksState = { _cachedStashes: [], _seriesExpandedPrefs: {}, _bookExpandedPrefs: {},
    _stashExpandedPrefs: {}, _hooks: { savePrefs: patch => saved.push(patch) } };
  const context = { booksState, getToken: () => authenticated ? 'token' : null,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  const source = readFileSync(new URL('../../../public/js/books/prefs.js', import.meta.url), 'utf8');
  runInNewContext(source.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
  const move = stashes => { context._syncMovedSeriesPrefs(stashes); booksState._cachedStashes = stashes; };
  const get = place => context._getExpandedPref('series', `${place}:1`, `${place === 'main' ? '' : `stash_${place}_`}sr_expanded_1`);
  return { context, storage, saved, booksState, move, get };
}
for (const authenticated of [false, true]) for (const expanded of [false, true]) {
  test(`series state follows moves into, between and out of stashes, auth=${authenticated}, expanded=${expanded}`, () => {
    const h = setup(authenticated);
    h.context._saveExpandedPref('series', 'main:1', 'sr_expanded_1', expanded);
    h.move([{ id: 7, seriesIds: [1] }]);
    assert.equal(h.get('7'), expanded);
    // The source state takes precedence over an old preference at the destination.
    h.context._saveExpandedPref('series', '8:1', 'stash_8_sr_expanded_1', !expanded);
    h.move([{ id: 8, seriesIds: [1] }]);
    assert.equal(h.get('8'), expanded);
    h.context._saveExpandedPref('series', '8:1', 'stash_8_sr_expanded_1', !expanded);
    const count = h.saved.length;
    h.move([{ id: 8, seriesIds: [1] }]);
    assert.equal(h.get('8'), !expanded);
    assert.equal(h.saved.length, count, 'unchanged memberships cause no preference writes');
    h.move([]);
    assert.equal(h.get('main'), !expanded);
    if (authenticated) assert.equal(h.booksState._seriesExpandedPrefs['main:1'], expanded ? '0' : '1');
    else assert.equal(h.saved.length, 0);
  });
}
test('loading a library preserves saved stash preferences rather than treating it as a move', () => {
  const h = setup(true);
  h.booksState._cachedStashes = null;
  h.context.setExpandedPrefs({}, { 'main:1': '0', '7:1': '1' }, {});
  h.move([{ id: 7, seriesIds: [1] }]);
  assert.equal(h.get('7'), true);
  assert.equal(h.saved.length, 0);
});
test('a toggle sends only its changed key rather than overwriting another device’s map', () => {
  const h = setup(true);
  h.context.setExpandedPrefs({ 1: '0', 2: '1' }, { 'main:1': '0', 'main:2': '1' }, { 1: '0', 2: '1' });
  h.context._saveExpandedPref('book', '1', 'bk_expanded_1', true);
  h.context._saveExpandedPref('series', 'main:1', 'sr_expanded_1', true);
  h.context._saveExpandedPref('stash', '1', 'stash_expanded_1', true);
  assert.deepEqual(JSON.parse(JSON.stringify(h.saved)), [
    { bookExpanded: { 1: '1' } }, { seriesExpanded: { 'main:1': '1' } }, { stashExpanded: { 1: '1' } },
  ]);
  assert.equal(h.booksState._bookExpandedPrefs['2'], '1');
});
test('an existing copy in another stash keeps its own state', () => {
  const h = setup(true);
  h.booksState._cachedStashes = [{ id: 7, seriesIds: [1] }, { id: 8, seriesIds: [1] }];
  h.context.setExpandedPrefs({}, { '7:1': '0', '8:1': '1' }, {});
  h.move([{ id: 7, seriesIds: [1] }, { id: 8, seriesIds: [1] }, { id: 9, seriesIds: [1] }]);
  assert.equal(h.get('7'), false); assert.equal(h.get('8'), true); assert.equal(h.get('9'), false);
});
