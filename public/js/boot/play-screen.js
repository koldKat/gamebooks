import { bootState } from './state.js';
import { state, setViewingPt, loadState, isValidSecId, currentPlaythrough, currentSection, isDemoMode } from '../core/state.js';
import { network, initGraph, destroyNetwork, canReach, setGraphOpenWorld } from '../graph.js';
import { render, maxFastTravels, setDiscoverableLimit } from '../play.js';
import { t } from '../i18n.js';
import { setCharSheetVisible } from '../play/charsheet.js';
import { setInventoryVisible } from '../inventory.js';
import { setEquipmentVisible } from '../equipment.js';
import { loadNotesForBook } from '../play/notes.js';
import { connectPartySSE } from '../play/party.js';
import { _adminPdfHref } from '../edit-book.js';
import { showBattleSimForBook } from '../battle-sim-loader.js';
import { setLiveReadVisible, previewSection } from '../reading/liveread.js';
import { loadCovers, _showCachedCoversPanel, _stopLandingCoverRotation } from '../covers.js';
import { getCachedBooks, getCachedAllSeries } from '../books.js';
import { setupOpenWorldForBook, _syncSeriesRuns, _computeCrossBookReachability, _focusNodeAfterLoad, clearOpenWorldState, getOwCrossBookRoute } from '../play/open-world.js';
import { _positionRewardLayer } from '../progression/rewards.js';
import { setCurrentBookCover, resetBgState, hideCtxMenu, _updateSidebarBookInfo, _hideBgCtxMenu, _positionMenu, _showBgCtxMenu, _updateColorSwatches } from '../play/bg.js';
import { _loadingGraphSvg, _refreshInvDisplay, setDiceRollerVisible, setGuideVisible, _isMobile, _revealLanding } from './helpers.js';
import { _pushNav, _lockView } from './navigation.js';
import { showBooks } from './landing.js';

