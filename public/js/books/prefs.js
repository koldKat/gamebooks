import { booksState } from './state.js';
import { getToken, isDemoMode } from '../core/state.js';

export function setExpandedPrefs(bookExp, seriesExp, stashExp) {
  booksState._bookExpandedPrefs   = (bookExp   && typeof bookExp   === 'object' && !Array.isArray(bookExp))   ? bookExp   : {};
  booksState._seriesExpandedPrefs = (seriesExp && typeof seriesExp === 'object' && !Array.isArray(seriesExp)) ? seriesExp : {};
  booksState._stashExpandedPrefs  = (stashExp  && typeof stashExp  === 'object' && !Array.isArray(stashExp))  ? stashExp  : {};
}

// ── Expand prefs ──────────────────────────────────────────────────────────────
export function _getExpandMap(kind) {
  if (kind === 'book')   return booksState._bookExpandedPrefs;
  if (kind === 'series') return booksState._seriesExpandedPrefs;
  return booksState._stashExpandedPrefs;
}

export function _getExpandedPref(kind, key, localKey) {
  const map = _getExpandMap(kind);
  if (!isDemoMode && getToken() && Object.prototype.hasOwnProperty.call(map, key)) return map[key] !== '0';
  if (kind === 'series') {
    const [prefix, sid = ''] = String(key || '').split(':');
    // Only bleed through main-list state for main-list lookups, not stash series.
    // Stash series fall directly to their stash-specific localStorage key to avoid
    // showing main-list expand state when the stash key was never persisted.
    if (prefix === 'main') {
      const mainLocalVal = localStorage.getItem(`sr_expanded_${sid}`);
      if (mainLocalVal != null) return mainLocalVal !== '0';
    }
  }
  return localStorage.getItem(localKey) !== '0';
}

export function _saveExpandedPref(kind, key, localKey, expanded) {
  const val = expanded ? '1' : '0';
  localStorage.setItem(localKey, val);
  if (isDemoMode || !getToken()) return;
  const map = { ..._getExpandMap(kind), [key]: val };
  if (kind === 'book') {
    booksState._bookExpandedPrefs = map;
    booksState._hooks.savePrefs?.({ bookExpanded: map });
  } else if (kind === 'series') {
    booksState._seriesExpandedPrefs = map;
    booksState._hooks.savePrefs?.({ seriesExpanded: map });
  } else {
    booksState._stashExpandedPrefs = map;
    booksState._hooks.savePrefs?.({ stashExpanded: map });
  }
}

export function _captureExpandedPrefsFromDom(root = document.getElementById('books-list')) {
  if (!root) return;
  let nextBook   = booksState._bookExpandedPrefs;
  let nextSeries = booksState._seriesExpandedPrefs;
  let nextStash  = booksState._stashExpandedPrefs;
  let bookChanged = false, seriesChanged = false, stashChanged = false;

  root.querySelectorAll('.book-item--container[data-container-id][data-expanded]').forEach(row => {
    const key = String(row.dataset.containerId || '');
    if (!key) return;
    const val = row.dataset.expanded === '1' ? '1' : '0';
    localStorage.setItem(`bk_expanded_${key}`, val);
    if (!isDemoMode && getToken() && Object.prototype.hasOwnProperty.call(nextBook, key) && nextBook[key] !== val) {
      if (!bookChanged) nextBook = { ...nextBook };
      nextBook[key] = val;
      bookChanged = true;
    }
  });

  root.querySelectorAll('.series-header-row[data-series-id][data-expanded]').forEach(row => {
    const sid     = String(row.dataset.seriesId || '');
    if (!sid) return;
    const stashId = row.dataset.stashId || '';
    const mapKey  = `${stashId || 'main'}:${sid}`;
    const localKey = `${stashId ? `stash_${stashId}_sr_` : 'sr_'}expanded_${sid}`;
    const val = row.dataset.expanded === '1' ? '1' : '0';
    localStorage.setItem(localKey, val);
    if (!isDemoMode && getToken() && Object.prototype.hasOwnProperty.call(nextSeries, mapKey) && nextSeries[mapKey] !== val) {
      if (!seriesChanged) nextSeries = { ...nextSeries };
      nextSeries[mapKey] = val;
      seriesChanged = true;
    }
  });

  root.querySelectorAll('.stash-header-row[data-stash-id][data-expanded]').forEach(row => {
    const key = String(row.dataset.stashId || '');
    if (!key) return;
    const val = row.dataset.expanded === '1' ? '1' : '0';
    localStorage.setItem(`stash_expanded_${key}`, val);
    if (!isDemoMode && getToken() && Object.prototype.hasOwnProperty.call(nextStash, key) && nextStash[key] !== val) {
      if (!stashChanged) nextStash = { ...nextStash };
      nextStash[key] = val;
      stashChanged = true;
    }
  });

  if (!isDemoMode && getToken() && (bookChanged || seriesChanged || stashChanged)) {
    booksState._bookExpandedPrefs   = nextBook;
    booksState._seriesExpandedPrefs = nextSeries;
    booksState._stashExpandedPrefs  = nextStash;
    const payload = {};
    if (bookChanged)   payload.bookExpanded   = nextBook;
    if (seriesChanged) payload.seriesExpanded = nextSeries;
    if (stashChanged)  payload.stashExpanded  = nextStash;
    booksState._hooks.savePrefs?.(payload);
  }
}

// Copies the main-list expand state for a series into any stash-specific key
// so newly-stashed series open in the same state as before.
export function _syncSeriesPrefsToStash(stashId, seriesIds = []) {
  if (!stashId) return;
  const sidList = [...new Set((seriesIds || []).map(Number).filter(Number.isInteger))];
  if (!sidList.length) return;
  let nextSeries = booksState._seriesExpandedPrefs;
  let changed    = false;
  for (const sid of sidList) {
    const mainMapKey   = `main:${sid}`;
    const stashMapKey  = `${stashId}:${sid}`;
    const mainLocalKey = `sr_expanded_${sid}`;
    const stashLocalKey = `stash_${stashId}_sr_expanded_${sid}`;
    const mainVal = (!isDemoMode && getToken() && Object.prototype.hasOwnProperty.call(nextSeries, mainMapKey))
      ? nextSeries[mainMapKey]
      : (localStorage.getItem(mainLocalKey) ?? '1');
    localStorage.setItem(stashLocalKey, mainVal);
    if (!isDemoMode && getToken() && nextSeries[stashMapKey] !== mainVal) {
      if (!changed) nextSeries = { ...nextSeries };
      nextSeries[stashMapKey] = mainVal;
      changed = true;
    }
  }
  if (!isDemoMode && getToken() && changed) {
    booksState._seriesExpandedPrefs = nextSeries;
    booksState._hooks.savePrefs?.({ seriesExpanded: nextSeries });
  }
}
