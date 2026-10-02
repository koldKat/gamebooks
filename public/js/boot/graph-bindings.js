import { bootState } from './state.js';
import { state, setViewingPt, resetState, saveState, resetBookProgress, loadState, parseSecId, isValidSecId, apiFetch, currentBookId, currentPlaythrough, currentSection } from '../core/state.js';
import { network, visNodes, initGraph, destroyNetwork, canReach, applyConnectorStyle, enforceSnapZoomFloor } from '../graph.js';
import { render, closeEditModal, showConfirm, showAlert, maxFastTravels } from '../play.js';
import { t } from '../i18n.js';
import { setCharSheetVisible } from '../play/charsheet.js';
import { setInventoryVisible } from '../inventory.js';
import { setEquipmentVisible } from '../equipment.js';
import { getCachedBooks } from '../books.js';
import { _syncSeriesRuns, _focusNodeAfterLoad, clearOpenWorldState, getOwSrcBookId, getOwSrcSection } from '../play/open-world.js';
import { _positionRewardLayer } from '../progression/rewards.js';
import { isBgInMove, toggleBgHidden, nudgeBgPosY, hideCtxMenu, _hideBgCtxMenu, _positionMenu, _enterBgMoveMode, _exitBgMoveMode, _updateColorSwatches } from '../play/bg.js';
import { exportBook } from '../export.js';
import { showMain } from './screens.js';

