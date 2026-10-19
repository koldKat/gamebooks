import { booksState, _BOOKS_LS_KEY } from './state.js';
import { _captureExpandedPrefsFromDom } from './prefs.js';
import { getToken, apiFetch } from '../core/state.js';
import { loadCovers } from '../covers.js';
import { naturalCompareByName } from '../core/sort.js';

let _booksStateRefreshTimer = null;
let _booksRefreshPromise = null;
let _booksMutationRevision = 0;

export function getCachedBooks()    { return booksState._cachedBooks; }
export function getCachedAllSeries() { return booksState._cachedAllSeries; }
export function getCachedStashes()  { return booksState._cachedStashes; }
export function setCachedBooks(b)   { booksState._cachedBooks = b; }
export function setCachedAllSeries(s) { booksState._cachedAllSeries = s; }
export function clearBooksCache()   { booksState._cachedBooks = null; booksState._cachedAllSeries = null; booksState._cachedStashes = null; booksState._booksDataFresh = false; booksState._booksListFingerprint = null; }
export function setBooksDataFresh(v) { booksState._booksDataFresh = !!v; }
export function getBooksDataFresh()  { return booksState._booksDataFresh; }
export function setBooksRevealedAt(ts) { booksState._booksRevealedAt = ts; }
export function setCurrentUserId(id) { booksState._currentUserId = id; }
export function getCurrentUserId()   { return booksState._currentUserId; }
export function setInvalidateAutocompleteCaches(fn) { booksState._invalidateAutocompleteCaches = fn || (() => {}); }
// ── Ghost-click guard ─────────────────────────────────────────────────────────
export function _justRevealedBooks() { return Date.now() - booksState._booksRevealedAt < 350; }

// ── Cache helpers ─────────────────────────────────────────────────────────────
export function _booksPayloadFingerprint(books, allSeries) {
  return JSON.stringify({
    books:  Array.isArray(books)     ? books     : [],
    series: Array.isArray(allSeries) ? allSeries : [],
  });
}

export function _booksListDisplayChanged(bookId, { name, sections, discoverableSections, isPublic, seriesName, seriesNumber, isContainer, parentId, bookOrder }) {
  const old = (booksState._cachedBooks || []).find(b => b.id === bookId);
  if (!old) return true;
  const fakeNew = {
    name, total_sections: sections, discoverable_sections: discoverableSections ?? null,
    cover_path: old.cover_path, is_public: isPublic,
    series_name: seriesName || null, series_number: seriesNumber || null,
    is_container: isContainer ? 1 : 0, parent_book_id: parentId ?? null, book_order: bookOrder ?? null,
  };
  return _bookDisplayFingerprint(old) !== _bookDisplayFingerprint(fakeNew);
}

export function _bookDisplayFingerprint(b) {
  return [b.name, b.total_sections, b.discoverable_sections ?? '',
    b.cover_path ?? '', b.is_public ? '1' : '0',
    b.series_name ?? '', b.series_number ?? '',
    b.is_container ? '1' : '0', b.parent_book_id ?? '', b.book_order ?? ''].join('|');
}

export function _patchCachedBook(bookId, fields) {
  const idx = (booksState._cachedBooks || []).findIndex(b => b.id === bookId);
  if (idx >= 0) {
    booksState._cachedBooks = [...booksState._cachedBooks];
    booksState._cachedBooks[idx] = { ...booksState._cachedBooks[idx], ...fields };
    try { localStorage.setItem(_BOOKS_LS_KEY, JSON.stringify(booksState._cachedBooks)); } catch (_) {}
  }
}

