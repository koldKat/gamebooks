import { booksState } from './state.js';
import { getToken } from '../core/state.js';

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
  if (getToken() && Object.prototype.hasOwnProperty.call(map, key)) return map[key] !== '0';
  if (kind === 'series') {
    const [prefix, sid = ''] = String(key || '').split(':');
    // Stash expansion falls back only to stash-specific storage, never main-list state.
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
  if (!getToken()) return;
  const map = { ..._getExpandMap(kind), [key]: val };
  if (kind === 'book') {
    booksState._bookExpandedPrefs = map;
    booksState._hooks.savePrefs?.({ bookExpanded: { [key]: val } });
  } else if (kind === 'series') {
    booksState._seriesExpandedPrefs = map;
    booksState._hooks.savePrefs?.({ seriesExpanded: { [key]: val } });
  } else {
    booksState._stashExpandedPrefs = map;
    booksState._hooks.savePrefs?.({ stashExpanded: { [key]: val } });
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
    if (getToken() && Object.prototype.hasOwnProperty.call(nextBook, key) && nextBook[key] !== val) {
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
    if (getToken() && Object.prototype.hasOwnProperty.call(nextSeries, mapKey) && nextSeries[mapKey] !== val) {
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
    if (getToken() && Object.prototype.hasOwnProperty.call(nextStash, key) && nextStash[key] !== val) {
      if (!stashChanged) nextStash = { ...nextStash };
      nextStash[key] = val;
      stashChanged = true;
    }
  });

  if (getToken() && (bookChanged || seriesChanged || stashChanged)) {
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

// A series keeps its current state when its library location changes. Existing
// copies in other stashes retain their own preferences.
export function _syncMovedSeriesPrefs(stashes) {
  if (!Array.isArray(booksState._cachedStashes)) return;
  const contexts = items => {
    const result = new Map();
    for (const stash of items) for (const id of stash.seriesIds || []) {
      const sid = String(id);
      if (!result.has(sid)) result.set(sid, new Set());
      result.get(sid).add(String(stash.id));
    }
    return result;
  };
  const before = contexts(booksState._cachedStashes), after = contexts(stashes);
  const updates = [];
  const localKey = (place, sid) => `${place === 'main' ? '' : `stash_${place}_`}sr_expanded_${sid}`;
  for (const sid of new Set([...before.keys(), ...after.keys()])) {
    const oldPlaces = before.get(sid) || new Set(['main']);
    const newPlaces = after.get(sid) || new Set(['main']);
    const source = [...oldPlaces][0];
    for (const place of newPlaces) {
      if (oldPlaces.has(place)) continue;
      const val = _getExpandedPref('series', `${source}:${sid}`, localKey(source, sid)) ? '1' : '0';
      updates.push([`${place}:${sid}`, localKey(place, sid), val]);
    }
  }
  if (!updates.length) return;
  const map = { ...booksState._seriesExpandedPrefs };
  for (const [key, storageKey, val] of updates) {
    localStorage.setItem(storageKey, val);
    map[key] = val;
  }
  if (getToken()) {
    booksState._seriesExpandedPrefs = map;
    booksState._hooks.savePrefs?.({ seriesExpanded: map });
  }
}
