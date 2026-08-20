// books.js - Books list rendering, caching, search/filter, expand prefs, cover queue
import { getToken, isDemoMode, apiFetch, getDemoState, setDemoState } from './state.js?v=14';
import { foldForSearch, naturalCompare, naturalCompareByName } from './sort.js?v=1';
import { refreshCoinsDisplay } from './shop.js?v=100';
import { openCoverActivity, openSeriesActivity, _startLandingCoverRotation, _resetLandingCoverQueue, _effectiveLandingCoverSource, loadCovers } from './covers.js?v=157';
import { t } from './i18n.js?v=73';
import { showConfirm, showTwoChoice } from './play.js?v=158';
import { escapeHtml } from './util.js?v=91';

// ── Hooks ─────────────────────────────────────────────────────────────────────
let _hooks = {};
export function setBooksHooks(h) { _hooks = h || {}; }
function _sortedByName(items) { return [...items].sort(naturalCompareByName); }
function _isMobile() { return window.innerWidth <= 768; }

// ── State ─────────────────────────────────────────────────────────────────────
let _cachedBooks              = null;
let _cachedAllSeries          = null;
let _cachedStashes            = null;
let _activeSeriesRuns         = [];
let _booksStateRefreshTimer   = null;
let _anthologyFlowRaf         = null;
const _coverMetaCache         = new Map();
let _booksSearchOpen          = false;
let _booksSearchQuery         = '';
let _booksDataFresh           = false;
let _booksRefreshPromise      = null;
let _booksSearchApplyTimer    = null;
let _booksRevealedAt          = 0;
let _bookCoverQueue           = [];
let _bookCoverRunning         = false;
let _bookCoverGen             = 0;
const _bookCoverLoadedUrls    = new Set();
let _bookExpandedPrefs        = {};
let _seriesExpandedPrefs      = {};
let _stashExpandedPrefs       = {};
let _currentUserId            = null;
let _invalidateAutocompleteCaches = () => {};
let _booksListFingerprint     = null;

const _BOOKS_LS_KEY   = 'books_list_v1';
const _SERIES_LS_KEY  = 'series_list_v1';
const _STASHES_LS_KEY = 'stashes_list_v1';

// ── Exported state setters/getters ────────────────────────────────────────────
export function getCachedBooks()    { return _cachedBooks; }
export function getCachedAllSeries() { return _cachedAllSeries; }
export function getCachedStashes()  { return _cachedStashes; }
export function setCachedBooks(b)   { _cachedBooks = b; }
export function setCachedAllSeries(s) { _cachedAllSeries = s; }
export function clearBooksCache()   { _cachedBooks = null; _cachedAllSeries = null; _cachedStashes = null; _booksDataFresh = false; _booksListFingerprint = null; }
export function setBooksDataFresh(v) { _booksDataFresh = !!v; }
export function getBooksDataFresh()  { return _booksDataFresh; }
export function setBooksRevealedAt(ts) { _booksRevealedAt = ts; }
export function setCurrentUserId(id) { _currentUserId = id; }
export function getCurrentUserId()   { return _currentUserId; }
export function setInvalidateAutocompleteCaches(fn) { _invalidateAutocompleteCaches = fn || (() => {}); }
export function setExpandedPrefs(bookExp, seriesExp, stashExp) {
  _bookExpandedPrefs   = (bookExp   && typeof bookExp   === 'object' && !Array.isArray(bookExp))   ? bookExp   : {};
  _seriesExpandedPrefs = (seriesExp && typeof seriesExp === 'object' && !Array.isArray(seriesExp)) ? seriesExp : {};
  _stashExpandedPrefs  = (stashExp  && typeof stashExp  === 'object' && !Array.isArray(stashExp))  ? stashExp  : {};
}

// ── Ghost-click guard ─────────────────────────────────────────────────────────
export function _justRevealedBooks() { return Date.now() - _booksRevealedAt < 350; }

// ── Expand prefs ──────────────────────────────────────────────────────────────
function _getExpandMap(kind) {
  if (kind === 'book')   return _bookExpandedPrefs;
  if (kind === 'series') return _seriesExpandedPrefs;
  return _stashExpandedPrefs;
}

function _getExpandedPref(kind, key, localKey) {
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

function _saveExpandedPref(kind, key, localKey, expanded) {
  const val = expanded ? '1' : '0';
  localStorage.setItem(localKey, val);
  if (isDemoMode || !getToken()) return;
  const map = { ..._getExpandMap(kind), [key]: val };
  if (kind === 'book') {
    _bookExpandedPrefs = map;
    _hooks.savePrefs?.({ bookExpanded: map });
  } else if (kind === 'series') {
    _seriesExpandedPrefs = map;
    _hooks.savePrefs?.({ seriesExpanded: map });
  } else {
    _stashExpandedPrefs = map;
    _hooks.savePrefs?.({ stashExpanded: map });
  }
}

export function _captureExpandedPrefsFromDom(root = document.getElementById('books-list')) {
  if (!root) return;
  let nextBook   = _bookExpandedPrefs;
  let nextSeries = _seriesExpandedPrefs;
  let nextStash  = _stashExpandedPrefs;
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
    _bookExpandedPrefs   = nextBook;
    _seriesExpandedPrefs = nextSeries;
    _stashExpandedPrefs  = nextStash;
    const payload = {};
    if (bookChanged)   payload.bookExpanded   = nextBook;
    if (seriesChanged) payload.seriesExpanded = nextSeries;
    if (stashChanged)  payload.stashExpanded  = nextStash;
    _hooks.savePrefs?.(payload);
  }
}

// Copies the main-list expand state for a series into any stash-specific key
// so newly-stashed series open in the same state as before.
function _syncSeriesPrefsToStash(stashId, seriesIds = []) {
  if (!stashId) return;
  const sidList = [...new Set((seriesIds || []).map(Number).filter(Number.isInteger))];
  if (!sidList.length) return;
  let nextSeries = _seriesExpandedPrefs;
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
    _seriesExpandedPrefs = nextSeries;
    _hooks.savePrefs?.({ seriesExpanded: nextSeries });
  }
}

// ── Star rating helpers ───────────────────────────────────────────────────────
export function _starsHtml(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    const cls = rating >= i ? 'star on' : rating >= i - 0.5 ? 'star half' : 'star';
    html += `<span class="${cls}" data-pos="${i}">★</span>`;
  }
  return html;
}

export function _starLabelHtml(avgRating, voteCount, noun = 'book') {
  if (!avgRating || !voteCount) return `<span class="star-avg-none">Rate this ${noun}</span>`;
  const avg = Number.isInteger(avgRating) ? avgRating + '.0' : avgRating.toFixed(1);
  return `<span class="star-avg">${avg}</span><span class="star-votes"> (${voteCount} vote${voteCount !== 1 ? 's' : ''})</span>`;
}

export function _flashRatingGate(widget, msg) {
  const lbl = widget?.querySelector('.star-label');
  if (!lbl) return;
  const prev = lbl.innerHTML;
  lbl.innerHTML = `<span class="rating-gate-msg">${msg}</span>`;
  setTimeout(() => { if (lbl.querySelector('.rating-gate-msg')) lbl.innerHTML = prev; }, 3000);
}

// ── Cover meta / lazy loading ─────────────────────────────────────────────────
function _loadCoverMeta(url) {
  if (!url) return Promise.resolve(null);
  if (_coverMetaCache.has(url)) return _coverMetaCache.get(url);
  const pending = new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
    img.onerror = () => resolve(null);
    img.src = url;
  });
  _coverMetaCache.set(url, pending);
  return pending;
}

async function _applyAnthologyCardCoverFlows(root = document.getElementById('books-list')) {
  if (!root) return;
  root.querySelectorAll('.book-item[data-anthology-cover-url]').forEach(card => {
    card.style.setProperty('--book-card-cover-size',     '100% auto');
    card.style.setProperty('--book-card-cover-position', 'center center');
    card.style.removeProperty('--bk-cover-repeat');
  });

  const containerRows = root.querySelectorAll('.book-item--container[data-container-id][data-anthology-cover-url]');
  for (const row of containerRows) {
    const group = root.querySelector(`.book-children-group[data-parent="${row.dataset.containerId}"]`);
    if (!group || group.style.display === 'none') continue;
    const childCards = Array.from(group.querySelectorAll('.book-item--child[data-anthology-cover-url]'));
    if (!childCards.length) continue;
    const coverUrl = row.dataset.anthologyCoverUrl;
    const meta = await _loadCoverMeta(coverUrl);
    if (!meta?.width || !meta?.height) continue;

    const cards    = [row, ...childCards];
    const stackTop = row.offsetTop;
    const lastCard = cards[cards.length - 1];
    const stackH   = lastCard.offsetTop + lastCard.offsetHeight - stackTop;
    if (stackH <= 0) continue;

    const imgH     = Math.round((meta.height / meta.width) * row.offsetWidth);
    const topOffset = Math.round((stackH - imgH) / 2); // where image top sits in stack coords; negative when imgH > stackH

    for (const card of cards) {
      const cardTop = card.offsetTop - stackTop;
      card.style.setProperty('--book-card-cover-size',     `100% ${imgH}px`);
      card.style.setProperty('--book-card-cover-position', `center ${topOffset - cardTop}px`);
      card.style.setProperty('--bk-cover-repeat',          'repeat-y');
    }
  }
}