// ── Refresh helpers ───────────────────────────────────────────────────────────
export async function _applySavedBookResponse(response) {
  const token = getToken();
  ++_booksMutationRevision;
  const saved = await response.json().catch(() => null);
  if (token !== getToken()) return;
  // Older running servers may still return only {ok:true} until restarted.
  if (!saved?.book) return _refreshBooksListOnly({ afterMutation: true });
  const books = booksState._cachedBooks;
  const old = books?.find(book => book.id === saved.book.id);
  if (!old) return;
  _captureExpandedPrefsFromDom();
  const parentId = saved.book.parent_book_id;
  const extraIds = (old.extra_anthology_ids || []).filter(id => id !== parentId);
  const extraOrders = { ...old.extra_anthology_orders };
  if (parentId) delete extraOrders[parentId];
  const updated = { ...old, ...saved.book, extra_anthology_ids: extraIds, extra_anthology_orders: extraOrders };
  const series = [...(booksState._cachedAllSeries || [])];
  if (saved.series) {
    const index = series.findIndex(item => item.id === saved.series.id);
    if (index < 0) series.push(saved.series);
    else series[index] = saved.series;
    series.sort(naturalCompareByName);
  }
  booksState.renderBooksList(books.map(book => book.id === updated.id ? updated : book), series, booksState._cachedStashes || []);
  booksState._booksListFingerprint = null;
  booksState._booksDataFresh = true;
  booksState._invalidateAutocompleteCaches();
  booksState._hooks.scheduleRewardProfileRefresh?.(250);
}

export async function _refreshLibraryUi({ feed = false, covers = false } = {}) {
  const jobs = [_refreshBooksListOnly({ afterMutation: true })];
  if (feed) jobs.push(booksState._hooks.loadFeed?.());
  if (covers) jobs.push(loadCovers({ force: true }));
  await Promise.allSettled(jobs);
  booksState._hooks.scheduleRewardProfileRefresh?.(250);
}

export async function _refreshBooksListOnly({ afterMutation = false } = {}) {
  if (!getToken()) return;
  if (_booksRefreshPromise) {
    await _booksRefreshPromise;
    // A request started before a save may contain the old membership. Fetch
    // again after it settles; ordinary background callers can still share it.
    if (!afterMutation) return;
    return _refreshBooksListOnly();
  }
  _booksRefreshPromise = (async () => {
    const revision = _booksMutationRevision;
    try {
      _captureExpandedPrefsFromDom();
      booksState._booksDataFresh = false;
      const stamp = Date.now();
      const [booksRes, stashesRes, seriesRes, activeRunsRes] = await Promise.all([
        apiFetch(`/api/books?_ts=${stamp}`),
        apiFetch(`/api/stashes?_ts=${stamp}`),
        apiFetch(`/api/series?_ts=${stamp}`),
        apiFetch(`/api/series/active-runs?_ts=${stamp}`).catch(() => null),
      ]);
      if (!booksRes.ok) throw new Error(`books refresh failed: ${booksRes.status}`);
      const books = await booksRes.json();
      if (!Array.isArray(books)) return;
      const safeStashes = stashesRes.ok ? await stashesRes.json() : (booksState._cachedStashes || []);
      const safeSeries  = seriesRes.ok  ? await seriesRes.json()  : (booksState._cachedAllSeries || []);
      if (revision !== _booksMutationRevision) return;
      if (activeRunsRes?.ok) {
        const ar = await activeRunsRes.json().catch(() => null);
        if (revision !== _booksMutationRevision) return;
        booksState._activeSeriesRuns = Array.isArray(ar) ? ar : [];
      }
      const safeSeriesArr  = Array.isArray(safeSeries)  ? safeSeries  : (booksState._cachedAllSeries || []);
      const safeStashesArr = Array.isArray(safeStashes) ? safeStashes : [];
      // Skip unchanged poll results to preserve list DOM and scroll position.
      const fingerprint = JSON.stringify({ books, series: safeSeriesArr, stashes: safeStashesArr, activeRuns: booksState._activeSeriesRuns });
      if (fingerprint !== booksState._booksListFingerprint) {
        booksState._booksListFingerprint = fingerprint;
        booksState.renderBooksList(books, safeSeriesArr, safeStashesArr);
      }
      booksState._booksDataFresh = true;
      booksState._invalidateAutocompleteCaches();
    } catch (err) {
      console.error('Books panel refresh failed', err);
    } finally {
      _booksRefreshPromise = null;
    }
  })();
  return _booksRefreshPromise;
}

export function _scheduleBooksListRefresh(delay = 350) {
  if (!getToken()) return;
  if (_booksStateRefreshTimer) clearTimeout(_booksStateRefreshTimer);
  _booksStateRefreshTimer = setTimeout(() => {
    _booksStateRefreshTimer = null;
    _refreshBooksListOnly();
    loadCovers({ force: true });
  }, delay);
}