export async function showMain(bookId, isbn = null, issn = null, asin = null, cover = null, pdfPath = null, pages = null, authors = null, description = null, discoverableSections = null, isPublic = false, isCreator = true, seriesName = null, seriesNumber = null, isContainer = false, parentBookId = null, bookOrder = null) {
  if (_isMobile()) { showBooks(); return; }
  _lockView('book', 1500);
  document.body.classList.remove('promo-active');
  const _pvi2 = document.getElementById('login-promo-video-iframe');
  if (_pvi2) _pvi2.src = '';
  document.getElementById('landing-wrapper').style.display = 'none';
  // landing-bg-a/-b/-dim are siblings of landing-wrapper (not descendants -
  // see landing.css), so hiding landing-wrapper alone leaves them visible
  // and still full-viewport position:fixed behind the app, and their 60s
  // rotation timer kept repainting them for the rest of the session even
  // with a book/graph open. Mirror _revealLanding()'s visibility toggle in
  // reverse here, and stop the timer - both get restored by _revealLanding()
  // + _startLandingCoverRotation() (via loadCovers()/_showCachedCoversPanel())
  // the next time showBooks() runs.
  _stopLandingCoverRotation();
  ['landing-bg-a', 'landing-bg-b', 'landing-bg-dim'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.visibility = 'hidden';
  });
  window._syncScrollTopBtns?.();
  document.getElementById('main-screen').style.display     = 'flex';
  document.getElementById('legend').style.display          = 'flex';
  document.getElementById('feed-toggle').style.display     = 'none';
  _positionRewardLayer();
  document.getElementById('covers-panel').classList.remove('active');
  document.getElementById('covers-toggle').classList.remove('visible');
  document.getElementById('right-toggle').classList.remove('visible');
  document.getElementById('sidebar-toggle').classList.add('visible');

  _pushNav('book/' + bookId, { view: 'book', bookId });

  bootState._currentBook.isbn                 = isbn;
  bootState._currentBook.issn                 = issn;
  bootState._currentBook.asin                 = asin;
  setCurrentBookCover(cover);
  const _bk = getCachedBooks()?.find(b => b.id === bookId);
  resetBgState(!!(_bk?.bgHidden), _bk?.bgPosY ?? 50);
  bootState._currentBook.pdfPath              = pdfPath;
  bootState._currentBook.pages                = pages;
  bootState._currentBook.authors              = authors;
  bootState._currentBook.description          = description;
  bootState._currentBook.discoverableSections = discoverableSections;
  setDiscoverableLimit(discoverableSections);
  bootState._currentBook.isPublic             = !!isPublic;
  bootState._currentBook.seriesName           = seriesName || null;
  bootState._currentBook.seriesNumber         = seriesNumber || null;
  bootState._currentBook.isContainer          = !!isContainer;
  bootState._currentBook.parentBookId         = parentBookId || null;
  bootState._currentBook.bookOrder            = bookOrder ?? null;
  { const bk = (getCachedBooks() || []).find(b => b.id === bookId);
    bootState._currentBook.seriesId   = bk?.series_id ?? null;
    const sr = bootState._currentBook.seriesId && Array.isArray(getCachedAllSeries())
      ? getCachedAllSeries().find(s => s.id === bootState._currentBook.seriesId) : null;
    bootState._currentBook.isOpenWorld = !!(sr?.is_open_world);
    setupOpenWorldForBook(bookId, bootState._currentBook.seriesId, bootState._currentBook.isOpenWorld);
  }
  const editBookBtn = document.getElementById('edit-book-btn');
  editBookBtn.style.display = (isCreator || bootState._isAdmin) ? '' : 'none';
  editBookBtn.classList.toggle('admin-override', !isCreator && bootState._isAdmin);
  if (!isCreator && bootState._isAdmin) editBookBtn.dataset.tooltip = 'Admin edit';
  else delete editBookBtn.dataset.tooltip;
  const pdfDlBtn = document.getElementById('pdf-download-btn');
  if (pdfDlBtn) {
    const showPdfBtn = bootState._hasPdfAccess && !!pdfPath && !parentBookId;
    pdfDlBtn.style.display = showPdfBtn ? '' : 'none';
    if (showPdfBtn) pdfDlBtn.href = _adminPdfHref(pdfPath);
  }
  setViewingPt(null);
  // On a slow connection GET /api/books/:id/state can take a moment, during
  // which #graph-container/#sidebar would otherwise just sit empty/stale.
  // #graph-container: initGraph() overwrites this the instant it constructs
  // the new vis.Network right after, so it never needs explicit clearing.
  // #sidebar: its stats/playthrough-panel elements already exist in the
  // static HTML shell and render() only updates them in place, so this
  // overlay is removed explicitly once render() + _updateSidebarBookInfo()
  // actually populate it, below.
  const _graphContainerEl = document.getElementById('graph-container');
  if (_graphContainerEl) {
    _graphContainerEl.innerHTML = `<div class="graph-loading">${_loadingGraphSvg()}<span>${t('graph.loading')}</span></div>`;
  }
  const _sidebarEl = document.getElementById('sidebar');
  if (_sidebarEl) {
    _sidebarEl.insertAdjacentHTML('beforeend', `<div class="sidebar-loading">${_loadingGraphSvg()}<span>${t('graph.loading')}</span></div>`);
  }
  await loadState(bookId);
  if (bootState._currentBook.isOpenWorld && bootState._currentBook.seriesId) {
    const seriesRuns = await _syncSeriesRuns(bootState._currentBook.seriesId);
    await _computeCrossBookReachability(seriesRuns, bookId);
  } else {
    clearOpenWorldState();
  }

  destroyNetwork();
  setGraphOpenWorld(bootState._currentBook.isOpenWorld, bootState._currentBook.isOpenWorld ? (getCachedBooks() || []).filter(b => b.series_id === bootState._currentBook.seriesId).map(b => ({ id: b.id, name: b.name })) : []); // must be after destroyNetwork
  initGraph();
  network.on('oncontext', params => {
    params.event.preventDefault();
    const nodeId = network.getNodeAt(params.pointer.DOM);
    if (nodeId === undefined) {
      hideCtxMenu();
      bootState.ctxCanvasPos = network.DOMtoCanvas(params.pointer.DOM);
      _showBgCtxMenu(params.event.clientX, params.event.clientY);
      return;
    }
    _hideBgCtxMenu();
    bootState.ctxNodeId = nodeId;
    const pt     = currentPlaythrough();
    const ftLeft = pt ? (maxFastTravels() - (pt.fastTravelsUsed || 0)) : 0;
    const hasRuns = state.playthroughs.length > 0;
    const hasActiveRun = !!pt && !pt.completed;
    const curSec = currentSection();
    const isPlaceholder = !curSec;
    const crossBookReachable = bootState._currentBook.isOpenWorld && isPlaceholder && !!getOwCrossBookRoute()?.has(nodeId);
    const showJump = pt && !pt.completed && ftLeft > 0 && !!state.graph[nodeId] &&
      (canReach(curSec, nodeId) || crossBookReachable);
    const isStartNode = nodeId === (isValidSecId(state.startSection) ? state.startSection : 1);
    document.getElementById('ctx-start-node-btn').style.display = ((bootState._isAdmin || !hasRuns) && isStartNode) ? '' : 'none';
    document.getElementById('ctx-edit-btn').style.display       = hasActiveRun ? '' : 'none';
    document.getElementById('ctx-note-btn').style.display       = hasRuns ? '' : 'none';
    document.getElementById('ctx-battle-btn').style.display     = hasRuns ? '' : 'none';
    document.getElementById('ctx-delete-btn').style.display     = (hasActiveRun && !isStartNode) ? '' : 'none';
    document.getElementById('ctx-jump-wrap').style.display      = showJump ? '' : 'none';
    document.querySelectorAll('.ctx-submenu-wrap:not(#ctx-jump-wrap)').forEach(w => w.style.display = hasRuns ? '' : 'none');
    const ctxPortalBtn = document.getElementById('ctx-portal-btn');
    if (ctxPortalBtn) ctxPortalBtn.style.display = bootState._currentBook.isOpenWorld ? '' : 'none';
    _updateColorSwatches(nodeId);
    _positionMenu(document.getElementById('node-ctx-menu'), params.event.clientX, params.event.clientY);
  });

  // A plain left-click on a node opens a read-only Live Reading preview of
  // its text - previewSection (liveread.js) does its own isSectionMapped
  // gate internally and silently no-ops for a node that's never actually
  // been visited (grey/"Discovered" only, not purple/"Mapped"), so nothing
  // extra to check here. params.nodes is empty for a click on empty
  // canvas/an edge - only ever act on an actual node.
  network.on('click', params => {
    if (params.nodes.length !== 1) return;
    previewSection(params.nodes[0]);
  });

  // Restore viewing run across F5
  const _savedVw = parseInt(localStorage.getItem(`vw_${bookId}`) ?? '', 10);
  if (!isNaN(_savedVw) && _savedVw >= 0 && state.playthroughs[_savedVw]?.completed) {
    setViewingPt(state.playthroughs[_savedVw]);
  } else if (!currentPlaythrough() && state.playthroughs.length > 0) {
    // No active run and nothing restored from localStorage (e.g. never explicitly
    // "viewed" a run in this browser before). Without a displayPt, charsheet/inventory/
    // equipment hide entirely rather than showing read-only - default to the most
    // recently completed run so a fully-finished book doesn't look like it has none
    // of its recorded charsheet/inventory data.
    const completedRuns = state.playthroughs.filter(p => p.completed);
    if (completedRuns.length) {
      const latest = completedRuns.reduce((a, b) =>
        (b.completedAt || b.startedAt || 0) > (a.completedAt || a.startedAt || 0) ? b : a);
      setViewingPt(latest);
    }
  }
  render();
  _updateSidebarBookInfo();
  document.querySelector('#sidebar .sidebar-loading')?.remove();
  const _openSec = currentSection();
  _focusNodeAfterLoad(_openSec);
  setCharSheetVisible(true);
  setInventoryVisible(true);
  _refreshInvDisplay();
  setEquipmentVisible(true);
  await showBattleSimForBook(bookId);
  // Gated server-side already (db._canLiveRead) - hasLiveReading only ever
  // comes back true for that one account regardless of who's asking, so no
  // extra username check is needed here (unlike the earlier single-book POC).
  setLiveReadVisible(!!_bk?.hasLiveReading);
  setDiceRollerVisible(true);
  setGuideVisible(true);
  if (state.notesPinned) {
    await loadNotesForBook(bookId);
  }
  if (!isDemoMode) connectPartySSE(bookId);
}
