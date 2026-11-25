import { test } from 'node:test';
import assert from 'node:assert/strict';

test('shared catalog filters and background preferences retain their behavior', async () => {
  const saved = Object.fromEntries(['window', 'localStorage', 'document', 'fetch'].map(key => [key, globalThis[key]]));
  const storage = new Map([['gamebook_auth_token', 'test']]);
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  };
  globalThis.window = { innerWidth: 1280, matchMedia: () => ({ matches: false }) };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ bookIds: [], seriesIds: [], coverUrls: [] }) });
  try {
    const { loadNsfwCatalog } = await import('../../../public/js/content/nsfw.js');
    await loadNsfwCatalog();
    const { coversState } = await import('../../../public/js/covers/state.js');
    const { _visibleCoverItems, _sortCoverItems, _sortedAllBooks, _setCoverFavoritesFromPrefs } = await import('../../../public/js/covers/filters.js');
    const { _landingCoverPool, _effectiveLandingCoverSource, _persistLandingCoverPos } = await import('../../../public/js/covers/background.js');
    const prefs = [];
    coversState._hooks = {
      getCachedBooks: () => [
        { id: 1, name: 'Owned', cover_path: 'owned.jpg' },
        { id: 2, name: 'Duplicate cover', cover_path: 'owned.jpg' },
        { id: 3, name: 'No cover' },
        { id: 8, name: 'Книга', cover_path: 'cyrillic.jpg' },
      ],
      savePrefs: p => prefs.push(p),
    };
    coversState._allBooks = [
      { id: 1, name: 'Book 10', coverUrl: '/covers/1.jpg', hasLiveReading: true, totalSections: 20 },
      { id: 4, name: 'Book 2', coverUrl: '/covers/4.jpg', hasLiveReading: false, totalSections: 40 },
      { id: 5, name: 'Мега', coverUrl: '/covers/5.jpg', isContainer: true, hasLiveReading: true },
      { id: 6, name: 'Coverless book', hasLiveReading: true, totalSections: 100 },
      { id: 7, name: 'Coverless anthology', coverUrl: '  ', isContainer: true },
    ];
    coversState._allSeriesCovers = [{ id: 'series_10', entityId: 10, name: 'Series', isSeries: true, bookIds: [1, 4] }];
    coversState._coversSortMode = 'alpha';
    assert.deepEqual(_sortedAllBooks().map(b => b.id), [4, 1, 'series_10', 5]);
    for (const mode of ['all', 'books', 'anthologies', 'favorites']) {
      coversState._coversKindMode = mode;
      _setCoverFavoritesFromPrefs({ favoriteBookIds: [6, 7] });
      assert.ok(!_visibleCoverItems().some(b => b.id === 6 || b.id === 7), `${mode} excludes coverless items`);
    }
    coversState._coversKindMode = 'all';
    const searchMatches = [
      { name: 'A book', createdAt: 1 },
      { name: 'Z series', createdAt: 3, isSeries: true },
      { name: 'M book', createdAt: 2 },
    ];
    coversState._coversSortMode = 'latest';
    assert.deepEqual(_sortCoverItems(searchMatches).map(item => item.name), ['Z series', 'M book', 'A book']);
    coversState._coversSortMode = 'oldest';
    assert.deepEqual(_sortCoverItems(searchMatches).map(item => item.name), ['A book', 'M book', 'Z series']);
    for (const sort of ['random', 'latest', 'oldest', 'popular', 'longest', 'shortest', 'za']) {
      coversState._coversSortMode = sort;
      assert.ok(!_sortedAllBooks().some(b => b.id === 6 || b.id === 7), `${sort} excludes coverless items`);
    }
    coversState._coversSortMode = 'alpha';
    coversState._allBooks[3].coverUrl = '/covers/6.jpg';
    assert.ok(_visibleCoverItems().some(b => b.id === 6), 'adding a cover makes the book visible');
    delete coversState._allBooks[3].coverUrl;
    coversState._hideCyrillicCovers = true;
    assert.ok(!_visibleCoverItems().some(b => b.id === 5));
    coversState._coversKindMode = 'favorites';
    _setCoverFavoritesFromPrefs({ favoriteBookIds: ['4', 'invalid'], favoriteSeriesIds: ['10'] });
    assert.deepEqual(_visibleCoverItems().map(b => b.id), [4, 'series_10']);
    coversState._coversKindMode = 'all';
    coversState._coversNotMineOnly = true;
    assert.deepEqual(_visibleCoverItems().map(b => b.id), [4]);
    coversState._coversNotMineOnly = false;
    window.innerWidth = 500;
    assert.deepEqual(_visibleCoverItems().map(b => b.id), [1], 'mobile forces live-reading availability');
    assert.deepEqual(_visibleCoverItems({ includeNonReadableOnMobile: true }).map(b => b.id), [1, 4, 'series_10']);
    coversState._coversLiveReadingOnly = true;
    assert.deepEqual(_visibleCoverItems({ includeNonReadableOnMobile: true }).map(b => b.id), [1]);
    coversState._coversLiveReadingOnly = false;
    window.innerWidth = 1280;
    coversState._landingCoverSource = 'mine';
    assert.equal(_effectiveLandingCoverSource(), 'mine');
    assert.deepEqual(_landingCoverPool().map(b => b.coverUrl), ['/covers/owned.jpg']);
    coversState._hideCyrillicCovers = false;
    assert.deepEqual(_landingCoverPool().map(b => b.coverUrl), ['/covers/owned.jpg', '/covers/cyrillic.jpg']);
    coversState._hideCyrillicCovers = true;
    coversState._landingBgCurrentKey = 'owned_1';
    coversState._landingBgPosY = 27.34;
    _persistLandingCoverPos();
    assert.deepEqual(prefs.at(-1), { landingCoverPos: { owned_1: 27.3 } });
    storage.delete('gamebook_auth_token');
    coversState._allCovers = [{ id: 9, name: 'Public', coverUrl: '/covers/public.jpg' }, { id: 10, name: 'Книга', coverUrl: '/covers/cyrillic.jpg' }];
    assert.equal(_effectiveLandingCoverSource(), 'public');
    assert.deepEqual(_landingCoverPool().map(b => b.coverUrl), ['/covers/public.jpg']);
    coversState._hideCyrillicCovers = false;
    assert.deepEqual(_landingCoverPool(), coversState._allCovers);
    _persistLandingCoverPos();
    assert.equal(prefs.length, 1, 'logged-out position changes are not saved to an account');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
