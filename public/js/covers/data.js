import { _buildSeriesCoverEntries } from './series.js';
import { _effectiveCoversKindMode, _visibleCoverItems } from './filters.js';
import { _refreshCoversDisplay, _stopLazy } from './grid.js';
import { _resetLandingCoverQueue, _startLandingCoverRotation } from './background.js';
import { coversState } from './state.js';
import { getToken, isDemoMode } from '../state.js';
import { naturalCompare } from '../sort.js';
import { fetchPublic as publicFetch } from '../util.js';

let _coversDataFingerprint = '';
let _loadCoversInFlight  = false;
let _loadCoversPending   = null;
let _coversAutoRefreshPaused = false;

// A book/anthology creation flow that also attaches a PDF makes two separate
// server mutations (create, then upload), each broadcasting its own
// covers_changed SSE event with genuinely different data (no-PDF, then
// has-PDF) - the fingerprint dedup in loadCovers() only catches *identical*
// back-to-back calls, so these two real-but-transient states still render
// twice before the caller's own final _refreshLibraryUi call. Callers doing
// a known multi-step mutation should pause here and resume immediately
// before their own final refresh, so only that last, fully-settled state
// renders.
export function pauseCoversAutoRefresh() { _coversAutoRefreshPaused = true; }
export function resumeCoversAutoRefresh() { _coversAutoRefreshPaused = false; }
export function _refreshPublicCatalogIfVisible() {
  const wrapper = document.getElementById('landing-wrapper');
  if (!wrapper) return;
  if (wrapper.style.display === 'none') return;
  loadCovers({ force: true });
}

export function _isLandingBooksViewVisible() {
  const landingVisible = document.getElementById('landing-wrapper')?.style.display !== 'none';
  const mainHidden = document.getElementById('main-screen')?.style.display === 'none';
  const booksVisible = document.getElementById('books-screen')?.style.display !== 'none';
  const loginVisible = document.getElementById('login-screen')?.style.display !== 'none';
  return landingVisible && mainHidden && (booksVisible || loginVisible);
}

export function _visibleCoverItemsExport() { return _visibleCoverItems(); }

// ── Load covers API ────────────────────────────────────────────────────────────
// Include searchable metadata and filter/sort inputs, but not ownership
// popularity counters: other players adding books must not rebuild this grid.
export function _coversFingerprint(covers, books, series) {
  const sortRows = rows => [...rows].sort((a, b) => {
    const aId = a[0] ?? 0;
    const bId = b[0] ?? 0;
    if (aId !== bId) return aId - bId;
    return naturalCompare(String(a[1] ?? ''), String(b[1] ?? ''));
  });
  return JSON.stringify({
    covers: sortRows((Array.isArray(covers) ? covers : []).map(c => [c.id, c.name, c.coverUrl || c.cover_path || '', c.createdAt || c.created_at || 0, c.isContainer ? 1 : 0])),
    books: sortRows((Array.isArray(books) ? books : []).map(b => [
      b.id, b.name, b.coverUrl || b.cover_path || '', b.createdAt || b.created_at || 0,
      b.seriesId || b.series_id || 0, b.isContainer ? 1 : (b.is_container ? 1 : 0),
      b.pdfPath || '', b.authors || '', b.seriesName || '', b.seriesNumber || '',
      b.childNames || [], b.childIds || [], b.totalSections || 0,
      !!b.hasBattleSim, !!b.hasLiveReading,
    ])),
    series: sortRows((Array.isArray(series) ? series : []).map(s => [
      s.id, s.name, s.description || '', !!s.is_open_world,
      s.createdAt || 0, s.book_count ?? null, s.total_sections ?? null,
    ])),
  });
}

