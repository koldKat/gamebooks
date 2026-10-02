import { booksState } from './state.js';
import { _refreshBooksListOnly } from './data.js';
import { _scheduleAnthologyCardCoverFlows, _queueBookCovers } from './covers.js';
import { _materializeLazyGroup } from './lazy.js';
import { getToken, isDemoMode } from '../core/state.js';
import { foldForSearch } from '../core/sort.js';
import { t } from '../i18n.js';

let _booksSearchOpen = false;
let _booksSearchQuery = '';
let _booksSearchApplyTimer = null;

// ── Search / filter ───────────────────────────────────────────────────────────
export function _setBooksSearchOpen(open) {
  _booksSearchOpen = !!open;
  document.body.classList.toggle('books-searching', _booksSearchOpen);
  const input = document.getElementById('books-search-input');
  if (_booksSearchOpen) {
    if (getToken() && !isDemoMode && !booksState._booksDataFresh) _refreshBooksListOnly();
    if (input) { input.value = _booksSearchQuery; input.focus(); input.select(); }
  } else {
    _booksSearchQuery = '';
    if (input) input.value = '';
    _applyBooksSearchFilter();
  }
}

export function _booksSearchBlob(el) {
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

export function _booksSearchMatches(el, query) {
  if (!query) return true;
  return _booksSearchBlob(el).includes(query);
}

export function _restoreBooksSearchFilter(list) {
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

export function _filterContainerRow(row, childrenGroup, query, forceShowAll = false) {
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

export function _filterBooksGroup(group, query, forceShowAll = false) {
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
      const visible = _filterContainerRow(node, childGroup, query, forceShowAll);
      anyVisible ||= visible;
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

  // Search matches against DOM text/data-* attributes, so collapsed lazy
  // groups must exist in the DOM before filtering - materialize them all.
  // Materializing a group can register NEW lazy builders for groups nested
  // inside it (a collapsed series within a collapsed stash), so loop until
  // none remain rather than walking a static snapshot.
  let lazyGroup;
  while ((lazyGroup = list.querySelector('[data-lazy-group],[data-materializing-group]'))) _materializeLazyGroup(lazyGroup, { immediate: true });

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
      const visible = _filterContainerRow(node, childGroup, query);
      anyVisible ||= visible;
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

// ── Init (wires search bar DOM events) ───────────────────────────────────────
export function initBooksPanel() {
  document.getElementById('books-search-toggle').addEventListener('click', () => _setBooksSearchOpen(true));
  document.getElementById('books-search-close').addEventListener('click',  () => _setBooksSearchOpen(false));
  document.getElementById('books-search-input').addEventListener('input', e => {
    _booksSearchQuery = e.target.value || '';
    if (_booksSearchQuery.trim() && getToken() && !isDemoMode && !booksState._booksDataFresh) _refreshBooksListOnly();
    _scheduleApplyBooksSearchFilter();
  });
  document.getElementById('books-search-input').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); _setBooksSearchOpen(false); }
  });
}