export function initGraphBindings() {
  document.addEventListener('click', () => { hideCtxMenu(); _hideBgCtxMenu(); });

  document.getElementById('bg-ctx-toggle-btn').addEventListener('click', e => {
    e.stopPropagation();
    toggleBgHidden();
  });

  document.getElementById('bg-ctx-move-btn').addEventListener('click', e => {
    e.stopPropagation();
    _hideBgCtxMenu();
    _enterBgMoveMode();
  });

  document.querySelectorAll('.ctx-connector-item').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const style = btn.dataset.connector;
      state.connectorStyle = style;
      saveState();
      applyConnectorStyle(style);
      _hideBgCtxMenu();
    });
  });

  document.getElementById('bg-ctx-grid-btn').addEventListener('click', e => {
    e.stopPropagation();
    state.showGrid = !state.showGrid;
    if (state.showGrid) state.fogOfGrid = false; // mutually exclusive with fog of grid
    saveState();
    network.redraw();
    _hideBgCtxMenu();
  });

  document.getElementById('bg-ctx-snap-btn').addEventListener('click', e => {
    e.stopPropagation();
    state.snapToGrid = !state.snapToGrid;
    // Covers turning it on while already zoomed out past the point where a
    // grid cell is bigger than typical touch imprecision - the 'zoom'
    // listener alone would never catch this since no further zooming may
    // happen before the next drag.
    if (state.snapToGrid) enforceSnapZoomFloor();
    saveState();
    _hideBgCtxMenu();
  });

  document.getElementById('bg-ctx-fog-btn').addEventListener('click', e => {
    e.stopPropagation();
    state.fogOfGrid = !state.fogOfGrid;
    if (state.fogOfGrid) state.showGrid = false; // mutually exclusive with show grid
    saveState();
    network.redraw();
    _hideBgCtxMenu();
  });

  document.getElementById('graph-container').addEventListener('mousemove', e => {
    if (!isBgInMove()) return;
    nudgeBgPosY(e.movementY);
  });

  document.getElementById('graph-container').addEventListener('click', e => {
    if (!isBgInMove()) return;
    e.stopPropagation();
    _exitBgMoveMode();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isBgInMove()) _exitBgMoveMode();
  });

  window.addEventListener('resize', _positionRewardLayer);

  document.getElementById('edit-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && bootState._mousedownOnOverlay === e.currentTarget) closeEditModal();
  });

  document.getElementById('center-current-btn').disabled = true;
  document.getElementById('center-current-btn').addEventListener('click', async () => {
    const sec = currentSection();
    // Only center locally if the active run is actually living in this book.
    // In OW, getOwSrcBookId() points to where the run lives; if it's a different book, skip local centering.
    const runIsLocal = !bootState._currentBook.isOpenWorld || !getOwSrcBookId() || getOwSrcBookId() === currentBookId;
    if (runIsLocal && sec && network && visNodes?.get(sec)) {
      network.selectNodes([sec]);
      network.focus(sec, { scale: Math.max(network.getScale(), 1.2), animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
      return;
    }
    // Cross-book: active run is in another book - navigate there
    if (bootState._currentBook.isOpenWorld && getOwSrcBookId() && getOwSrcSection()) {
      const srcBook = (getCachedBooks() || []).find(b => b.id === getOwSrcBookId());
      if (!srcBook) return;
      // Snapshot before showMain - it resets getOwSrcSection() when the source book becomes current
      const targetSection  = getOwSrcSection();
      const targetRunIndex = state.activePtIndex; // same run index in the target book
      await showMain(
        srcBook.id,
        srcBook.isbn || null, srcBook.issn || null, srcBook.asin || null,
        srcBook.cover_path ? `/covers/${srcBook.cover_path}` : null,
        srcBook.pdf_path || null, srcBook.pages ? Number(srcBook.pages) : null,
        srcBook.authors || null, srcBook.description || null,
        srcBook.discoverable_sections ?? null, !!srcBook.is_public,
        srcBook.created_by === null || srcBook.created_by === bootState._currentUserId,
        srcBook.series_name || null, srcBook.series_number || null,
        !!srcBook.is_container, srcBook.parent_book_id ?? null, srcBook.book_order ?? null,
      );
      // showMain/_syncSeriesRuns may have activated the wrong run (e.g. a cross-book run instead of
      // the one that lives here). Force the correct run index and re-render.
      if (targetRunIndex !== null && targetRunIndex !== undefined &&
          state.activePtIndex !== targetRunIndex && state.playthroughs[targetRunIndex]) {
        state.activePtIndex = targetRunIndex;
        saveState();
        render();
      }
      _focusNodeAfterLoad(targetSection);
    }
  });

  document.getElementById('find-node-btn').addEventListener('click', doFindNode);
  document.getElementById('find-node-input').addEventListener('keydown', e => { if (e.key === 'Enter') doFindNode(); });
  function doFindNode() {
    const input = document.getElementById('find-node-input');
    const id = parseSecId(input.value.trim());
    if (id === null || !visNodes || !visNodes.get(id)) {
      input.classList.add('not-found');
      setTimeout(() => input.classList.remove('not-found'), 800);
      return;
    }
    network.selectNodes([id]);
    network.focus(id, { scale: Math.max(network.getScale(), 1.2), animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
  }

  document.getElementById('export-book-btn').addEventListener('click', exportBook);
  document.getElementById('reset-btn').addEventListener('click', () => {
      const isOw = bootState._currentBook.isOpenWorld && bootState._currentBook.seriesId;
      showConfirm(
        isOw ? t('confirm.reset_series') : t('confirm.reset_book'),
        async () => {
          if (isOw) {
            const r = await apiFetch(`/api/series/${bootState._currentBook.seriesId}/reset`, { method: 'POST' }).catch(() => null);
            if (!r?.ok) { showAlert('Could not reset. Please try again.'); return; }
            clearOpenWorldState();
            resetState(); setViewingPt(null);
            // State was already reset on the server for all books; reload current book's state
            await loadState(currentBookId);
          } else {
            const ok = await resetBookProgress();
            if (!ok) { showAlert('Could not reset. Please try again.'); return; }
            setViewingPt(null);
          }
          destroyNetwork(); initGraph();
          network.on('oncontext', params => {
            params.event.preventDefault();
            const nodeId = network.getNodeAt(params.pointer.DOM);
            if (nodeId === undefined) { hideCtxMenu(); return; }
            bootState.ctxNodeId = nodeId;
            const pt     = currentPlaythrough();
            const ftLeft = pt ? (maxFastTravels() - (pt.fastTravelsUsed || 0)) : 0;
            const hasRuns2 = state.playthroughs.length > 0;
            const hasActiveRun2 = !!pt && !pt.completed;
            const showJump = pt && !pt.completed && ftLeft > 0 && !!state.graph[nodeId] && canReach(currentSection(), nodeId);
            const isStartNode2 = nodeId === (isValidSecId(state.startSection) ? state.startSection : 1);
            document.getElementById('ctx-start-node-btn').style.display = ((bootState._isAdmin || !hasRuns2) && isStartNode2) ? '' : 'none';
            document.getElementById('ctx-edit-btn').style.display       = hasActiveRun2 ? '' : 'none';
            document.getElementById('ctx-note-btn').style.display       = hasRuns2 ? '' : 'none';
            document.getElementById('ctx-battle-btn').style.display     = hasRuns2 ? '' : 'none';
            document.getElementById('ctx-delete-btn').style.display     = (hasActiveRun2 && !isStartNode2) ? '' : 'none';
            document.getElementById('ctx-jump-wrap').style.display      = showJump ? '' : 'none';
            document.querySelectorAll('.ctx-submenu-wrap:not(#ctx-jump-wrap)').forEach(w => w.style.display = hasRuns2 ? '' : 'none');
            _updateColorSwatches(nodeId);
            _positionMenu(document.getElementById('node-ctx-menu'), params.event.clientX, params.event.clientY);
          });
          render();
          // render() itself hides the charsheet/inventory/equipment buttons
          // via their own renderXDisplay() (no active run left after a reset
          // to show data for) - showMain's normal book-load sequence forces
          // them visible again right after its own render() call for exactly
          // this reason (a book view should keep showing these buttons even
          // with no active run, same as a fresh load with zero playthroughs
          // does). Reset never replayed that force-show step, so the buttons
          // stayed hidden until the next full page load ran showMain() again.
          setCharSheetVisible(true);
          setInventoryVisible(true);
          setEquipmentVisible(true);
        },
        { confirmLabel: t('btn.reset'), danger: true },
      );
    });



}