function _scheduleAnthologyCardCoverFlows(root = document.getElementById('books-list')) {
  if (_anthologyFlowRaf) cancelAnimationFrame(_anthologyFlowRaf);
  _anthologyFlowRaf = requestAnimationFrame(() => { _anthologyFlowRaf = null; _applyAnthologyCardCoverFlows(root); });
}

// `reset: false` appends to whatever's already queued/running instead of
// wiping it - used when expanding a collapsed anthology/series/stash group
// reveals more covers mid-flight, so that doesn't cancel/drop covers the
// initial full-list pass had already queued but not gotten to yet.
function _queueBookCovers(container, { reset = true } = {}) {
  if (!container) return;
  if (reset) {
    _bookCoverGen++;
    _bookCoverQueue   = [];
    _bookCoverRunning = false;
  }
  const gen = _bookCoverGen;
  // offsetParent is null for anything display:none (itself or an ancestor) -
  // a collapsed anthology/series/stash group leaves its children's
  // [data-pending-cover] elements in the DOM (see _bookItemHtml/the
  // book-children-group markup) purely hidden via CSS, not absent, so a
  // plain querySelectorAll here used to queue and eagerly load every single
  // child's cover regardless of whether its parent was ever expanded - for
  // an account with most books living inside anthologies, that meant
  // loading hundreds of covers nobody was about to look at on a simple
  // library page load. Only currently-visible covers get queued here now;
  // the expand-toggle handlers below call this again (reset: false) on just
  // the newly-revealed group once a container/series/stash actually opens.
  container.querySelectorAll('[data-pending-cover]').forEach(el => {
    if (el.offsetParent === null) return;
    const url = el.dataset.pendingCover;
    if (_bookCoverLoadedUrls.has(url)) {
      el.style.setProperty('--bci', `url('${url}')`);
      el.removeAttribute('data-pending-cover');
    } else {
      _bookCoverQueue.push({ el, url });
    }
  });
  if (!_bookCoverQueue.length || _bookCoverRunning) return;
  _bookCoverRunning = true;
  (function next() {
    if (gen !== _bookCoverGen) return;
    const item = _bookCoverQueue.shift();
    if (!item) { _bookCoverRunning = false; return; }
    const { el, url } = item;
    if (_bookCoverQueue.length) { const pre = new Image(); pre.src = _bookCoverQueue[0].url; }
    const img  = new Image();
    img.onload = () => {
      if (gen !== _bookCoverGen) return;
      _bookCoverLoadedUrls.add(url);
      el.style.setProperty('--bci', `url('${url}')`);
      el.removeAttribute('data-pending-cover');
      next();
    };
    img.onerror = () => { if (gen !== _bookCoverGen) return; el.removeAttribute('data-pending-cover'); next(); };
    img.src = url;
  })();
}

// ── Search / filter ───────────────────────────────────────────────────────────
export function _setBooksSearchOpen(open) {
  _booksSearchOpen = !!open;
  document.body.classList.toggle('books-searching', _booksSearchOpen);
  const input = document.getElementById('books-search-input');
  if (_booksSearchOpen) {
    if (getToken() && !isDemoMode && !_booksDataFresh) _refreshBooksListOnly();
    if (input) { input.value = _booksSearchQuery; input.focus(); input.select(); }
  } else {
    _booksSearchQuery = '';
    if (input) input.value = '';
    _applyBooksSearchFilter();
  }
}

function _booksSearchBlob(el) {
  if (el?._booksSearchBlobCache) return el._booksSearchBlobCache;
  const parts = [el.textContent || ''];
  el.querySelectorAll('[data-name],[data-authors],[data-description],[data-series]').forEach(n => {
    if (n.dataset.name)        parts.push(n.dataset.name);
    if (n.dataset.authors)     parts.push(n.dataset.authors);
    if (n.dataset.description) parts.push(n.dataset.description);
    if (n.dataset.series)      parts.push(n.dataset.series);
  });
  const blob = foldForSearch(parts.join(' '));
  if (el) el._booksSearchBlobCache = blob;
  return blob;
}

function _booksSearchMatches(el, query) {
  if (!query) return true;
  return _booksSearchBlob(el).includes(query);
}

function _restoreBooksSearchFilter(list) {
  list.querySelectorAll('.book-item, .series-header-row, .series-books-group, .stash-block, .stash-header-row, .stash-items-group, .book-children-group').forEach(el => {
    if (el.classList.contains('series-books-group')) {
      const header = el.previousElementSibling;
      el.style.display = header?.dataset.expanded === '1' ? '' : 'none';
      return;
    }
    if (el.classList.contains('stash-items-group')) {
      const header = el.previousElementSibling;
      el.style.display = header?.dataset.expanded === '1' ? '' : 'none';
      return;
    }
    if (el.classList.contains('book-children-group')) {
      const row = el.previousElementSibling;
      el.style.display = row?.dataset.expanded === '1' ? '' : 'none';
      return;
    }
    el.style.display = '';
  });
  list.querySelectorAll('.book-item--container[data-search-expanded]').forEach(el => delete el.dataset.searchExpanded);
  list.querySelector('.books-search-empty')?.remove();
}

function _filterContainerRow(row, childrenGroup, query, forceShowAll = false) {
  const rowMatch = forceShowAll || _booksSearchMatches(row, query);
  let anyChild   = false;
  const children = childrenGroup ? [...childrenGroup.querySelectorAll(':scope > .book-item')] : [];
  if (childrenGroup) {
    children.forEach(child => {
      const visible = rowMatch || forceShowAll || _booksSearchMatches(child, query);
      child.style.display = visible ? '' : 'none';
      if (visible) anyChild = true;
    });
  }
  const visible = rowMatch || anyChild;
  row.style.display = visible ? '' : 'none';
  if (visible && anyChild) row.dataset.searchExpanded = '1'; else delete row.dataset.searchExpanded;
  if (childrenGroup) childrenGroup.style.display = visible && anyChild ? '' : 'none';
  return visible;
}

function _filterBooksGroup(group, query, forceShowAll = false) {
  let anyVisible = false;
  for (let node = group.firstElementChild; node; node = node.nextElementSibling) {
    if (node.classList.contains('series-header-row')) {
      const seriesGroup = node.nextElementSibling?.classList.contains('series-books-group') ? node.nextElementSibling : null;
      const headerMatch = forceShowAll || _booksSearchMatches(node, query);
      const groupHasVisible = seriesGroup ? _filterBooksGroup(seriesGroup, query, headerMatch) : false;
      const visible = headerMatch || groupHasVisible;
      node.style.display = visible ? '' : 'none';
      if (seriesGroup) seriesGroup.style.display = visible && groupHasVisible ? '' : (visible && headerMatch ? '' : 'none');
      anyVisible ||= visible;
      if (seriesGroup) node = seriesGroup;
      continue;
    }
    if (node.classList.contains('book-item--container')) {
      const childGroup = node.nextElementSibling?.classList.contains('book-children-group') ? node.nextElementSibling : null;
      anyVisible ||= _filterContainerRow(node, childGroup, query, forceShowAll);
      if (childGroup) node = childGroup;
      continue;
    }
    if (node.classList.contains('book-item')) {
      const visible = forceShowAll || _booksSearchMatches(node, query);
      node.style.display = visible ? '' : 'none';
      anyVisible ||= visible;
    }
  }
  return anyVisible;
}

export function _applyBooksSearchFilter() {
  const list = document.getElementById('books-list');
  if (!list) return;
  const query = foldForSearch((_booksSearchQuery || '').trim());
  if (!query) {
    _restoreBooksSearchFilter(list);
    _queueBookCovers(list, { reset: false });
    _scheduleAnthologyCardCoverFlows(list);
    return;
  }

  list.querySelector('.books-search-empty')?.remove();
  let anyVisible = false;
  for (let node = list.firstElementChild; node; node = node.nextElementSibling) {
    if (node.classList.contains('stash-block')) {
      const header = node.querySelector(':scope > .stash-header-row');
      const group  = node.querySelector(':scope > .stash-items-group');
      const headerMatch    = header ? _booksSearchMatches(header, query) : false;
      const groupHasVisible = group  ? _filterBooksGroup(group, query, headerMatch) : false;
      const visible = headerMatch || groupHasVisible;
      node.style.display = visible ? '' : 'none';
      if (header) header.style.display = visible ? '' : 'none';
      if (group)  group.style.display  = visible && groupHasVisible ? '' : (visible && headerMatch ? '' : 'none');
      anyVisible ||= visible;
      continue;
    }
    if (node.classList.contains('series-header-row')) {
      const group = node.nextElementSibling?.classList.contains('series-books-group') ? node.nextElementSibling : null;
      const headerMatch     = _booksSearchMatches(node, query);
      const groupHasVisible = group ? _filterBooksGroup(group, query, headerMatch) : false;
      const visible = headerMatch || groupHasVisible;
      node.style.display = visible ? '' : 'none';
      if (group) group.style.display = visible && groupHasVisible ? '' : (visible && headerMatch ? '' : 'none');
      anyVisible ||= visible;
      if (group) node = group;
      continue;
    }
    if (node.classList.contains('book-item--container')) {
      const childGroup = node.nextElementSibling?.classList.contains('book-children-group') ? node.nextElementSibling : null;
      anyVisible ||= _filterContainerRow(node, childGroup, query);
      if (childGroup) node = childGroup;
      continue;
    }
    if (node.classList.contains('book-item')) {
      const visible = _booksSearchMatches(node, query);
      node.style.display = visible ? '' : 'none';
      anyVisible ||= visible;
    }
  }

  if (!anyVisible) {
    const empty = document.createElement('div');
    empty.className = 'books-search-empty';
    empty.textContent = t('books.no_matches');
    list.appendChild(empty);
  }
  // A matching book inside a collapsed anthology/series/stash force-reveals
  // that group above (_filterContainerRow/_filterBooksGroup) - its cover was
  // skipped by the initial load pass (still collapsed then), so it needs
  // queuing now that search has made it visible.
  _queueBookCovers(list, { reset: false });
  _scheduleAnthologyCardCoverFlows(list);
}

