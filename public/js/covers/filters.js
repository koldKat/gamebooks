import { _sortedByName, _isMobile, _shuffle } from './helpers.js';
import { coversState } from './state.js';
import { getToken, isDemoMode } from '../state.js';

// ── Favorites management ───────────────────────────────────────────────────────
export function _setCoverFavoritesFromPrefs(p = {}) {
  coversState._favoriteBookIds = new Set((Array.isArray(p.favoriteBookIds) ? p.favoriteBookIds : [])
    .map(Number)
    .filter(Number.isInteger));
  coversState._favoriteSeriesIds = new Set((Array.isArray(p.favoriteSeriesIds) ? p.favoriteSeriesIds : [])
    .map(Number)
    .filter(Number.isInteger));
}

export function _isFavoriteCoverItem(item) {
  return item.isSeries
    ? coversState._favoriteSeriesIds.has(Number(item.entityId))
    : coversState._favoriteBookIds.has(Number(item.id));
}

// ── Cover item queries ─────────────────────────────────────────────────────────
export function _isLazyMode() { return true; }

export function _effectiveCoversKindMode() {
  if (!getToken() || isDemoMode) return coversState._coversKindMode === 'favorites' ? 'all' : coversState._coversKindMode;
  return coversState._coversKindMode;
}

export function _hasCyrillic(text) {
  return /[Ѐ-ӿ]/.test(String(text || ''));
}

export function _coverTooltipTitlePercent() {
  return coversState._coverTooltipTitlePct;
}

// A sim book can be a standalone tile OR live inside an anthology container
// as a child (e.g. book 8 - its own tile never appears on the covers wall,
// only its parent anthology's does), so containers count too if ANY of
// their children has a sim, not just the container's own ID.
export function _hasBattleSim(item) {
  if (item.isSeries) return false;
  return !!item.hasBattleSim;
}

// Same shape as _hasBattleSim above - a series covers multiple books and
// doesn't map to one book's live-reading availability.
export function _hasLiveReading(item) {
  if (item.isSeries) return false;
  return !!item.hasLiveReading;
}

// How many badges already occupy the cover thumb's bottom-left corner
// (battle-sim, then live-reading) - the PDF badge stacks after them via
// its data-badge-offset slots.
export function _bottomLeftBadgeCount(item) {
  return (_hasBattleSim(item) ? 1 : 0) + (_hasLiveReading(item) ? 1 : 0);
}

// Cross-referenced against the logged-in user's own library (getCachedBooks,
// wired in via setCoversHooks - covers.js can't import books.js directly,
// since books.js already imports from covers.js) rather than anything the
// server returns, since /api/public/books is a plain public listing with no
// per-requester ownership info at all.
export function _isNotInMyBooks(item) {
  const owned = Array.isArray(coversState._hooks.getCachedBooks?.()) ? coversState._hooks.getCachedBooks() : [];
  const ownedIds = new Set(owned.map(b => b.id));
  // A series counts as "not mine" only if NONE of its books are owned -
  // unlike the battle-sim/open-world filters, this one has a clean meaning
  // for a whole series (not just individual books), so it isn't excluded.
  if (item.isSeries) return !(item.bookIds || []).some(id => ownedIds.has(id));
  return !ownedIds.has(item.id);
}

export function _visibleCoverItems() {
  const base = [...coversState._allBooks, ...coversState._allSeriesCovers].filter(item => !coversState._hideCyrillicCovers || !_hasCyrillic(item.name));
  const mode = _effectiveCoversKindMode();
  let items;
  if (mode === 'books') items = base.filter(b => !b.isSeries && !b.isContainer);
  else if (mode === 'anthologies') items = base.filter(b => !!b.isContainer);
  else if (mode === 'series') items = base.filter(b => !!b.isSeries);
  else if (mode === 'favorites') items = base.filter(_isFavoriteCoverItem);
  else items = base;
  // Series covers span multiple books and don't map to one battle sim, so
  // they're excluded outright rather than shown/hidden by any single book's
  // sim status.
  if (coversState._coversBattleSimOnly) items = items.filter(_hasBattleSim);
  // Mobile is reading-only (see mobile/reader.js) - forced on regardless of
  // the "Book available" chip's own stored toggle state, since there's
  // nowhere for a non-reading book to go on mobile anyway. The chip itself
  // is hidden there (mobile.css) so it can't be toggled back off.
  if (coversState._coversLiveReadingOnly || _isMobile()) items = items.filter(_hasLiveReading);
  // Open world is a series-only concept - non-series items never match.
  if (coversState._coversOpenWorldOnly) items = items.filter(i => !!i.isOpenWorld);
  if (coversState._coversNotMineOnly && getToken() && !isDemoMode) items = items.filter(_isNotInMyBooks);
  return items;
}

export function _sortedAllBooks() {
  const items = _visibleCoverItems();
  if (coversState._coversSortMode === 'alpha')    return _sortedByName(items);
  if (coversState._coversSortMode === 'za')       return _sortedByName(items).reverse();
  if (coversState._coversSortMode === 'latest')   return [...items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (coversState._coversSortMode === 'oldest')   return [...items].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (coversState._coversSortMode === 'popular')  return [...items].sort((a, b) => (b.libraryCount || 0) - (a.libraryCount || 0));
  if (coversState._coversSortMode === 'longest')  return [...items].filter(i => i.totalSections > 0).sort((a, b) => b.totalSections - a.totalSections);
  if (coversState._coversSortMode === 'shortest') return [...items].filter(i => i.totalSections > 0).sort((a, b) => a.totalSections - b.totalSections);
  return [...items];
}

export function _randomizedCoverItems() {
  return _shuffle(_visibleCoverItems());
}
