import { _sortedByName } from './helpers.js';
import { booksState, _BOOKS_LS_KEY, _SERIES_LS_KEY, _STASHES_LS_KEY } from './state.js';
import { _getExpandedPref, _syncMovedSeriesPrefs } from './prefs.js';
import { _scheduleAnthologyCardCoverFlows, _queueBookCovers } from './covers.js';
import { lazyState, _materializeLazyGroup } from './lazy.js';
import { _applyBooksSearchFilter } from './search.js';
import { _bookItemHtml } from './markup.js';
import { _containerIdsFor, _sortChildrenMap, _sortBooks, _sortSeriesBooks, _aggregateProgress } from './groups.js';
import { _wireRenderedContent } from './actions.js';
import { naturalCompare } from '../core/sort.js';
import { _startLandingCoverRotation, _resetLandingCoverQueue, _effectiveLandingCoverSource } from '../covers.js';
import { t } from '../i18n.js';
import { escapeHtml } from '../core/util.js';
import { updateBooksList } from './update.js';

// ── Main render ───────────────────────────────────────────────────────────────
export function renderBooksList(allOwnedBooks, allSeries = [], stashes = []) {
  if (!Array.isArray(allOwnedBooks)) return;
  // Stable keys let preserved groups use builders backed by the latest cache.
  lazyState.builders.clear();
  lazyState.sequence = 0;
  const openWorldSeriesIds = new Set((allSeries || []).filter(s => s.is_open_world).map(s => s.id));
  for (const b of allOwnedBooks) b.isOpenWorld = b.series_id != null && openWorldSeriesIds.has(b.series_id);
  _syncMovedSeriesPrefs(Array.isArray(stashes) ? stashes : []);
  // Cache the full owned library before applying mobile reading filters.
  booksState._cachedBooks     = allOwnedBooks;
  booksState._cachedAllSeries = allSeries;
  booksState._cachedStashes   = Array.isArray(stashes) ? stashes : [];
  try { localStorage.setItem(_BOOKS_LS_KEY,   JSON.stringify(allOwnedBooks));   } catch (_) {}
  try { localStorage.setItem(_SERIES_LS_KEY,  JSON.stringify(allSeries));       } catch (_) {}
  try { localStorage.setItem(_STASHES_LS_KEY, JSON.stringify(booksState._cachedStashes));  } catch (_) {}
  if (_effectiveLandingCoverSource() === 'mine') { _resetLandingCoverQueue(); _startLandingCoverRotation(); }

  const books = allOwnedBooks;

  const isAdmin = booksState._hooks.getIsAdmin?.() ?? false;
  const isModerator = !isAdmin && !!booksState._hooks.getIsModerator?.();
  const list = document.getElementById('books-list');
  const fingerprint = (...data) => JSON.stringify([isAdmin, isModerator, booksState._currentUserId,
    booksState._hooks.getHasPdfAccess?.() ?? false, booksState._activeSeriesRuns, ...data]);
  const containerExpansion = items => Object.fromEntries(items.filter(b => b.is_container).map(b =>
    [`book:${b.id}`, _getExpandedPref('book', String(b.id), `bk_expanded_${b.id}`) ? '1' : '0']));
  const seriesExpansion = (series, stashId = null) => {
    const { activeBooks } = _getSeriesActiveBooksForContext(series, stashId);
    _registerSeriesBuilder(series, stashId);
    return { ...containerExpansion(activeBooks),
      [`series:${stashId ?? 'main'}:${series.id}`]:
        _getExpandedPref('series', `${stashId ?? 'main'}:${series.id}`, `${stashId ? `stash_${stashId}_sr_` : 'sr_'}expanded_${series.id}`) ? '1' : '0' };
  };

  if (!books.length && !allSeries.length && !booksState._cachedStashes.length) {
    updateBooksList(list, [{ key: 'empty', html: `<p class="books-empty">${t('books.empty')}</p>` }]);
    _queueBookCovers(list);
    return;
  }

  const stashedBookToStash   = new Map();
  const stashedSeriesToStash = new Map();
  const sortedStashes = [...booksState._cachedStashes].sort((a, b) => naturalCompare(a.name || '', b.name || ''));
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

  function _registerContainerBuilder(b, customChildrenMap, context) {
    const key = `children:${context}:${b.id}`;
    const children = customChildrenMap[b.id] || [];
    lazyState.builders.set(key, ({ incremental = false } = {}) => {
      const items = (function* () {
        for (const child of children) yield _bookItemHtml(child, true, false, 0, null, isAdmin, b.id);
      })();
      return incremental && children.length > 12 ? items : Array.from(items);
    });
    return key;
  }

  function _renderContainerItem(b, customChildrenMap = childrenMap, context = 'main', deferExpanded = false) {
    const myChildren = customChildrenMap[b.id] || [];
    const expanded   = _getExpandedPref('book', String(b.id), `bk_expanded_${b.id}`);
    const aggrV = myChildren.reduce((s, c) => s + (c.visited || 0), 0);
    const aggrS = myChildren.reduce((s, c) => s + ((c.discoverable_sections ?? c.total_sections) || 0), 0);
    const out = [_bookItemHtml(b, false, expanded, myChildren.length, { visited: aggrV, totalSections: aggrS }, isAdmin)];
    if (myChildren.length) {
      const childKey = _registerContainerBuilder(b, customChildrenMap, context);
      if (expanded && !deferExpanded && myChildren.length <= 12) {
        // Inline but tagged with data-lazy-key so a later collapse can reclaim it.
        out.push(`<div class="book-children-group" data-parent="${b.id}" data-lazy-key="${childKey}">`);
        for (const child of myChildren) out.push(_bookItemHtml(child, true, false, 0, null, isAdmin, b.id));
        out.push('</div>');
      } else {
        out.push(`<div class="book-children-group" data-parent="${b.id}" data-lazy-group="${childKey}"${expanded ? '' : ' style="display:none"'}></div>`);
      }
    }
    return out.join('');
  }

  const blocks = [];
  // Membership and sorted groups are shared by counts, progress, fingerprints
  // and lazy builders for this render, rather than rescanning the library each time.
  const seriesContexts = new Map();
  const pools = new Map();
  function contextPool(stashId) {
    if (pools.has(stashId)) return pools.get(stashId);
    const stash = booksState._cachedStashes.find(x => x.id === stashId);
    const excluded = new Set(stash?.excludedBookIds || []);
    const bookIds = new Set(stash?.bookIds || []);
    const seriesIds = new Set(stash?.seriesIds || []);
    const direct = new Set(books.filter(b => !excluded.has(b.id) &&
      (bookIds.has(b.id) || seriesIds.has(b.series_id))).map(b => b.id));
    const source = stashId == null ? booksForMain : books.filter(b => !excluded.has(b.id) &&
      (direct.has(b.id) || _containerIdsFor(b).some(id => direct.has(id))));
    const bySeries = new Map(), children = new Map();
    for (const b of source) {
      if (!bySeries.has(b.series_id)) bySeries.set(b.series_id, []);
      bySeries.get(b.series_id).push(b);
      for (const id of _containerIdsFor(b)) {
        if (!children.has(id)) children.set(id, []);
        children.get(id).push(b);
      }
    }
    const pool = { bySeries, children };
    pools.set(stashId, pool);
    return pool;
  }

  function _getSeriesActiveBooksForContext(series, stashId = null) {
    const key = `${stashId ?? 'main'}:${series.id}`;
    if (seriesContexts.has(key)) return seriesContexts.get(key);
    const pool = contextPool(stashId);
    const baseBooks = stashId == null ? (seriesMap[series.id] || []) : (pool.bySeries.get(series.id) || []);
    const activeContainerIds  = new Set(baseBooks.filter(b => b.is_container).map(b => b.id));
    const activeBooks         = [...baseBooks];
    const seenIds             = new Set(activeBooks.map(b => b.id));
    for (const id of activeContainerIds) for (const b of pool.children.get(id) || []) {
      if (!seenIds.has(b.id)) { activeBooks.push(b); seenIds.add(b.id); }
    }
    const activeChildrenMap = {};
    const activeChildIds    = new Set();
    for (const b of activeBooks) {
      for (const pid of _containerIdsFor(b)) {
        if (activeContainerIds.has(pid)) { (activeChildrenMap[pid] ??= []).push(b); activeChildIds.add(b.id); }
      }
    }
    _sortChildrenMap(activeChildrenMap);
    const result = { activeBooks, activeChildrenMap, activeChildIds, topInSeries: _sortSeriesBooks(activeBooks.filter(b => !activeChildIds.has(b.id))) };
    seriesContexts.set(key, result);
    return result;
  }

  // Empty containers are not readable content.
  function _hasRenderableTop(topArr, childrenMap) {
    return topArr.some(b => !b.is_container || (childrenMap[b.id] || []).length);
  }

  function _registerSeriesBuilder(s, stashId) {
    const { activeBooks, activeChildrenMap, topInSeries } = _getSeriesActiveBooksForContext(s, stashId);
    const context = `series:${stashId ?? ''}:${s.id}`;
    for (const b of topInSeries) if (b.is_container) _registerContainerBuilder(b, activeChildrenMap, context);
    lazyState.builders.set(context, ({ incremental = false } = {}) => {
      const items = (function* () {
        if (activeBooks.length) {
          for (const b of topInSeries) yield b.is_container
            ? _renderContainerItem(b, activeChildrenMap, context, incremental)
            : _bookItemHtml(b, false, false, 0, null, isAdmin);
        } else {
          yield `<div class="series-empty-hint">${t('books.series_empty_hint')} <button class="series-browse-btn" data-series-id="${s.id}" data-series-name="${escapeHtml(s.name)}">${t('books.browse_series')}</button></div>`;
        }
      })();
      return incremental && topInSeries.length > 12 ? items : Array.from(items);
    });
    return context;
  }

  function _renderSeriesSection(s, stashId = null, deferExpanded = false) {
    const out = [];
    const { activeBooks, activeChildrenMap, topInSeries } = _getSeriesActiveBooksForContext(s, stashId);
    const booksInSeries = activeBooks;
    // Show truly empty series, but hide series whose existing books were all filtered out.
    if (booksInSeries.length && !_hasRenderableTop(topInSeries, activeChildrenMap)) return '';
    const keyPrefix     = stashId ? `stash_${stashId}_sr_` : 'sr_';
    const expanded      = _getExpandedPref('series', `${stashId ?? 'main'}:${s.id}`, `${keyPrefix}expanded_${s.id}`);
    const { visited: aggrV, totalSections: aggrS } = _aggregateProgress(booksInSeries, activeChildrenMap);
    const pct       = aggrS > 0 ? Math.max(0, Math.min(100, aggrV / aggrS * 100)) : 0;
    const fullyDone = aggrS > 0 && aggrV >= aggrS;
    const barColor  = fullyDone ? 'rgba(34,197,94,0.6)' : 'rgba(245,166,35,0.5)';
    const countLabel  = activeBooks.length === 1 ? '1 book' : `${activeBooks.length} books`;
    const sectLabel   = aggrS > 0 ? ` · ${aggrS} sections` : '';
    const editRole = !s.is_owner && (isAdmin ? 'Gamemaster' : isModerator && s.is_public ? 'Lorekeeper' : '');
    out.push(
      `<div class="series-header-row" data-series-id="${s.id}" data-expanded="${expanded ? '1' : '0'}" data-stash-id="${stashId ?? ''}" data-open-world="${s.is_open_world ? '1' : '0'}">` +
        `<span class="series-header-chevron">▶</span>` +
        `<span class="series-header-name" data-tooltip="${escapeHtml(s.name)}">${escapeHtml(s.name)}${s.is_open_world ? ` <span class="series-open-world-badge" data-tooltip="${escapeHtml(t('covers.open_world_series'))}"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span>` : ''}</span>` +
        `<span class="series-header-count">${activeBooks.length ? countLabel + sectLabel : 'no books yet'}</span>` +
        (s.is_owner || editRole
          ? `<button class="series-edit-btn${editRole ? ' series-edit-btn--admin' : ''}"${editRole ? ` data-tooltip="${editRole} edit"` : ''} data-series-id="${s.id}" data-series-name="${escapeHtml(s.name)}" data-series-desc="${escapeHtml(s.description || '')}" data-series-public="${s.is_public ? '1' : '0'}" data-series-open-world="${s.is_open_world ? '1' : '0'}">✎</button>`
          : `<span data-tooltip="${t('books.only_creator_can_edit')}" style="display:inline-flex"><button class="series-edit-btn" disabled>✎</button></span>`
        ) +
        `<button class="series-del-btn" data-series-id="${s.id}" data-series-name="${escapeHtml(s.name)}" data-series-owner="${s.is_owner ? '1' : '0'}" data-tooltip="${s.is_owner ? t('books.delete_series') : t('books.remove_from_library')}">✕</button>` +
        `<div class="series-header-bar" style="width:${pct}%;background:${barColor}"></div>` +
      `</div>`
    );
    const seriesKey = _registerSeriesBuilder(s, stashId);
    if (expanded && !deferExpanded && activeBooks.length <= 12) {
      // Inline but tagged with data-lazy-key so a later collapse can reclaim it.
      out.push(`<div class="series-books-group" data-series-id="${s.id}" data-stash-id="${stashId ?? ''}" data-lazy-key="${seriesKey}">`);
      out.push(lazyState.builders.get(seriesKey)().join(''));
      out.push('</div>');
    } else {
      out.push(`<div class="series-books-group" data-series-id="${s.id}" data-stash-id="${stashId ?? ''}" data-lazy-group="${seriesKey}"${expanded ? '' : ' style="display:none"'}></div>`);
    }
    return out.join('');
  }

  // ── Stash sections ──────────────────────────────────────────────────────────
  for (const stash of sortedStashes) {
    const excludedBookIds      = new Set(stash.excludedBookIds || []);
    const stashBookIds = new Set(stash.bookIds || []), stashSeriesIds = new Set(stash.seriesIds || []);
    const stashSeries          = _sortedByName(allSeries.filter(s => stashSeriesIds.has(s.id)));
    const explicitStashBooks   = books.filter(b => !excludedBookIds.has(b.id) && stashBookIds.has(b.id) && !stashSeriesIds.has(b.series_id));
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
    const stashSeriesItemCount = stashSeries.reduce((sum, s) => {
      const { activeBooks } = _getSeriesActiveBooksForContext(s, stash.id);
      return sum + 1 + activeBooks.length;
    }, 0);
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
    const stashPct      = stashAggrS > 0 ? Math.max(0, Math.min(100, stashAggrV / stashAggrS * 100)) : 0;
    const stashFullyDone = stashAggrS > 0 && stashAggrV >= stashAggrS;
    const stashBarColor = stashFullyDone ? 'rgba(34,197,94,0.6)' : 'rgba(52,211,153,0.5)';
    const stashKey = `stash:${stash.id}`;
    for (const b of stashContainers) _registerContainerBuilder(b, stashChildrenMap, stashKey);
    lazyState.builders.set(stashKey, ({ incremental = false } = {}) => {
      const items = (function* () {
        for (const s of stashSeries) { const h = _renderSeriesSection(s, stash.id, incremental); if (h) yield h; }
        for (const b of stashContainers) yield _renderContainerItem(b, stashChildrenMap, stashKey, incremental);
        for (const b of stashStandalone) yield _bookItemHtml(b, false, false, 0, null, isAdmin);
      })();
      return incremental && stashSeries.length + stashContainers.length + stashStandalone.length > 12 ? items : Array.from(items);
    });
    const stashHtml = () => {
      const parts = [];
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
      if (stashExpanded && stashItemCount <= 12) {
        // Small groups are inline; large groups build incrementally after insertion.
        parts.push(`<div class="stash-items-group" data-stash-id="${stash.id}" data-lazy-key="${stashKey}">`);
        parts.push(lazyState.builders.get(stashKey)().join(''));
        parts.push('</div>');
      } else {
        parts.push(`<div class="stash-items-group" data-stash-id="${stash.id}" data-lazy-group="${stashKey}"${stashExpanded ? '' : ' style="display:none"'}></div>`);
      }
      parts.push('</div>');
      return parts.join('');
    };
    blocks.push({ key: `stash:${stash.id}`, html: stashHtml,
      fingerprint: fingerprint(stash, stashBooksRaw, stashSeries.map(s => [s, _getSeriesActiveBooksForContext(s, stash.id).activeBooks])),
      expansion: Object.assign({ [`stash:${stash.id}`]: stashExpanded ? '1' : '0' },
        containerExpansion(stashBooksRaw), ...stashSeries.map(s => seriesExpansion(s, stash.id))) });
  }

  // ── Series sections ─────────────────────────────────────────────────────────
  for (const s of visibleSeries) blocks.push({ key: `series:${s.id}`, html: () => _renderSeriesSection(s),
    fingerprint: fingerprint(s, _getSeriesActiveBooksForContext(s).activeBooks), expansion: seriesExpansion(s) });

  // ── No-series: containers then standalone ───────────────────────────────────
  for (const b of _sortBooks(noSeries.filter(b =>  b.is_container))) {
    _registerContainerBuilder(b, childrenMap, 'main');
    blocks.push({ key: `book:${b.id}`, html: () => _renderContainerItem(b), fingerprint: fingerprint(b, childrenMap[b.id] || []), expansion: containerExpansion([b]) });
  }
  for (const b of _sortBooks(noSeries.filter(b => !b.is_container))) blocks.push({ key: `book:${b.id}`, html: () => _bookItemHtml(b, false, false, 0, null, isAdmin), fingerprint: fingerprint(b) });

  lazyState.wireContent = _wireRenderedContent;
  for (const root of updateBooksList(list, blocks)) {
    _wireRenderedContent(root);
  }

  _applyBooksSearchFilter();
  // A background refresh can leave expanded groups deferred while playing.
  // Returning Home must also resume placeholders in retained, unchanged blocks.
  for (const group of list.querySelectorAll?.('[data-lazy-group]') || []) {
    if (!group.closest('[style*="display:none"], [style*="display: none"]')) _materializeLazyGroup(group);
  }
  _scheduleAnthologyCardCoverFlows(list);
  _queueBookCovers(list);
}