export function _scheduleApplyBooksSearchFilter(delay = 70) {
  if (_booksSearchApplyTimer) clearTimeout(_booksSearchApplyTimer);
  _booksSearchApplyTimer = setTimeout(() => { _booksSearchApplyTimer = null; _applyBooksSearchFilter(); }, delay);
}

// ── Cache helpers ─────────────────────────────────────────────────────────────
function _booksPayloadFingerprint(books, allSeries) {
  return JSON.stringify({
    books:  Array.isArray(books)     ? books     : [],
    series: Array.isArray(allSeries) ? allSeries : [],
  });
}

export function _booksListDisplayChanged(bookId, { name, sections, discoverableSections, isPublic, seriesName, seriesNumber, isContainer, parentId, bookOrder }) {
  const old = (_cachedBooks || []).find(b => b.id === bookId);
  if (!old) return true;
  const fakeNew = {
    name, total_sections: sections, discoverable_sections: discoverableSections ?? null,
    cover_path: old.cover_path, is_public: isPublic,
    series_name: seriesName || null, series_number: seriesNumber || null,
    is_container: isContainer ? 1 : 0, parent_book_id: parentId ?? null, book_order: bookOrder ?? null,
  };
  return _bookDisplayFingerprint(old) !== _bookDisplayFingerprint(fakeNew);
}

function _bookDisplayFingerprint(b) {
  return [b.name, b.total_sections, b.discoverable_sections ?? '',
    b.cover_path ?? '', b.is_public ? '1' : '0',
    b.series_name ?? '', b.series_number ?? '',
    b.is_container ? '1' : '0', b.parent_book_id ?? '', b.book_order ?? ''].join('|');
}

export function _patchCachedBook(bookId, fields) {
  const idx = (_cachedBooks || []).findIndex(b => b.id === bookId);
  if (idx >= 0) {
    _cachedBooks = [..._cachedBooks];
    _cachedBooks[idx] = { ..._cachedBooks[idx], ...fields };
    try { localStorage.setItem(_BOOKS_LS_KEY, JSON.stringify(_cachedBooks)); } catch (_) {}
  }
}

// ── Book item HTML ────────────────────────────────────────────────────────────
function _hasBattleSim(b) {
  if (b.has_battle_sim) return true;
  return !!(b.is_container && (_cachedBooks || []).some(c => c.parent_book_id === b.id && c.has_battle_sim));
}

function _bookItemHtml(b, isChild, containerExpanded, childCount, aggrStats, isAdmin, containerId = null) {
  const effectiveSections = b.is_container ? (aggrStats?.totalSections || 0) : (b.discoverable_sections ?? b.total_sections);
  const effectiveVisited  = b.is_container ? (aggrStats?.visited || 0)        : b.visited;
  const pct         = effectiveSections > 0
    ? (effectiveVisited >= effectiveSections ? 100 : Math.min(99, Math.floor((effectiveVisited / effectiveSections) * 100)))
    : 0;
  const fullyVisited = effectiveSections > 0 && effectiveVisited >= effectiveSections;
  const barColor    = fullyVisited ? 'rgba(34,197,94,0.25)' : 'rgba(107,114,128,0.28)';
  const bg          = pct > 0 ? `background: linear-gradient(to right, ${barColor} ${pct}%, transparent ${pct}%);` : `background: transparent;`;
  const isCreator   = isDemoMode || b.created_by === null || b.created_by === _currentUserId;
  const inParty     = !!b.party_id;
  const extraClass  = (b.is_container ? ' book-item--container' : (isChild ? ' book-item--child' : '')) + (inParty ? ' book-item--party' : '');
  const experimentalCoverCards = !isDemoMode;
  const ownCoverUrl   = b.cover_path ? `/covers/${b.cover_path}` : '';
  // Cover inheritance uses the anthology this item is actually being rendered
  // under (containerId), not always b.parent_book_id - a book shown as a
  // secondary member of anthology X should pick up X's cover, not its
  // primary anthology's, even though parent_book_id still points elsewhere.
  const effectiveContainerId = containerId ?? b.parent_book_id;
  const parentContainer = isChild && effectiveContainerId ? (_cachedBooks || []).find(x => x.id === effectiveContainerId && x.is_container) : null;
  const anthologyCoverUrl = isChild && parentContainer?.cover_path ? `/covers/${parentContainer.cover_path}` : '';
  const coverUrl      = anthologyCoverUrl || ownCoverUrl;
  const flowCoverUrl  = b.is_container ? ownCoverUrl : anthologyCoverUrl;
  const coverCardClass  = experimentalCoverCards && coverUrl ? ' book-item--coverbg' : '';
  const expandedAttr    = b.is_container ? ` data-expanded="${containerExpanded ? '1' : '0'}"` : '';
  const containerIdAttr = b.is_container ? ` data-container-id="${b.id}"` : '';
  const anthologyFlowAttr = flowCoverUrl ? ` data-anthology-cover-url="${escapeHtml(flowCoverUrl)}"` : '';
  const commonAttrs =
    ` data-id="${b.id}" data-name="${escapeHtml(b.name)}"` +
    ` data-sections="${b.total_sections}" data-isbn="${escapeHtml(b.isbn || '')}" data-issn="${escapeHtml(b.issn || '')}" data-asin="${escapeHtml(b.asin || '')}"` +
    ` data-cover="${escapeHtml(b.cover_path ? `/covers/${b.cover_path}` : '')}" data-pdf="${escapeHtml(b.pdf_path || '')}"` +
    ` data-pdf-size="${escapeHtml(String(b.pdf_size ?? ''))}"` +
    (effectiveContainerId && !b.cover_path ? (() => { const p = _cachedBooks?.find(x => x.id === effectiveContainerId); return p?.cover_path ? ` data-parent-cover="${escapeHtml(`/covers/${p.cover_path}`)}"` : ''; })() : '') +
    ` data-pages="${escapeHtml(String(b.pages || ''))}" data-authors="${escapeHtml(b.authors || '')}" data-description="${escapeHtml(b.description || '')}"` +
    ` data-discoverable="${b.discoverable_sections ?? ''}" data-public="${b.is_public ? '1' : '0'}"` +
    ` data-series="${escapeHtml(b.series_name || '')}" data-series-num="${escapeHtml(b.series_number || '')}"` +
    ` data-is-container="${b.is_container ? '1' : '0'}" data-parent-id="${b.parent_book_id ?? ''}" data-book-order="${b.book_order ?? ''}"`;
  const subtitle = b.is_container
    ? `<span class="book-sections">${childCount === 1 ? '1 book' : `${childCount} books`}${effectiveSections > 0 ? ` · ${effectiveSections} sections` : ''}${b.pages ? ` · <span class="book-isbn">${escapeHtml(String(b.pages))} pages</span>` : ''}</span>`
    : `<span class="book-sections">${t('books.sections', { n: b.total_sections })}${b.pages ? ` · <span class="book-isbn">${escapeHtml(String(b.pages))} pages</span>` : ''}</span>`;
  const activeHere = !b.is_container && _activeSeriesRuns.find(ar => ar.last_book_id === b.id);
  const activeBadge = activeHere
    ? `<span class="book-active-run-badge" data-tooltip="${escapeHtml(`Series run ${activeHere.run_index + 1} active here${activeHere.last_section ? ` at ${activeHere.last_section}` : ''}`)}">▶ Run ${activeHere.run_index + 1}</span>`
    : '';
  const openWorldBadge = b.isOpenWorld
    ? `<span class="book-open-world-badge" data-tooltip="${escapeHtml(t('covers.open_world_book'))}"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span>`
    : '';
  const battleSimBadge = _hasBattleSim(b)
    ? `<span class="book-battlesim-badge" data-tooltip="${escapeHtml(t('covers.has_battle_sim'))}"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/><line x1="4" y1="4" x2="8" y2="4"/><line x1="4" y1="4" x2="4" y2="8"/><line x1="20" y1="4" x2="16" y2="4"/><line x1="20" y1="4" x2="20" y2="8"/></svg></span>`
    : '';
  let cardStyle      = bg;
  let pendingCoverAttr = '';
  if (experimentalCoverCards && coverUrl) {
    const progressLayer = pct > 0
      ? `linear-gradient(to right, ${barColor} ${pct}%, transparent ${pct}%)`
      : `linear-gradient(to right, transparent 0%, transparent 100%)`;
    cardStyle =
      `background-image:${progressLayer},linear-gradient(to right, rgba(17,24,39,0.96) 0%, rgba(17,24,39,0.92) 54%, rgba(17,24,39,0.72) 74%, rgba(17,24,39,0.4) 100%),var(--bci,none);` +
      `background-size:auto,auto,var(--book-card-cover-size,100% auto);` +
      `background-position:0 0,0 0,var(--book-card-cover-position,center center);` +
      `background-repeat:no-repeat,no-repeat,var(--bk-cover-repeat,no-repeat);`;
    pendingCoverAttr = ` data-pending-cover="${escapeHtml(coverUrl)}"`;
  }
  return `<div class="book-item${extraClass}${coverCardClass}"${expandedAttr}${containerIdAttr}${anthologyFlowAttr}${pendingCoverAttr} style="${cardStyle}">` +
    `<div class="book-info">` +
      `<div class="book-name-row">` +
        `<span class="book-name-text" data-id="${b.id}" data-name="${escapeHtml(b.name)}" data-tooltip="${escapeHtml(b.name)}">${escapeHtml(b.name)}</span>` +
        openWorldBadge + battleSimBadge +
        activeBadge +
      `</div>` +
      subtitle +
      `<div class="book-rating-row star-rating" data-book-id="${b.id}" data-user-rating="${b.userRating ?? ''}">` +
        _starsHtml(b.avgRating) +
        `<span class="star-label">${_starLabelHtml(b.avgRating, b.voteCount)}</span>` +
      `</div>` +
    `</div>` +
    `<div class="book-actions">` +
      (!b.is_container
        ? `<button class="book-open-btn primary-btn"${commonAttrs} data-creator="${isCreator ? '1' : '0'}">${t('books.open')}</button>`
        : '') +
      `<div class="book-secondary-actions">` +
        (!isCreator && !isAdmin
          ? `<span data-tooltip="Only the book creator can edit metadata" style="display:inline-flex">` +
              `<button class="book-edit-btn" disabled${commonAttrs}>✎</button>` +
            `</span>`
          : `<button class="book-edit-btn${!isCreator && isAdmin ? ' book-edit-btn--admin' : ''}"${commonAttrs}${!isCreator && isAdmin ? ' data-tooltip="Admin edit"' : ''}>✎</button>`
        ) +
        `<button class="book-del-btn" data-id="${b.id}" data-name="${escapeHtml(b.name)}" data-container="${b.is_container ? '1' : '0'}">✕</button>` +
      `</div>` +
    `</div>` +
  `</div>`;
}

