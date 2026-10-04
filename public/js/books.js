// Compatibility entry point for the My Books feature.
import { booksState } from './books/state.js';
import { renderBooksList } from './books/render.js';
import { _scheduleBooksListRefresh } from './books/data.js';
import { _scheduleAnthologyCardCoverFlows } from './books/covers.js';

export function setBooksHooks(h) { booksState._hooks = h || {}; }
booksState.renderBooksList = renderBooksList;

// ── Module-level window listeners ─────────────────────────────────────────────
window.addEventListener('resize', () => _scheduleAnthologyCardCoverFlows());
window.addEventListener('book-state-saved', () => {
  _scheduleBooksListRefresh();
  booksState._hooks.scheduleRewardProfileRefresh?.();
});


export { getCachedBooks, getCachedAllSeries, getCachedStashes, setCachedBooks, setCachedAllSeries, clearBooksCache, setBooksDataFresh, getBooksDataFresh, setBooksRevealedAt, setCurrentUserId, getCurrentUserId, setInvalidateAutocompleteCaches, _justRevealedBooks, _booksListDisplayChanged, _patchCachedBook, _refreshLibraryUi, _refreshBooksListOnly } from './books/data.js';

export { setExpandedPrefs, _captureExpandedPrefsFromDom } from './books/prefs.js';

export { _setBooksSearchOpen, _applyBooksSearchFilter, _scheduleApplyBooksSearchFilter, initBooksPanel } from './books/search.js';

export { _starsHtml, _starLabelHtml, _flashRatingGate, _syncPdfBadgeOnCards, _syncEpubBadgeOnCards } from './books/markup.js';

export { renderBooksList } from './books/render.js';
