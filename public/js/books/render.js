import { _sortedByName } from './helpers.js';
import { booksState, _BOOKS_LS_KEY, _SERIES_LS_KEY, _STASHES_LS_KEY } from './state.js';
import { _getExpandedPref } from './prefs.js';
import { _scheduleAnthologyCardCoverFlows, _queueBookCovers } from './covers.js';
import { lazyState } from './lazy.js';
import { _applyBooksSearchFilter } from './search.js';
import { _bookItemHtml } from './markup.js';
import { _containerIdsFor, _sortChildrenMap, _sortBooks, _sortSeriesBooks, _aggregateProgress } from './groups.js';
import { _wireRenderedContent } from './actions.js';
import { naturalCompare } from '../sort.js';
import { _startLandingCoverRotation, _resetLandingCoverQueue, _effectiveLandingCoverSource } from '../covers.js';
import { t } from '../i18n.js';
import { escapeHtml } from '../util.js';

// ── Main render ───────────────────────────────────────────────────────────────
export function renderBooksList(allOwnedBooks, allSeries = [], stashes = []) {
  if (!Array.isArray(allOwnedBooks)) return;
  // Any builders from a previous render belong to DOM that's about to be
  // replaced - reset along with everything else.
  lazyState.builders.clear();
  lazyState.sequence = 0;
  const openWorldSeriesIds = new Set((allSeries || []).filter(s => s.is_open_world).map(s => s.id));
  for (const b of allOwnedBooks) b.isOpenWorld = b.series_id != null && openWorldSeriesIds.has(b.series_id);
  // booksState._cachedBooks/getCachedBooks() is the app-wide "what does this user own"
  // source (autocomplete, the "not in my books" covers filter, add-to-
  // library duplicate checks, etc.) - it must stay the FULL list regardless
  // of viewport, cached/persisted from allOwnedBooks before the reading-only
  // cut below ever touches `books`.
  booksState._cachedBooks     = allOwnedBooks;
  booksState._cachedAllSeries = allSeries;
  booksState._cachedStashes   = Array.isArray(stashes) ? stashes : [];
  try { localStorage.setItem(_BOOKS_LS_KEY,   JSON.stringify(allOwnedBooks));   } catch (_) {}
  try { localStorage.setItem(_SERIES_LS_KEY,  JSON.stringify(allSeries));       } catch (_) {}
  try { localStorage.setItem(_STASHES_LS_KEY, JSON.stringify(booksState._cachedStashes));  } catch (_) {}
  if (_effectiveLandingCoverSource() === 'mine') { _resetLandingCoverQueue(); _startLandingCoverRotation(); }

  const books = allOwnedBooks;

  const isAdmin = booksState._hooks.getIsAdmin?.() ?? false;
  const list = document.getElementById('books-list');

  if (!books.length && !allSeries.length && !booksState._cachedStashes.length) {
    list.innerHTML = `<p class="books-empty">${t('books.empty')}</p>`;
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

  function _renderContainerItem(b, customChildrenMap = childrenMap) {
    const myChildren = customChildrenMap[b.id] || [];
    const expanded   = _getExpandedPref('book', String(b.id), `bk_expanded_${b.id}`);
    const aggrV = myChildren.reduce((s, c) => s + (c.visited || 0), 0);
    const aggrS = myChildren.reduce((s, c) => s + ((c.discoverable_sections ?? c.total_sections) || 0), 0);
    const out = [_bookItemHtml(b, false, expanded, myChildren.length, { visited: aggrV, totalSections: aggrS }, isAdmin)];
    if (myChildren.length) {
      const childKey = `children:${b.id}:${lazyState.sequence++}`;
      lazyState.builders.set(childKey, () =>
        myChildren.map(child => _bookItemHtml(child, true, false, 0, null, isAdmin, b.id)));
      if (expanded) {
        // Inline but tagged with data-lazy-key so a later collapse can reclaim it.
        out.push(`<div class="book-children-group" data-parent="${b.id}" data-lazy-key="${childKey}">`);
        for (const child of myChildren) out.push(_bookItemHtml(child, true, false, 0, null, isAdmin, b.id));
        out.push('</div>');
      } else {
        out.push(`<div class="book-children-group" data-parent="${b.id}" data-lazy-group="${childKey}" style="display:none"></div>`);
      }
    }
    return out.join('');
  }

  const parts = [];

  function _getSeriesActiveBooksForContext(series, stashId = null) {
    const stash = stashId == null ? null : booksState._cachedStashes.find(x => x.id === stashId);
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

  // A container itself is a folder, not readable content - only a
  // standalone book, or a container that has children, counts toward "does
  // this series/stash have anything to show".
  function _hasRenderableTop(topArr, childrenMap) {
    return topArr.some(b => !b.is_container || (childrenMap[b.id] || []).length);
  }

  function _renderSeriesSection(s, stashId = null) {
    const out = [];
    const stash = stashId == null ? null : booksState._cachedStashes.find(x => x.id === stashId);
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
    // A genuinely empty series (booksInSeries.length === 0, e.g. just
    // created) still renders its header with the "no books yet" hint below -
    // that's the only place a user can find it to add books. But a series
    // that has books which all got filtered out of view (stash exclusions,
    // or containers with no children) has nowhere useful for that hint to
    // send you, so that case still skips the whole section.
    if (booksInSeries.length && !_hasRenderableTop(topInSeries, activeChildrenMap)) return '';
    const keyPrefix     = stashId ? `stash_${stashId}_sr_` : 'sr_';
    const expanded      = _getExpandedPref('series', `${stashId ?? 'main'}:${s.id}`, `${keyPrefix}expanded_${s.id}`);
    const { visited: aggrV, totalSections: aggrS } = _aggregateProgress(booksInSeries, activeChildrenMap);
    const pct       = aggrS > 0 ? (aggrV >= aggrS ? 100 : Math.min(99, Math.floor(aggrV / aggrS * 100))) : 0;
    const fullyDone = aggrS > 0 && aggrV >= aggrS;
    const barColor  = fullyDone ? 'rgba(34,197,94,0.6)' : 'rgba(245,166,35,0.5)';
    const countLabel  = activeBooks.length === 1 ? '1 book' : `${activeBooks.length} books`;
    const sectLabel   = aggrS > 0 ? ` · ${aggrS} sections` : '';
    out.push(
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
    const _seriesBodyHtml = () => {
      const inner = [];
      if (booksInSeries.length) {
        for (const b of topInSeries) inner.push(b.is_container ? _renderContainerItem(b, activeChildrenMap) : _bookItemHtml(b, false, false, 0, null, isAdmin));
      } else {
        inner.push(`<div class="series-empty-hint">${t('books.series_empty_hint')} <button class="series-browse-btn" data-series-id="${s.id}" data-series-name="${escapeHtml(s.name)}">${t('books.browse_series')}</button></div>`);
      }
      // Array of separate item HTML strings (not one joined blob) so lazy
      // materialization can insert/wire in chunks - see _materializeLazyGroup.
      return inner;
    };
    const seriesKey = `series:${stashId ?? ''}:${s.id}`;
    lazyState.builders.set(seriesKey, _seriesBodyHtml);
    if (expanded) {
      // Inline but tagged with data-lazy-key so a later collapse can reclaim it.
      out.push(`<div class="series-books-group" data-series-id="${s.id}" data-stash-id="${stashId ?? ''}" data-lazy-key="${seriesKey}">`);
      out.push(_seriesBodyHtml().join(''));
      out.push('</div>');
    } else {
      out.push(`<div class="series-books-group" data-series-id="${s.id}" data-stash-id="${stashId ?? ''}" data-lazy-group="${seriesKey}" style="display:none"></div>`);
    }
    return out.join('');
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
    // Not stashBooksRaw.length - a container in there is a folder, not
    // readable content itself, so a stash holding only an empty anthology
    // would still count as non-empty by raw length even though
    // stashContainers' own per-item skip (below) hides that container
    // entirely, leaving nothing actually rendered. Standalone books are
    // real content on their own; a container only counts if it has
    // children to show.
    if (stashStandalone.length) stashHasAnyBooks = true;
    if (stashContainers.some(c => (stashChildrenMap[c.id] || []).length)) stashHasAnyBooks = true;
    // A stash whose books (direct or via its series) have nothing left to
    // show has no reason to render. Checked separately from stashItemCount
    // below, which counts each series header as "1 item" regardless of
    // whether that series itself has any books - a stash holding only an
    // empty series would otherwise read as non-empty and still get
    // rendered.
    if (!stashHasAnyBooks) continue;
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
    const _stashBodyHtml = () => {
      const inner = [];
      for (const s of stashSeries) { const h = _renderSeriesSection(s, stash.id); if (h) inner.push(h); }
      for (const b of stashContainers) inner.push(_renderContainerItem(b, stashChildrenMap));
      for (const b of stashStandalone) inner.push(_bookItemHtml(b, false, false, 0, null, isAdmin));
      // Array of item strings, not one blob - see _materializeLazyGroup.
      return inner;
    };
    const stashKey = `stash:${stash.id}`;
    lazyState.builders.set(stashKey, _stashBodyHtml);
    if (stashExpanded) {
      // Rendered inline, but tagged with data-lazy-key so it can still be
      // reclaimed (DOM freed) if the user collapses it - see _maybeReclaimLazyGroup.
      parts.push(`<div class="stash-items-group" data-stash-id="${stash.id}" data-lazy-key="${stashKey}">`);
      parts.push(_stashBodyHtml().join(''));
      parts.push('</div>');
    } else {
      parts.push(`<div class="stash-items-group" data-stash-id="${stash.id}" data-lazy-group="${stashKey}" style="display:none"></div>`);
    }
    parts.push('</div>');
  }

  // ── Series sections ─────────────────────────────────────────────────────────
  for (const s of visibleSeries) parts.push(_renderSeriesSection(s));

  // ── No-series: containers then standalone ───────────────────────────────────
  for (const b of _sortBooks(noSeries.filter(b =>  b.is_container))) parts.push(_renderContainerItem(b));
  for (const b of _sortBooks(noSeries.filter(b => !b.is_container))) parts.push(_bookItemHtml(b, false, false, 0, null, isAdmin));

  list.innerHTML = parts.join('');



  _wireRenderedContent(list);
  lazyState.wireContent = _wireRenderedContent;

  _applyBooksSearchFilter();
  _scheduleAnthologyCardCoverFlows(list);
  _queueBookCovers(list);
}