// ── Refresh helpers ───────────────────────────────────────────────────────────
export async function _refreshLibraryUi({ feed = false, covers = false } = {}) {
  const jobs = [_refreshBooksListOnly()];
  if (feed) jobs.push(_hooks.loadFeed?.());
  if (!isDemoMode && covers) jobs.push(loadCovers({ force: true }));
  await Promise.allSettled(jobs);
  _hooks.scheduleRewardProfileRefresh?.(250);
}

export async function _refreshBooksListOnly() {
  if (isDemoMode || !getToken()) return;
  if (_booksRefreshPromise) return _booksRefreshPromise;
  _booksRefreshPromise = (async () => {
    try {
      _captureExpandedPrefsFromDom();
      _booksDataFresh = false;
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
      const safeStashes = stashesRes.ok ? await stashesRes.json() : (_cachedStashes || []);
      const safeSeries  = seriesRes.ok  ? await seriesRes.json()  : (_cachedAllSeries || []);
      if (activeRunsRes?.ok) {
        const ar = await activeRunsRes.json().catch(() => null);
        _activeSeriesRuns = Array.isArray(ar) ? ar : [];
      }
      const safeSeriesArr  = Array.isArray(safeSeries)  ? safeSeries  : (_cachedAllSeries || []);
      const safeStashesArr = Array.isArray(safeStashes) ? safeStashes : [];
      // The periodic 5-minute poll (livetab.js) calls this on a large library
      // even when nothing changed - renderBooksList does a full rebuild of
      // #books-list, which is a visible flash/scroll-jump on a long list.
      // Skipping the rebuild entirely when the fetched data is byte-identical
      // to what's already on screen fixes that for the common case (nothing
      // changed) without touching the render path itself, so every other
      // caller (add/edit/delete a book, etc.) still gets its normal
      // immediate, always-correct rebuild the moment the data actually
      // differs.
      const fingerprint = JSON.stringify({ books, series: safeSeriesArr, stashes: safeStashesArr, activeRuns: _activeSeriesRuns });
      if (fingerprint !== _booksListFingerprint) {
        _booksListFingerprint = fingerprint;
        renderBooksList(books, safeSeriesArr, safeStashesArr);
      }
      _booksDataFresh = true;
      _invalidateAutocompleteCaches();
    } catch (err) {
      console.error('Books panel refresh failed', err);
    } finally {
      _booksRefreshPromise = null;
    }
  })();
  return _booksRefreshPromise;
}

function _scheduleBooksListRefresh(delay = 350) {
  if (isDemoMode || !getToken()) return;
  if (_booksStateRefreshTimer) clearTimeout(_booksStateRefreshTimer);
  _booksStateRefreshTimer = setTimeout(() => {
    _booksStateRefreshTimer = null;
    _refreshBooksListOnly();
    if (!isDemoMode) loadCovers({ force: true });
  }, delay);
}

