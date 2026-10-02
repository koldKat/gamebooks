import { _sortedByName, _isMobile, _shuffle } from './helpers.js';
import { coversState } from './state.js';
import { getToken, isDemoMode } from '../core/state.js';

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

// An anthology matches simulator filters if any child has a simulator.
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

// Stack PDF badges after battle-sim and reading badges.
export function _bottomLeftBadgeCount(item) {
  return (_hasBattleSim(item) ? 1 : 0) + (_hasLiveReading(item) ? 1 : 0);
}

// Resolve ownership from the hooked library cache; the public catalog has no viewer-specific ownership.
export function _isNotInMyBooks(item) {
  const owned = Array.isArray(coversState._hooks.getCachedBooks?.()) ? coversState._hooks.getCachedBooks() : [];
  const ownedIds = new Set(owned.map(b => b.id));
  // A series is not-owned only when none of its books are owned.
  if (item.isSeries) return !(item.bookIds || []).some(id => ownedIds.has(id));
  return !ownedIds.has(item.id);
}

export function _visibleCoverItems() {
  const base = [...coversState._allBooks, ...coversState._allSeriesCovers].filter(item =>
    (item.isSeries || !!item.coverUrl?.trim()) &&
    (!coversState._hideCyrillicCovers || !_hasCyrillic(item.name)));
  const mode = _effectiveCoversKindMode();
  let items;
  if (mode === 'books') items = base.filter(b => !b.isSeries && !b.isContainer);
  else if (mode === 'anthologies') items = base.filter(b => !!b.isContainer);
  else if (mode === 'series') items = base.filter(b => !!b.isSeries);
  else if (mode === 'favorites') items = base.filter(_isFavoriteCoverItem);
  else items = base;
  // Exclude series covers from battle-sim filters; they do not represent one simulator.
  if (coversState._coversBattleSimOnly) items = items.filter(_hasBattleSim);
  // Mobile always filters to readable books, regardless of the saved availability toggle.
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