export async function loadCovers({ force = true } = {}) {
  if (_coversAutoRefreshPaused) return;
  if (_loadCoversInFlight) {
    _loadCoversPending = { force: force || (_loadCoversPending?.force ?? false) };
    return;
  }
  _loadCoversInFlight = true;
  const panel = document.getElementById('covers-panel');
  const grid  = document.getElementById('covers-grid');
  if (!panel || !grid) { _loadCoversInFlight = false; _drainPendingLoadCovers(); return; }
  try {
    const noStore = { cache: 'no-store' };
    const requestToken = getToken();
    // The books payload carries per-user pdfPath (stripped server-side for
    // non-admins/non-pdf_access), so the request must include the auth token
    // when we have one - same pattern as openSeriesActivity below.
    const _auth = requestToken ? { headers: { Authorization: `Bearer ${requestToken}` } } : {};
    const [coversRes, booksRes, seriesRes] = await Promise.all([
      publicFetch('/api/public/covers', noStore),
      publicFetch('/api/public/books', { ...noStore, ..._auth }),
      publicFetch('/api/public/series', noStore),
    ]);
    if (![coversRes, booksRes, seriesRes].every(res => res.ok)) throw new Error('Catalog request failed');
    const covers = await coversRes.json();
    const publicBooks = await booksRes.json();
    const publicSeries = await seriesRes.json();
    if (_coversAutoRefreshPaused) return;
    if (requestToken !== getToken()) {
      _loadCoversPending = { force: true };
      return;
    }
    if (![covers, publicBooks, publicSeries].every(Array.isArray)) throw new Error('Invalid catalog response');
    const nextFingerprint = _coversFingerprint(covers, publicBooks, publicSeries);
    // Empty caches must be populated even if their fingerprint matches.
    // Commit the fingerprint only after applying data to a visible landing
    // view; hidden-page fetches must not mark unapplied data as current.
    const cachesEmpty = !coversState._allBooks.length && !coversState._allCovers.length && !coversState._allSeriesCovers.length;
    const dataChanged = nextFingerprint !== _coversDataFingerprint || cachesEmpty;
    // A create/edit/delete action triggers loadCovers directly for an
    // immediate optimistic refresh, AND (if this tab is the multi-tab
    // "leader") the resulting server SSE push echoes back and triggers a
    // second loadCovers on the very same tab (livetab.js's covers_changed
    // relay isn't aware the change originated locally). Both calls pass
    // force:true, so skipping the redraw here when the fetched data hasn't
    // actually changed since the last render is what prevents the visible
    // double-reload, without weakening the fetch itself (still always
    // refetches, so genuinely new data from other users still renders).
    //
    // Panel visibility isn't implied by data freshness, though - if
    // _showCachedCoversPanel() no-op'd earlier (its own cache arrays were
    // still empty, e.g. right after a hard refresh that landed directly on
    // a book/graph page) the panel can be sitting inactive even though the
    // data we just fetched is identical to what's already cached. Without
    // this, that combination left the panel permanently hidden until a
    // second hard refresh, since this early return used to skip the
    // classList.add('active') below unconditionally.
    if (!dataChanged) {
      if (_isLandingBooksViewVisible() && (covers.length || coversState._allBooks.length || coversState._allSeriesCovers.length)) {
        panel.classList.add('active');
        document.getElementById('covers-toggle')?.classList.add('visible');
      }
      return;
    }
    if (!_isLandingBooksViewVisible()) return;
    coversState._allBooks    = publicBooks;
    // getAllPublicBooks() doesn't know about series flags - a book's own
    // isOpenWorld has to be derived here from its seriesId, or every book
    // belonging to an open-world series would never show the badge/match
    // the filter even though the series itself does.
    const openWorldSeriesIds = new Set((Array.isArray(publicSeries) ? publicSeries : []).filter(s => s.is_open_world).map(s => s.id));
    for (const b of coversState._allBooks) b.isOpenWorld = b.seriesId != null && openWorldSeriesIds.has(b.seriesId);
    coversState._allSeriesCovers = _buildSeriesCoverEntries(Array.isArray(publicSeries) ? publicSeries : [], Array.isArray(coversState._allBooks) ? coversState._allBooks : []);
    coversState._allCovers = covers;
    if (!covers.length && !coversState._allBooks.length && !coversState._allSeriesCovers.length) {
      _stopLazy();
      grid.innerHTML = '';
      _resetLandingCoverQueue();
      _coversDataFingerprint = nextFingerprint;
      panel.classList.remove('active');
      document.getElementById('covers-toggle')?.classList.remove('visible');
      return;
    }
    const kindLabel = document.getElementById('covers-kind-label');
    const kindMenu = document.getElementById('covers-kind-menu');
    if (kindLabel && kindMenu) {
      const effective = _effectiveCoversKindMode();
      const kindLabels = { all: 'All', books: 'Books', anthologies: 'Anthologies', series: 'Series', favorites: 'Favorites' };
      kindLabel.textContent = kindLabels[effective] || effective;
      kindMenu.querySelectorAll('li').forEach(li => li.classList.toggle('active', li.dataset.value === effective));
      const favLi = kindMenu.querySelector('li[data-value="favorites"]');
      if (favLi) favLi.style.display = (getToken() && !isDemoMode) ? '' : 'none';
    }
    const notMineEl2 = document.getElementById('covers-filter-notmine');
    if (notMineEl2) notMineEl2.style.display = (getToken() && !isDemoMode) ? '' : 'none';
    panel.classList.add('active');
    document.getElementById('covers-toggle').classList.add('visible');
    _refreshCoversDisplay();
    _coversDataFingerprint = nextFingerprint;
    if (dataChanged) _resetLandingCoverQueue();
    _startLandingCoverRotation();
  } catch (_) {
    if (!coversState._allBooks.length && !coversState._allCovers.length && !coversState._allSeriesCovers.length) panel.classList.remove('active');
  } finally {
    _loadCoversInFlight = false;
    _drainPendingLoadCovers();
  }
}

export function _drainPendingLoadCovers() {
  if (!_loadCoversPending) return;
  const opts = _loadCoversPending;
  _loadCoversPending = null;
  loadCovers(opts);
}