// ── Main render ───────────────────────────────────────────────────────────────
export function renderBooksList(allOwnedBooks, allSeries = [], stashes = []) {
  if (!Array.isArray(allOwnedBooks)) return;
  const openWorldSeriesIds = new Set((allSeries || []).filter(s => s.is_open_world).map(s => s.id));
  for (const b of allOwnedBooks) b.isOpenWorld = b.series_id != null && openWorldSeriesIds.has(b.series_id);
  // _cachedBooks/getCachedBooks() is the app-wide "what does this user own"
  // source (autocomplete, the "not in my books" covers filter, add-to-
  // library duplicate checks, etc.) - it must stay the FULL list regardless
  // of viewport, cached/persisted from allOwnedBooks before the reading-only
  // cut below ever touches `books`.
  _cachedBooks     = allOwnedBooks;
  _cachedAllSeries = allSeries;
  _cachedStashes   = Array.isArray(stashes) ? stashes : [];
  try { localStorage.setItem(_BOOKS_LS_KEY,   JSON.stringify(allOwnedBooks));   } catch (_) {}
  try { localStorage.setItem(_SERIES_LS_KEY,  JSON.stringify(allSeries));       } catch (_) {}
  try { localStorage.setItem(_STASHES_LS_KEY, JSON.stringify(_cachedStashes));  } catch (_) {}
  if (_effectiveLandingCoverSource() === 'mine') { _resetLandingCoverQueue(); _startLandingCoverRotation(); }

  // Mobile is reading-only (see mobile/reader.js) - a book with no in-app
  // reading has nowhere to go there, so it's dropped from the rendered list
  // below entirely rather than shown only to dead-end. Containers/
  // anthologies stay regardless of their own hasLiveReading (always false -
  // they're folders, not readable content); a series with none of its books
  // left just shows an empty/short group, same graceful-degradation the
  // "not mine" covers filter already accepts elsewhere. Everything from
  // here down uses this `books`, never allOwnedBooks - the whole point is
  // that only the rendering, not the cache above, sees the cut list.
  const books = _isMobile() ? allOwnedBooks.filter(b => b.is_container || b.hasLiveReading) : allOwnedBooks;

  const isAdmin = _hooks.getIsAdmin?.() ?? false;
  const list = document.getElementById('books-list');

  if (!books.length && !allSeries.length && !_cachedStashes.length) {
    list.innerHTML = `<p class="books-empty">${t('books.empty')}</p>`;
    return;
  }

  // A book's containers = its one primary parent_book_id plus any secondary
  // book_anthology_memberships - a book can now legitimately be a child in
  // more than one anthology at once, so every "is this a child of X" check
  // below loops over all of a book's containers instead of just its parent.
  const _containerIdsFor = b => [...new Set(b.parent_book_id
    ? [b.parent_book_id, ...(b.extra_anthology_ids || [])]
    : (b.extra_anthology_ids || []))];

  // A book's book_order column is only its position within its *primary*
  // parent_book_id - a secondary membership has its own order scoped to that
  // one anthology (server/db/books.js's extra_anthology_orders), so sorting a
  // children group must resolve order per-container, not read b.book_order
  // directly (that would apply the wrong anthology's order to a secondary child).
  const _orderForContainer = (b, pid) => pid === b.parent_book_id ? b.book_order : (b.extra_anthology_orders?.[pid] ?? null);
  const _sortChildrenMap = map => {
    for (const pid of Object.keys(map)) {
      const pidNum = Number(pid);
      map[pid].sort((a, b) => _compareByRecentOptionalNumberThenName(
        { ...a, book_order: _orderForContainer(a, pidNum) },
        { ...b, book_order: _orderForContainer(b, pidNum) },
        'book_order'
      ));
    }
  };

  const _sortBooks = arr => [...arr].sort((a, b) => {
    if (a.is_demo !== b.is_demo) return (a.is_demo ? 1 : 0) - (b.is_demo ? 1 : 0);
    const aHas = a.last_run_at != null, bHas = b.last_run_at != null;
    if (aHas && bHas) return b.last_run_at - a.last_run_at;
    if (aHas) return -1; if (bHas) return 1;
    return naturalCompare(a.name, b.name);
  });

  const _compareByRecentOptionalNumberThenName = (a, b, field) => {
    const aHas = a.last_run_at != null, bHas = b.last_run_at != null;
    if (aHas && bHas) return b.last_run_at - a.last_run_at;
    if (aHas) return -1; if (bHas) return 1;
    const aNum = a[field] != null && String(a[field]).trim() !== '' ? parseFloat(a[field]) : null;
    const bNum = b[field] != null && String(b[field]).trim() !== '' ? parseFloat(b[field]) : null;
    const aValid = aNum != null && !isNaN(aNum), bValid = bNum != null && !isNaN(bNum);
    if (aValid && bValid && aNum !== bNum) return aNum - bNum;
    if (aValid) return -1; if (bValid) return 1;
    return naturalCompare(a.name, b.name);
  };

  const _sortSeriesBooks = arr => [...arr].sort((a, b) => {
    if (a.is_demo !== b.is_demo) return (a.is_demo ? 1 : 0) - (b.is_demo ? 1 : 0);
    return _compareByRecentOptionalNumberThenName(a, b, 'series_number');
  });

  const _aggregateProgress = (activeBooks, containerChildrenMap = {}) => {
    let visited = 0, totalSections = 0;
    const containerIds = new Set(Object.keys(containerChildrenMap).map(id => Number(id)));
    for (const b of activeBooks) {
      if (_containerIdsFor(b).some(pid => containerIds.has(Number(pid)))) continue;
      if (b.is_container) {
        const children = containerChildrenMap[b.id] || [];
        visited       += children.reduce((s, c) => s + (c.visited || 0), 0);
        totalSections += children.reduce((s, c) => s + ((c.discoverable_sections ?? c.total_sections) || 0), 0);
      } else {
        visited       += b.visited || 0;
        totalSections += (b.discoverable_sections ?? b.total_sections) || 0;
      }
    }
    return { visited, totalSections };
  };

  const stashedBookToStash   = new Map();
  const stashedSeriesToStash = new Map();
  const sortedStashes = [..._cachedStashes].sort((a, b) => naturalCompare(a.name || '', b.name || ''));
  for (const stash of sortedStashes) {
    for (const bid of (stash.bookIds   || [])) stashedBookToStash.set(bid,   stash.id);
    for (const sid of (stash.seriesIds || [])) stashedSeriesToStash.set(sid, stash.id);
  }

  const hiddenContainerIds = new Set(
    books.filter(b => b.is_container && (stashedBookToStash.has(b.id) || (b.series_id && stashedSeriesToStash.has(b.series_id)))).map(b => b.id)
  );
  const allContainerIds = new Set(books.filter(b => b.is_container).map(b => b.id));
  const booksForMain = books.filter(b => {
    const myContainerIds = _containerIdsFor(b);
    const childOfVisibleContainer = myContainerIds.some(pid => allContainerIds.has(pid) && !hiddenContainerIds.has(pid));
    const onlyHiddenContainers    = myContainerIds.length > 0 && myContainerIds.every(pid => hiddenContainerIds.has(pid));
    return (
      !stashedBookToStash.has(b.id) &&
      (childOfVisibleContainer || !(b.series_id && stashedSeriesToStash.has(b.series_id))) &&
      !onlyHiddenContainers
    );
  });
  const visibleSeries = allSeries.filter(s => !stashedSeriesToStash.has(s.id));

  const containerIds = new Set(booksForMain.filter(b => b.is_container).map(b => b.id));
  const childrenMap  = {};
  const childIds     = new Set();
  for (const b of booksForMain) {
    for (const pid of _containerIdsFor(b)) {
      if (containerIds.has(pid)) {
        (childrenMap[pid] ??= []).push(b);
        childIds.add(b.id);
      }
    }
  }
  _sortChildrenMap(childrenMap);

  const topLevel = booksForMain.filter(b => !childIds.has(b.id));
  const seriesIdsInLibrary = new Set(visibleSeries.map(s => s.id));
  const seriesMap = {};
  const noSeries  = [];
  for (const b of topLevel) {
    if (b.series_id && seriesIdsInLibrary.has(b.series_id)) (seriesMap[b.series_id] ??= []).push(b);
  }
  for (const b of topLevel) {
    if (b.series_id && seriesIdsInLibrary.has(b.series_id)) continue;
    noSeries.push(b);
  }

  function _renderContainerItem(b, customChildrenMap = childrenMap) {
    const myChildren = customChildrenMap[b.id] || [];
    // Mobile is reading-only - an anthology with none of its children left
    // after the hasLiveReading cut has nothing to show.
    if (_isMobile() && !myChildren.length) return '';
    const expanded   = _getExpandedPref('book', String(b.id), `bk_expanded_${b.id}`);
    const aggrV = myChildren.reduce((s, c) => s + (c.visited || 0), 0);
    const aggrS = myChildren.reduce((s, c) => s + ((c.discoverable_sections ?? c.total_sections) || 0), 0);
    const out = [_bookItemHtml(b, false, expanded, myChildren.length, { visited: aggrV, totalSections: aggrS }, isAdmin)];
    if (myChildren.length) {
      out.push(`<div class="book-children-group" data-parent="${b.id}" style="${expanded ? '' : 'display:none'}">`);
      for (const child of myChildren) out.push(_bookItemHtml(child, true, false, 0, null, isAdmin, b.id));
      out.push('</div>');
    }
    return out.join('');
  }

  const parts = [];

  function _getSeriesActiveBooksForContext(series, stashId = null) {
    const stash = stashId == null ? null : _cachedStashes.find(x => x.id === stashId);
    const excludedBookIds = new Set(stash?.excludedBookIds || []);
    const stashDirectSeriesBookIds = new Set(
      books.filter(b => !excludedBookIds.has(b.id) && ((stash?.bookIds || []).includes(b.id) || (b.series_id && (stash?.seriesIds || []).includes(b.series_id)))).map(b => b.id)
    );
    const sourcePool = stashId == null
      ? booksForMain
      : books.filter(b => {
          if (excludedBookIds.has(b.id)) return false;
          const inStashByBook      = (stash?.bookIds   || []).includes(b.id);
          const inStashBySeries    = b.series_id && (stash?.seriesIds || []).includes(b.series_id);
          const childOfIncluded    = _containerIdsFor(b).some(pid => stashDirectSeriesBookIds.has(pid));
          return inStashByBook || inStashBySeries || childOfIncluded;
        });
    const baseBooks           = stashId == null ? (seriesMap[series.id] || []) : sourcePool.filter(b => b.series_id === series.id);
    const activeContainerIds  = new Set(baseBooks.filter(b => b.is_container).map(b => b.id));
    const activeBooks         = [...baseBooks];
    const seenIds             = new Set(activeBooks.map(b => b.id));
    for (const b of sourcePool) {
      if (_containerIdsFor(b).some(pid => activeContainerIds.has(pid)) && !seenIds.has(b.id)) { activeBooks.push(b); seenIds.add(b.id); }
    }
    const activeChildrenMap = {};
    const activeChildIds    = new Set();
    for (const b of activeBooks) {
      for (const pid of _containerIdsFor(b)) {
        if (activeContainerIds.has(pid)) { (activeChildrenMap[pid] ??= []).push(b); activeChildIds.add(b.id); }
      }
    }
    _sortChildrenMap(activeChildrenMap);
    return { activeBooks, activeChildrenMap, activeChildIds, topInSeries: _sortSeriesBooks(activeBooks.filter(b => !activeChildIds.has(b.id))) };
  }

  // A container always survives the mobile hasLiveReading cut (it's a
  // folder, not readable content itself) - counting it toward "does this
  // series/stash have anything to show" via plain length/count would give a
  // false positive whenever its own children all got filtered out, since
  // the container itself renders nothing on mobile (its own per-item skip
  // elsewhere). Only a standalone book, or a container that still has
  // surviving children, counts as real renderable content.
  function _hasRenderableTop(topArr, childrenMap) {
    return topArr.some(b => !b.is_container || (childrenMap[b.id] || []).length);
  }

  function _renderSeriesSection(s, stashId = null) {
    const stash = stashId == null ? null : _cachedStashes.find(x => x.id === stashId);
    const excludedBookIds = new Set(stash?.excludedBookIds || []);
    const stashDirectSeriesBookIds = new Set(
      books.filter(b => !excludedBookIds.has(b.id) && ((stash?.bookIds || []).includes(b.id) || (b.series_id && (stash?.seriesIds || []).includes(b.series_id)))).map(b => b.id)
    );
    const sourcePool = stashId == null
      ? booksForMain
      : books.filter(b => {
          if (excludedBookIds.has(b.id)) return false;
          const inStashByBook   = (stash?.bookIds   || []).includes(b.id);
          const inStashBySeries = b.series_id && (stash?.seriesIds || []).includes(b.series_id);
          const childOfIncluded = _containerIdsFor(b).some(pid => stashDirectSeriesBookIds.has(pid));
          return inStashByBook || inStashBySeries || childOfIncluded;
        });
    const baseBooks          = stashId == null ? (seriesMap[s.id] || []) : sourcePool.filter(b => b.series_id === s.id);
    const activeContainerIds = new Set(baseBooks.filter(b => b.is_container).map(b => b.id));
    const activeBooks        = [...baseBooks];
    const seenIds            = new Set(activeBooks.map(b => b.id));
    for (const b of sourcePool) {
      if (_containerIdsFor(b).some(pid => activeContainerIds.has(pid)) && !seenIds.has(b.id)) { activeBooks.push(b); seenIds.add(b.id); }
    }
    const activeChildrenMap = {};
    const activeChildIds    = new Set();
    for (const b of activeBooks) {
      for (const pid of _containerIdsFor(b)) {
        if (activeContainerIds.has(pid)) { (activeChildrenMap[pid] ??= []).push(b); activeChildIds.add(b.id); }
      }
    }
    _sortChildrenMap(activeChildrenMap);
    const topInSeries   = _sortSeriesBooks(activeBooks.filter(b => !activeChildIds.has(b.id)));
    const booksInSeries = activeBooks;
    // Mobile is reading-only - a series with nothing actually renderable
    // left after the hasLiveReading cut has nowhere useful for the "browse
    // series" hint below to send you either, so skip the whole section
    // (header included) rather than showing an empty shell.
    if (_isMobile() && !_hasRenderableTop(topInSeries, activeChildrenMap)) return;
    const keyPrefix     = stashId ? `stash_${stashId}_sr_` : 'sr_';
    const expanded      = _getExpandedPref('series', `${stashId ?? 'main'}:${s.id}`, `${keyPrefix}expanded_${s.id}`);
    const { visited: aggrV, totalSections: aggrS } = _aggregateProgress(booksInSeries, activeChildrenMap);
    const pct       = aggrS > 0 ? (aggrV >= aggrS ? 100 : Math.min(99, Math.floor(aggrV / aggrS * 100))) : 0;
    const fullyDone = aggrS > 0 && aggrV >= aggrS;
    const barColor  = fullyDone ? 'rgba(34,197,94,0.6)' : 'rgba(245,166,35,0.5)';
    const countLabel  = activeBooks.length === 1 ? '1 book' : `${activeBooks.length} books`;
    const sectLabel   = aggrS > 0 ? ` · ${aggrS} sections` : '';
    parts.push(
      `<div class="series-header-row" data-series-id="${s.id}" data-expanded="${expanded ? '1' : '0'}" data-stash-id="${stashId ?? ''}" data-open-world="${s.is_open_world ? '1' : '0'}">` +
        `<span class="series-header-chevron">▶</span>` +
        `<span class="series-header-name" data-tooltip="${escapeHtml(s.name)}">${escapeHtml(s.name)}${s.is_open_world ? ` <span class="series-open-world-badge" data-tooltip="${escapeHtml(t('covers.open_world_series'))}"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span>` : ''}</span>` +
        `<span class="series-header-count">${activeBooks.length ? countLabel + sectLabel : 'no books yet'}</span>` +
        (s.is_owner
          ? `<button class="series-edit-btn" data-series-id="${s.id}" data-series-name="${escapeHtml(s.name)}" data-series-desc="${escapeHtml(s.description || '')}" data-series-public="${s.is_public ? '1' : '0'}" data-series-open-world="${s.is_open_world ? '1' : '0'}">✎</button>`
          : isAdmin
            ? `<button class="series-edit-btn series-edit-btn--admin" data-tooltip="Admin edit" data-series-id="${s.id}" data-series-name="${escapeHtml(s.name)}" data-series-desc="${escapeHtml(s.description || '')}" data-series-public="${s.is_public ? '1' : '0'}" data-series-open-world="${s.is_open_world ? '1' : '0'}">✎</button>`
            : `<span data-tooltip="${t('books.only_creator_can_edit')}" style="display:inline-flex"><button class="series-edit-btn" disabled>✎</button></span>`
        ) +
        `<button class="series-del-btn" data-series-id="${s.id}" data-series-name="${escapeHtml(s.name)}" data-series-owner="${s.is_owner ? '1' : '0'}" data-tooltip="${s.is_owner ? t('books.delete_series') : t('books.remove_from_library')}">✕</button>` +
        `<div class="series-header-bar" style="width:${pct}%;background:${barColor}"></div>` +
      `</div>`
    );
    parts.push(`<div class="series-books-group" data-series-id="${s.id}" data-stash-id="${stashId ?? ''}" style="${expanded ? '' : 'display:none'}">`);
    if (booksInSeries.length) {
      for (const b of topInSeries) parts.push(b.is_container ? _renderContainerItem(b, activeChildrenMap) : _bookItemHtml(b, false, false, 0, null, isAdmin));
    } else {
      parts.push(`<div class="series-empty-hint">${t('books.series_empty_hint')} <button class="series-browse-btn" data-series-id="${s.id}" data-series-name="${escapeHtml(s.name)}">${t('books.browse_series')}</button></div>`);
    }
    parts.push('</div>');
  }

  // ── Stash sections ──────────────────────────────────────────────────────────
  for (const stash of sortedStashes) {
    const excludedBookIds      = new Set(stash.excludedBookIds || []);
    const stashSeries          = _sortedByName(allSeries.filter(s => (stash.seriesIds || []).includes(s.id)));
    const explicitStashBooks   = books.filter(b => !excludedBookIds.has(b.id) && (stash.bookIds || []).includes(b.id) && !(b.series_id && (stash.seriesIds || []).includes(b.series_id)));
    const explicitContainerIds = new Set(explicitStashBooks.filter(b => b.is_container).map(b => b.id));
    const stashBooksRaw        = [...explicitStashBooks];
    const stashSeenBookIds     = new Set(stashBooksRaw.map(b => b.id));
    for (const b of books) {
      if (!excludedBookIds.has(b.id) && _containerIdsFor(b).some(pid => explicitContainerIds.has(pid)) && !stashSeenBookIds.has(b.id)) {
        stashBooksRaw.push(b); stashSeenBookIds.add(b.id);
      }
    }
    const stashContainerIds = new Set(stashBooksRaw.filter(b => b.is_container).map(b => b.id));
    const stashChildrenMap  = {};
    const stashChildIds     = new Set();
    for (const b of stashBooksRaw) {
      for (const pid of _containerIdsFor(b)) {
        if (stashContainerIds.has(pid)) { (stashChildrenMap[pid] ??= []).push(b); stashChildIds.add(b.id); }
      }
    }
    _sortChildrenMap(stashChildrenMap);
    const stashBooksTop  = stashBooksRaw.filter(b => !stashChildIds.has(b.id));
    const stashContainers  = _sortBooks(stashBooksTop.filter(b =>  b.is_container));
    const stashStandalone  = _sortBooks(stashBooksTop.filter(b => !b.is_container));
    const stashExpanded    = _getExpandedPref('stash', String(stash.id), `stash_expanded_${stash.id}`);
    let stashHasAnyBooks = false;
    const stashSeriesItemCount = stashSeries.reduce((sum, s) => {
      const { activeBooks, activeChildrenMap, topInSeries } = _getSeriesActiveBooksForContext(s, stash.id);
      if (_hasRenderableTop(topInSeries, activeChildrenMap)) stashHasAnyBooks = true;
      return sum + 1 + activeBooks.length;
    }, 0);
    // Not stashBooksRaw.length - a container in there always survives the
    // hasLiveReading cut (it's a folder, not readable content itself), so
    // a stash holding only a now-empty anthology would still count as
    // non-empty by raw length even though stashContainers' own per-item
    // skip (below) hides that container entirely, leaving nothing actually
    // rendered. Standalone books are real content on their own; a container
    // only counts if it still has surviving children to show.
    if (stashStandalone.length) stashHasAnyBooks = true;
    if (stashContainers.some(c => (stashChildrenMap[c.id] || []).length)) stashHasAnyBooks = true;
    // Mobile is reading-only - a stash whose books (direct or via its
    // series) all got dropped by the hasLiveReading cut has nothing left to
    // show. Checked separately from stashItemCount below, which counts each
    // series header as "1 item" regardless of whether that series itself
    // has any books left - a stash holding only now-empty series would
    // otherwise read as non-empty and still get rendered.
    if (_isMobile() && !stashHasAnyBooks) continue;
    const stashItemCount = stashSeriesItemCount + stashBooksRaw.length;
    const stashCountLabel = stashItemCount === 1 ? '1 item' : `${stashItemCount} items`;
    let stashAggrV = 0, stashAggrS = 0;
    for (const s of stashSeries) {
      const { activeBooks, activeChildrenMap } = _getSeriesActiveBooksForContext(s, stash.id);
      const { visited, totalSections } = _aggregateProgress(activeBooks, activeChildrenMap);
      stashAggrV += visited; stashAggrS += totalSections;
    }
    const stashDirectProgress = _aggregateProgress(stashBooksRaw, stashChildrenMap);
    stashAggrV += stashDirectProgress.visited;
    stashAggrS += stashDirectProgress.totalSections;
    const stashPct      = stashAggrS > 0 ? (stashAggrV >= stashAggrS ? 100 : Math.min(99, Math.floor(stashAggrV / stashAggrS * 100))) : 0;
    const stashFullyDone = stashAggrS > 0 && stashAggrV >= stashAggrS;
    const stashBarColor = stashFullyDone ? 'rgba(34,197,94,0.6)' : 'rgba(52,211,153,0.5)';
    parts.push(
      `<div class="stash-block" data-stash-id="${stash.id}">` +
      `<div class="stash-header-row" data-stash-id="${stash.id}" data-expanded="${stashExpanded ? '1' : '0'}">` +
        `<span class="stash-header-chevron">▶</span>` +
        `<span class="stash-header-name">${escapeHtml(stash.name)}</span>` +
        `<span class="stash-header-count">${stashCountLabel}</span>` +
        `<button class="stash-edit-btn" data-stash-id="${stash.id}" data-stash-name="${escapeHtml(stash.name)}" data-tooltip="Edit stash">✎</button>` +
        `<button class="stash-del-btn" data-stash-id="${stash.id}" data-stash-name="${escapeHtml(stash.name)}" data-tooltip="Delete stash">✕</button>` +
        `<div class="stash-header-bar" style="width:${stashPct}%;background:${stashBarColor}"></div>` +
      `</div>`
    );
    parts.push(`<div class="stash-items-group" data-stash-id="${stash.id}" style="${stashExpanded ? '' : 'display:none'}">`);
    for (const s of stashSeries) _renderSeriesSection(s, stash.id);
    for (const b of stashContainers) {
      const myChildren = stashChildrenMap[b.id] || [];
      if (_isMobile() && !myChildren.length) continue;
      const expanded   = _getExpandedPref('book', String(b.id), `bk_expanded_${b.id}`);
      const aggrV = myChildren.reduce((sum, c) => sum + (c.visited || 0), 0);
      const aggrS = myChildren.reduce((sum, c) => sum + ((c.discoverable_sections ?? c.total_sections) || 0), 0);
      parts.push(_bookItemHtml(b, false, expanded, myChildren.length, { visited: aggrV, totalSections: aggrS }, isAdmin));
      if (myChildren.length) {
        parts.push(`<div class="book-children-group" data-parent="${b.id}" style="${expanded ? '' : 'display:none'}">`);
        for (const child of myChildren) parts.push(_bookItemHtml(child, true, false, 0, null, isAdmin, b.id));
        parts.push('</div>');
      }
    }
    for (const b of stashStandalone) parts.push(_bookItemHtml(b, false, false, 0, null, isAdmin));
    parts.push('</div></div>');
  }

  // ── Series sections ─────────────────────────────────────────────────────────
  for (const s of visibleSeries) _renderSeriesSection(s);

  // ── No-series: containers then standalone ───────────────────────────────────
  for (const b of _sortBooks(noSeries.filter(b =>  b.is_container))) parts.push(_renderContainerItem(b));
  for (const b of _sortBooks(noSeries.filter(b => !b.is_container))) parts.push(_bookItemHtml(b, false, false, 0, null, isAdmin));

  list.innerHTML = parts.join('');

  // ── Event wiring ────────────────────────────────────────────────────────────
  list.querySelectorAll('.series-edit-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _hooks.openEditSeriesModal?.(+btn.dataset.seriesId, btn.dataset.seriesName, btn.dataset.seriesDesc, btn.dataset.seriesPublic === '1', btn.dataset.seriesOpenWorld === '1');
    });
  });

  list.querySelectorAll('.series-del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id   = +btn.dataset.seriesId;
      const name = btn.dataset.seriesName;
      showTwoChoice(
        t('books.remove_series_confirm', { name }),
        t('books.delete_series'),          async () => { await apiFetch(`/api/series/${id}?cascade=0`, { method: 'DELETE' }); _refreshBooksListOnly(); },
        t('books.delete_series_contents'), async () => { await apiFetch(`/api/series/${id}?cascade=1`, { method: 'DELETE' }); _refreshBooksListOnly(); }
      );
    });
  });

  list.querySelectorAll('.series-browse-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openSeriesActivity(+btn.dataset.seriesId, btn.dataset.seriesName); });
  });

  list.querySelectorAll('.stash-del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      showConfirm(t('books.delete_stash_confirm', { name: btn.dataset.stashName }), async () => {
        await apiFetch(`/api/stashes/${+btn.dataset.stashId}`, { method: 'DELETE' });
        await _refreshBooksListOnly();
      });
    });
  });

  list.querySelectorAll('.stash-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); _hooks.openEditStash?.(+btn.dataset.stashId); });
  });

  list.querySelectorAll('.stash-header-row').forEach(row => {
    row.addEventListener('click', e => {
      if (_justRevealedBooks()) return;
      if (e.target.closest('.stash-del-btn') || e.target.closest('.stash-edit-btn')) return;
      const sid      = row.dataset.stashId;
      const group    = list.querySelector(`.stash-items-group[data-stash-id="${sid}"]`);
      const nowExpanded = row.dataset.expanded !== '1';
      row.dataset.expanded = nowExpanded ? '1' : '0';
      if (group) group.style.display = nowExpanded ? '' : 'none';
      _saveExpandedPref('stash', String(sid), `stash_expanded_${sid}`, nowExpanded);
      if (nowExpanded && group) _queueBookCovers(group, { reset: false });
      _scheduleAnthologyCardCoverFlows(list);
    });
  });

  list.querySelectorAll('.series-header-row').forEach(row => {
    row.addEventListener('click', e => {
      if (_justRevealedBooks()) return;
      if (e.target.closest('.series-edit-btn') || e.target.closest('.series-del-btn')) return;
      const sid     = row.dataset.seriesId;
      const stashId = row.dataset.stashId || '';
      const group   = list.querySelector(`.series-books-group[data-series-id="${sid}"][data-stash-id="${stashId}"]`);
      const nowExpanded = row.dataset.expanded !== '1';
      row.dataset.expanded = nowExpanded ? '1' : '0';
      if (group) group.style.display = nowExpanded ? '' : 'none';
      _saveExpandedPref('series', `${stashId || 'main'}:${sid}`, `${stashId ? `stash_${stashId}_sr_` : 'sr_'}expanded_${sid}`, nowExpanded);
      if (nowExpanded && group) _queueBookCovers(group, { reset: false });
      _scheduleAnthologyCardCoverFlows(list);
    });
  });

  list.querySelectorAll('.book-item--container').forEach(row => {
    row.addEventListener('click', e => {
      if (_justRevealedBooks()) return;
      if (e.target.closest('.book-secondary-actions')) return;
      if (e.target.closest('.star-rating')) return;
      const bid = row.dataset.containerId;
      const group = list.querySelector(`.book-children-group[data-parent="${bid}"]`);
      const nowExpanded = row.dataset.expanded !== '1';
      row.dataset.expanded = nowExpanded ? '1' : '0';
      if (group) group.style.display = nowExpanded ? '' : 'none';
      _saveExpandedPref('book', String(bid), `bk_expanded_${bid}`, nowExpanded);
      if (nowExpanded && group) _queueBookCovers(group, { reset: false });
      _scheduleAnthologyCardCoverFlows(list);
    });
  });

  list.querySelectorAll('.book-name-text').forEach(btn =>
    btn.addEventListener('click', () => {
      // Demo books are client-only fake IDs (e.g. "demo_1") with no server-side
      // public activity to show - +id would be NaN and 404.
      if (isDemoMode) return;
      if (!btn.closest('.book-item--container')) openCoverActivity(+btn.dataset.id, btn.dataset.name);
    })
  );

  list.querySelectorAll('.book-open-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const id = /^\d+$/.test(btn.dataset.id) ? +btn.dataset.id : btn.dataset.id;
      // showMain() unconditionally bounces every mobile visit back to this
      // same books list (see boot.js) - it's a no-op here, which is exactly
      // why "Open" looked like it did nothing. /mobile (admin-only preview)
      // is the real destination for a mobile admin now.
      if (_isMobile() && _hooks.getIsAdmin?.()) { window.location.href = `/mobile?book=${encodeURIComponent(id)}`; return; }
      _hooks.showMain?.(id, btn.dataset.isbn || null, btn.dataset.issn || null, btn.dataset.asin || null,
        btn.dataset.cover || btn.dataset.parentCover || null, btn.dataset.pdf || null,
        btn.dataset.pages ? Number(btn.dataset.pages) : null, btn.dataset.authors || null,
        btn.dataset.description || null, btn.dataset.discoverable ? +btn.dataset.discoverable : null,
        btn.dataset.public === '1', btn.dataset.creator === '1', btn.dataset.series || null,
        btn.dataset.seriesNum || null, btn.dataset.isContainer === '1',
        btn.dataset.parentId ? +btn.dataset.parentId : null, btn.dataset.bookOrder ? +btn.dataset.bookOrder : null);
    })
  );

  list.querySelectorAll('.book-edit-btn').forEach(btn =>
    btn.addEventListener('click', async () => {
      const bid         = btn.dataset.id;
      const isContainer = btn.dataset.isContainer === '1';

      if (isContainer) {
        _hooks.openEditCompModal?.({
          bookId:              +bid,
          initialName:         btn.dataset.name,
          initialIsbn:         btn.dataset.isbn,
          initialIssn:         btn.dataset.issn,
          initialAsin:         btn.dataset.asin,
          initialCoverUrl:     btn.dataset.cover || null,
          initialPdfPath:      btn.dataset.pdf || null,
          initialPdfSize:      btn.dataset.pdfSize ? +btn.dataset.pdfSize : null,
          initialPages:        btn.dataset.pages || '',
          initialAuthors:      btn.dataset.authors || '',
          initialDescription:  btn.dataset.description || '',
          initialSeriesName:   btn.dataset.series || '',
          initialSeriesNumber: btn.dataset.seriesNum || '',
          initialIsPublic:     btn.dataset.public === '1',
          onSave: async (name, isbn, issn, asin, pages, authors, description, isPublic, seriesName, seriesNum) => {
            try {
              await apiFetch(`/api/books/${bid}`, {
                method: 'PATCH',
                body:   JSON.stringify({ name, total_sections: 0, isbn: isbn || null, issn: issn || null, asin: asin || null, pages: pages || null, authors: authors || null, description: description || null, is_public: isPublic, series_name: seriesName || null, series_number: seriesNum || null, is_container: 1 }),
              });
              if (_booksListDisplayChanged(bid, { name, sections: 0, discoverableSections: null, isPublic, seriesName, seriesNumber: seriesNum, isContainer: true, parentId: null, bookOrder: null })) {
                await _refreshLibraryUi({ feed: true });
              } else {
                _patchCachedBook(bid, { isbn: isbn || null, issn: issn || null, asin: asin || null, pages: pages || null, authors: authors || null, description: description || null });
                await Promise.allSettled([_hooks.loadFeed?.()]);
              }
            } catch (_) {
              document.getElementById('ecc-error').textContent = t('err.save');
            }
          },
        });
        return;
      }

      let min = 20, hitWall = false, discCount = 0;
      if (isDemoMode) {
        const saved = getDemoState(bid);
        if (saved) min = Math.max(5, _hooks.maxSectionInUse?.(saved) ?? 5);
      } else {
        try {
          const res       = await apiFetch(`/api/books/${bid}/state`);
          const bookState = await res.json();
          min = Math.max(5, _hooks.maxSectionInUse?.(bookState) ?? 5);
          const mapped = _hooks.mappedCountFor?.(bookState?.graph) || 0;
          const disc   = _hooks.discoveredSectionsFor?.(bookState?.graph, bookState?.playthroughs, bookState?.startSection) || new Set();
          const total  = +btn.dataset.sections;
          hitWall   = mapped > 0 && mapped === disc.size && mapped < total;
          discCount = disc.size;
        } catch (_) {}
      }

      _hooks.openEditBookModal?.({
        bookId:                     isDemoMode ? bid : +bid,
        initialName:                btn.dataset.name,
        initialSections:            +btn.dataset.sections,
        initialIsbn:                btn.dataset.isbn,
        initialIssn:                btn.dataset.issn,
        initialAsin:                btn.dataset.asin,
        initialCoverUrl:            btn.dataset.cover || null,
        initialPdfPath:             btn.dataset.pdf || null,
        initialPdfSize:             btn.dataset.pdfSize ? +btn.dataset.pdfSize : null,
        initialPages:               btn.dataset.pages || '',
        initialAuthors:             btn.dataset.authors || '',
        initialDescription:         btn.dataset.description || '',
        initialDiscoverableSections: btn.dataset.discoverable ? +btn.dataset.discoverable : null,
        showDiscoverableSections:   hitWall,
        discoverableHint:           discCount,
        minSections:                min,
        initialIsPublic:            btn.dataset.public === '1',
        initialSeriesName:          btn.dataset.series || '',
        initialSeriesNumber:        btn.dataset.seriesNum || '',
        initialParentBookId:        btn.dataset.parentId ? +btn.dataset.parentId : null,
        initialBookOrder:           btn.dataset.bookOrder ? +btn.dataset.bookOrder : null,
        onSave: async (name, sections, isbn, issn, asin, pages, authors, description, discoverableSections, isPublic, seriesName, seriesNumber, _isContainer, parentId, bookOrder) => {
          if (isDemoMode) {
            const demoBooks = _hooks.getDemoBooks?.() || [];
            const book = demoBooks.find(b => b.id === bid);
            if (book) { book.name = name; book.total_sections = sections; book.isbn = isbn || null; book.issn = issn || null; book.asin = asin || null; book.pages = pages || null; book.authors = authors || null; book.description = description || null; }
            const saved = getDemoState(bid);
            if (saved) { saved.bookName = name; saved.totalSections = sections; setDemoState(bid, saved); }
            await _hooks.showBooks?.();
            return;
          }
          try {
            await apiFetch(`/api/books/${bid}`, {
              method: 'PATCH',
              body:   JSON.stringify({ name, total_sections: sections, isbn: isbn || null, issn: issn || null, asin: asin || null, pages: pages || null, authors: authors || null, description: description || null, discoverable_sections: discoverableSections ?? null, is_public: isPublic, series_name: seriesName || null, series_number: seriesNumber || null, is_container: 0, parent_book_id: parentId || null, book_order: bookOrder ?? null }),
            });
            if (_booksListDisplayChanged(bid, { name, sections, discoverableSections, isPublic, seriesName, seriesNumber, isContainer: false, parentId, bookOrder })) {
              await _refreshLibraryUi({ feed: true });
            } else {
              _patchCachedBook(bid, { isbn: isbn || null, issn: issn || null, asin: asin || null, pages: pages || null, authors: authors || null, description: description || null });
              await Promise.allSettled([_hooks.loadFeed?.()]);
            }
          } catch (_) {
            document.getElementById('edit-book-error').textContent = t('err.save');
          }
        },
      });
    })
  );

  list.querySelectorAll('.book-del-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const id          = btn.dataset.id;
      const name        = btn.dataset.name;
      const isContainer = btn.dataset.container === '1';
      const inSeries    = !!btn.closest('.series-books-group');
      const cachedBook  = (_cachedBooks || []).find(b => String(b.id) === String(id));

      const doRemoveFromSeries = async () => {
        if (!cachedBook) return;
        try {
          await apiFetch(`/api/books/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              name: cachedBook.name, total_sections: cachedBook.is_container ? 0 : cachedBook.total_sections,
              isbn: cachedBook.isbn || null, issn: cachedBook.issn || null, asin: cachedBook.asin || null,
              pages: cachedBook.pages || null, authors: cachedBook.authors || null, description: cachedBook.description || null,
              discoverable_sections: cachedBook.discoverable_sections ?? null, is_public: !!cachedBook.is_public,
              series_name: null, series_number: null, is_container: cachedBook.is_container ? 1 : 0,
              parent_book_id: cachedBook.parent_book_id || null, book_order: cachedBook.book_order ?? null,
            }),
          });
          await _refreshLibraryUi({ feed: true });
        } catch (_) {}
      };

      const doDelete = async (cascade) => {
        if (isDemoMode) {
          const demoBooks = _hooks.getDemoBooks?.() || [];
          _hooks.setDemoBooks?.(demoBooks.filter(b => b.id !== id));
          await _hooks.showBooks?.();
          return;
        }
        try {
          await apiFetch(`/api/books/${id}?cascade=${cascade ? '1' : '0'}`, { method: 'DELETE' });
          await _refreshBooksListOnly();
        } catch (_) {}
      };

      if (inSeries && cachedBook?.series_id) { showConfirm(t('books.remove_from_series_confirm', { name }), doRemoveFromSeries); return; }
      if (isContainer) {
        showTwoChoice(t('books.remove_anthology_confirm', { name }),
          t('books.delete_anthology'),          () => doDelete(false),
          t('books.delete_anthology_contents'), () => doDelete(true)
        );
      } else {
        showConfirm(t('confirm.delete_book', { name }), () => doDelete(true));
      }
    })
  );

  if (!isDemoMode) {
    list.querySelectorAll('.book-rating-row').forEach(row => {
      const bookId = +row.dataset.bookId;
      const cached = () => _cachedBooks?.find(b => b.id === bookId);
      let myRating = parseFloat(row.dataset.userRating) || null;
      let curAvg   = cached()?.avgRating ?? null;
      let curCount = cached()?.voteCount ?? 0;
      const stars  = row.querySelectorAll('.star');
      const lbl    = row.querySelector('.star-label');

      const updateStars = (hoverVal) => {
        const displayVal = hoverVal !== null ? hoverVal : curAvg;
        stars.forEach(s => {
          const p = +s.dataset.pos;
          s.className = (displayVal !== null && displayVal >= p) ? 'star on'
                      : (displayVal !== null && displayVal >= p - 0.5) ? 'star half'
                      : 'star';
        });
        lbl.innerHTML = hoverVal !== null
          ? `<span class="star-avg">${hoverVal % 1 === 0 ? hoverVal.toFixed(1) : hoverVal}</span>`
          : _starLabelHtml(curAvg, curCount);
      };

      stars.forEach(star => {
        star.addEventListener('mousemove', e => { const left = e.offsetX < star.offsetWidth / 2; updateStars(+star.dataset.pos - (left ? 0.5 : 0)); });
        star.addEventListener('click', async e => {
          const left      = e.offsetX < star.offsetWidth / 2;
          const newRating = +star.dataset.pos - (left ? 0.5 : 0);
          const toSave    = newRating === myRating ? null : newRating;
          const prevRating = myRating;
          myRating = toSave;
          row.dataset.userRating = toSave ?? '';
          try {
            const res = await apiFetch(`/api/books/${bookId}/rating`, { method: 'PATCH', body: JSON.stringify({ rating: toSave }) });
            if (res.ok) {
              const data = await res.json();
              curAvg = data.avgRating; curCount = data.voteCount;
              const c = cached(); if (c) { c.userRating = toSave; c.avgRating = curAvg; c.voteCount = curCount; }
              updateStars(null);
              if (data.xpAwarded) refreshCoinsDisplay();
            } else if (res.status === 403) {
              myRating = prevRating; row.dataset.userRating = prevRating ?? '';
              updateStars(null);
              const errData = await res.json().catch(() => ({}));
              _flashRatingGate(row, errData.error || 'Complete a run first to rate');
            }
          } catch {}
        });
      });
      row.addEventListener('mouseleave', () => updateStars(null));
    });
  }

  _applyBooksSearchFilter();
  _scheduleAnthologyCardCoverFlows(list);
  _queueBookCovers(list);
}

// ── Module-level window listeners ─────────────────────────────────────────────
window.addEventListener('resize', () => _scheduleAnthologyCardCoverFlows());
window.addEventListener('book-state-saved', () => {
  _scheduleBooksListRefresh();
  _hooks.scheduleRewardProfileRefresh?.();
});

// ── Init (wires search bar DOM events) ───────────────────────────────────────
export function initBooksPanel() {
  document.getElementById('books-search-toggle').addEventListener('click', () => _setBooksSearchOpen(true));
  document.getElementById('books-search-close').addEventListener('click',  () => _setBooksSearchOpen(false));
  document.getElementById('books-search-input').addEventListener('input', e => {
    _booksSearchQuery = e.target.value || '';
    if (_booksSearchQuery.trim() && getToken() && !isDemoMode && !_booksDataFresh) _refreshBooksListOnly();
    _scheduleApplyBooksSearchFilter();
  });
  document.getElementById('books-search-input').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); _setBooksSearchOpen(false); }
  });
}
