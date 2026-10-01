// Shared library data and preferences. No DOM access or feature imports.
export const booksState = {
  _hooks: {},
  _cachedBooks: null,
  _cachedAllSeries: null,
  _cachedStashes: null,
  _activeSeriesRuns: [],
  _booksDataFresh: false,
  _booksRevealedAt: 0,
  _bookExpandedPrefs: {},
  _seriesExpandedPrefs: {},
  _stashExpandedPrefs: {},
  _currentUserId: null,
  _invalidateAutocompleteCaches: () => {},
  _booksListFingerprint: null,
  renderBooksList: null,
};

export const _BOOKS_LS_KEY = 'books_list_v1';
export const _SERIES_LS_KEY = 'series_list_v1';
export const _STASHES_LS_KEY = 'stashes_list_v1';
