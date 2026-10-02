import { bootState } from './state.js';
import { state, viewingPt, setViewingPt, saveState, parseSecId, isValidSecId, currentPlaythrough, currentSection, mappedCountFor } from '../core/state.js';
import { network, subtreeToDelete, deleteNodes, findPathTo, canReach } from '../graph.js';
import { render, openEditModal, openNoteModal, closeNoteModal, showConfirm, showAlert, confirmAlphanumericSwitch, setFastTravelHandler, showFastTravelDialog, openPortalModal, startPlaythrough, setAltStartHandler, wouldAutoNav } from '../play.js';
import { t } from '../i18n.js';
import { doJumpCrossBook, getOwCrossBookRoute } from '../play/open-world.js';
import { hideCtxMenu, _hideBgCtxMenu } from '../play/bg.js';

export function initNodeBindings() {
  document.getElementById('ctx-edit-btn').addEventListener('click', () => {
    const id = bootState.ctxNodeId; hideCtxMenu();
    if (id !== null) openEditModal(id);
  });

  document.getElementById('ctx-note-btn').addEventListener('click', () => {
    const id = bootState.ctxNodeId; hideCtxMenu();
    if (id !== null) openNoteModal(id);
  });

  document.getElementById('note-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && bootState._mousedownOnOverlay === e.currentTarget) closeNoteModal();
  });

  // Same "worth keeping" check as play.js's _cleanupOrphanedTargets and
  // graph.js's own orphan-pruning pass - was missing `portals`/`showNote`
  // here, so toggling priority/battle/color off a node that only had a
  // portal (no other choices) silently deleted the portal along with it.
  function _pruneDiscovered(id) {
    const n = state.graph[id];
    if (!n?.discovered) return;
    const hasMetadata = n.note || n.priority || n.battle || n.color || n.portals || n.showNote || n.manual;
    if (!hasMetadata && (!n.choices || n.choices.length === 0)) delete state.graph[id];
  }

  function setPriority(value) {
    const id = bootState.ctxNodeId; hideCtxMenu();
    if (id === null) return;
    if (!state.graph[id]) state.graph[id] = { choices: [], discovered: true };
    if (value === 'normal') delete state.graph[id].priority;
    else                    state.graph[id].priority = value;
    _pruneDiscovered(id);
    saveState();
    render();
  }

  document.getElementById('ctx-priority-high-btn').addEventListener('click',   () => setPriority('high'));
  document.getElementById('ctx-priority-normal-btn').addEventListener('click', () => setPriority('normal'));
  document.getElementById('ctx-priority-low-btn').addEventListener('click',    () => setPriority('low'));

  document.getElementById('ctx-battle-btn').addEventListener('click', () => {
    const id = bootState.ctxNodeId; hideCtxMenu();
    if (id === null) return;
    if (!state.graph[id]) state.graph[id] = { choices: [], discovered: true };
    if (state.graph[id].battle) delete state.graph[id].battle;
    else                        state.graph[id].battle = true;
    _pruneDiscovered(id);
    saveState();
    render();
  });

  const ctxPortalBtn = document.getElementById('ctx-portal-btn');
  if (ctxPortalBtn) ctxPortalBtn.addEventListener('click', () => {
    const id = bootState.ctxNodeId; hideCtxMenu();
    if (id !== null) openPortalModal(id, null);
  });


  document.getElementById('ctx-color-grid').addEventListener('click', e => {
    const swatch = e.target.closest('.ctx-color-swatch');
    if (!swatch) return;
    const id = bootState.ctxNodeId; hideCtxMenu();
    if (id === null) return;
    if (!state.graph[id]) state.graph[id] = { choices: [], discovered: true };
    const color = swatch.dataset.color;
    if (state.graph[id].color === color) {
      delete state.graph[id].color;
    } else {
      state.graph[id].color = color;
    }
    _pruneDiscovered(id);
    saveState();
    render();
  });

  // Opening the native color picker is itself a real click on this input,
  // which bubbles to the document-level "click anywhere closes the context
  // menu" listener below - that cleared bootState.ctxNodeId (via hideCtxMenu) before
  // the picker's own async 'change' ever fired, so picking a color always
  // silently no-op'd once the menu (and the id it remembered) was already
  // gone. Stopping that initial click from bubbling keeps the menu, and
  // bootState.ctxNodeId, alive for as long as the native picker itself is open.
  document.getElementById('ctx-color-custom').addEventListener('click', e => {
    e.stopPropagation();
  });
  document.getElementById('ctx-color-custom').addEventListener('change', e => {
    const id = bootState.ctxNodeId; hideCtxMenu();
    if (id === null) return;
    if (!state.graph[id]) state.graph[id] = { choices: [], discovered: true };
    state.graph[id].color = e.target.value;
    _pruneDiscovered(id);
    saveState();
    render();
  });

  document.getElementById('ctx-color-clear-btn').addEventListener('click', () => {
    const id = bootState.ctxNodeId; hideCtxMenu();
    if (id === null) return;
    if (state.graph[id]) { delete state.graph[id].color; _pruneDiscovered(id); }
    saveState();
    render();
  });

  function doJump(mode, explicitId) {
    const id = explicitId ?? bootState.ctxNodeId;
    hideCtxMenu();
    if (id === null || id === undefined) return;
    const pt = currentPlaythrough();
    if (!pt) return;
    const from = currentSection();

    // Cross-book fast travel (open world) - only when no sections in this book yet
    const isPlaceholderRun = !from; // path is empty, run lives in another book
    if (bootState._currentBook.isOpenWorld && isPlaceholderRun && getOwCrossBookRoute()?.has(id)) {
      doJumpCrossBook(id, mode);
      return;
    }

    if (!canReach(from, id)) { showAlert(t('ctx.fasttravel.no_path')); return; }
    const path = findPathTo(from, id, mode);
    if (!path || path.length < 2) { showAlert(t('ctx.fasttravel.no_path')); return; }
    for (let i = 1; i < path.length; i++) pt.path.push(path[i]);
    pt.fastTravelsUsed = (pt.fastTravelsUsed || 0) + 1;
    pt.lastActionAt = Date.now();
    saveState();
    render();
    if (network && !wouldAutoNav(id, pt)) network.focus(id, { animation: true, scale: 1.2 });
  }

  setFastTravelHandler(() => showFastTravelDialog((secId, mode) => doJump(mode, secId)));

  setAltStartHandler(() => {
    document.getElementById('alt-start-error').textContent = '';
    document.getElementById('alt-start-input').value = String(isValidSecId(state.startSection) ? state.startSection : 1);
    document.getElementById('alt-start-input').inputMode = state.alphanumericSections ? 'text' : 'numeric';
    document.getElementById('alt-start-row').classList.toggle('no-stepper', !!state.alphanumericSections);
    document.getElementById('alt-start-modal-overlay').classList.add('active');
    setTimeout(() => { document.getElementById('alt-start-input').select(); }, 50);
  });

  document.getElementById('ctx-jump-high-btn').addEventListener('click',     () => doJump('high'));
  document.getElementById('ctx-jump-shortest-btn').addEventListener('click', () => doJump('shortest'));
  document.getElementById('ctx-jump-normal-btn').addEventListener('click',   () => doJump('normal'));
  document.getElementById('ctx-jump-low-btn').addEventListener('click',      () => doJump('low'));

  // "+ Add node": places a freestanding node at wherever the empty-canvas
  // right-click that opened bg-ctx-menu landed (bootState.ctxCanvasPos), for sections
  // that exist in the book but aren't reachable through any recorded choice
  // (e.g. bonus episodes) - lets you park a note/color on them without first
  // inventing a fake incoming choice just to get them onto the map.
  let _addNodeClickPos = null;

  function openAddNodeModal() {
    _addNodeClickPos = bootState.ctxCanvasPos;
    _hideBgCtxMenu();
    document.getElementById('add-node-input').classList.remove('invalid');
    document.getElementById('add-node-input').value = '';
    document.getElementById('add-node-modal-overlay').classList.add('active');
    setTimeout(() => { document.getElementById('add-node-input').focus(); }, 50);
  }
  document.getElementById('bg-ctx-addnode-btn').addEventListener('click', openAddNodeModal);

  function closeAddNodeModal() {
    document.getElementById('add-node-modal-overlay').classList.remove('active');
  }
  document.getElementById('add-node-cancel').addEventListener('click', closeAddNodeModal);
  document.getElementById('add-node-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && bootState._mousedownOnOverlay === e.currentTarget) closeAddNodeModal();
  });

  // Same brief red-border flash as #find-node-input's own .not-found class
  // (graph toolbar's "jump to section" field) - no text message, just a
  // 0.8s border flash, per how that field already handles an invalid entry.
  function _flashAddNodeInvalid() {
    const inp = document.getElementById('add-node-input');
    inp.classList.add('invalid');
    setTimeout(() => inp.classList.remove('invalid'), 800);
  }

  // Creates a brand new node and drops it exactly at the click position -
  // the caller (add-node-save handler below) has already rejected any id
  // that's already on the map, so this never touches an existing node's
  // position or data. Deliberately NOT setting discovered: true - per
  // mappedCountFor (state.js) and nodeColor (graph.js), a node only counts
  // (and colors) as merely "discovered" when discovered is explicitly true
  // AND it has no choices/portals; omitting the flag entirely is what makes
  // mappedCountFor's own `!graph[s]?.discovered` clause treat it as fully
  // mapped immediately, matching "mapped and discovered" - the whole point
  // of a manually-placed node, since it'll never get its own choices to
  // record. `manual: true` marks it as worth keeping to graph.js's
  // deleteNodes()/this file's own _pruneDiscovered()/play.js's note-save
  // cleanup and _cleanupOrphanedTargets, all of which otherwise silently
  // delete a bare node with no choices/note/priority/color/battle/portals
  // the next time some unrelated node gets cleaned up - without this flag a
  // freshly-added, still-empty bonus node would be exactly that
  // "worth deleting" shape.
  function _applyAddNode(id, pos) {
    state.graph[id] = { choices: [], manual: true };
    state.positions[id] = pos;
    saveState();
    render();
    closeAddNodeModal();
  }

  document.getElementById('add-node-save').addEventListener('click', () => {
    const raw = document.getElementById('add-node-input').value.trim();
    if (!raw) { _flashAddNodeInvalid(); return; }
    const id = parseSecId(raw);
    if (!isValidSecId(id) || (typeof id === 'number' && id < 1)) { _flashAddNodeInvalid(); return; }
    // Range check only applies to plain numeric ids - an alphanumeric label
    // like "115-L" isn't part of the book's sequential numbered range at all.
    if (typeof id === 'number' && state.totalSections > 0 && id > state.totalSections) { _flashAddNodeInvalid(); return; }
    if (state.graph[id]) { _flashAddNodeInvalid(); return; }
    const pos = _addNodeClickPos || { x: 0, y: 0 };
    if (typeof id === 'string' && !state.alphanumericSections) {
      confirmAlphanumericSwitch(id, () => _applyAddNode(id, pos));
      return;
    }
    _applyAddNode(id, pos);
  });

  document.getElementById('add-node-input').addEventListener('keydown', e => {
    if (e.key === 'Enter')  document.getElementById('add-node-save').click();
    if (e.key === 'Escape') closeAddNodeModal();
  });
  document.getElementById('add-node-input').addEventListener('input', e => {
    e.target.classList.remove('invalid');
  });

  function openStartNodeModal() {
    hideCtxMenu();
    document.getElementById('start-node-error').textContent = '';
    document.getElementById('start-node-input').value = String(bootState.ctxNodeId ?? state.startSection ?? 1);
    document.getElementById('start-node-modal-overlay').classList.add('active');
    setTimeout(() => { document.getElementById('start-node-input').select(); }, 50);
  }

  document.getElementById('ctx-start-node-btn').addEventListener('click', openStartNodeModal);

  document.getElementById('start-node-cancel').addEventListener('click', () => {
    document.getElementById('start-node-modal-overlay').classList.remove('active');
  });
  document.getElementById('start-node-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && bootState._mousedownOnOverlay === e.currentTarget) e.currentTarget.classList.remove('active');
  });

  function _applyStartNodeRename(newId, oldId) {
    if (newId !== oldId) {
      // Rename the node in the graph
      if (state.graph[oldId] !== undefined) {
        state.graph[newId] = state.graph[oldId];
        delete state.graph[oldId];
      }
      // Update any choices pointing to oldId
      for (const data of Object.values(state.graph)) {
        data.choices = (data.choices || []).map(c => c === oldId ? newId : c);
      }
      // Update saved positions
      if (state.positions?.[oldId] !== undefined) {
        state.positions[newId] = state.positions[oldId];
        delete state.positions[oldId];
      }
      // Update playthrough paths so the old id doesn't linger as an
      // orphaned extra "start" node in allDiscoveredSections()
      state.playthroughs.forEach(pt => {
        pt.path = (pt.path || []).map(s => s === oldId ? newId : s);
      });
    }
    state.startSection = newId;
    saveState();
    render();
    document.getElementById('start-node-modal-overlay').classList.remove('active');
  }

  document.getElementById('start-node-save').addEventListener('click', () => {
    const raw   = document.getElementById('start-node-input').value.trim();
    const newId = parseSecId(raw || '1');
    const errEl = document.getElementById('start-node-error');
    if (!isValidSecId(newId) || (typeof newId === 'number' && newId < 1)) { errEl.textContent = t('play.must_be_1_or_greater'); return; }
    const oldId = bootState.ctxNodeId ?? state.startSection ?? 1;
    if (typeof newId === 'string' && !state.alphanumericSections) {
      confirmAlphanumericSwitch(newId, () => _applyStartNodeRename(newId, oldId));
      return;
    }
    _applyStartNodeRename(newId, oldId);
  });

  document.getElementById('start-node-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('start-node-save').click();
    if (e.key === 'Escape') document.getElementById('start-node-cancel').click();
  });

  function _adjustStartNode(delta) {
    const inp = document.getElementById('start-node-input');
    const cur = parseSecId(inp.value.trim());
    const next = (typeof cur === 'number' && cur > 0) ? Math.max(1, cur + delta) : 1;
    inp.value = String(next);
    document.getElementById('start-node-error').textContent = '';
  }
  document.getElementById('start-node-dec').addEventListener('click', () => _adjustStartNode(-1));
  document.getElementById('start-node-inc').addEventListener('click', () => _adjustStartNode(1));

  document.getElementById('alt-start-cancel').addEventListener('click', () => {
    document.getElementById('alt-start-modal-overlay').classList.remove('active');
  });
  document.getElementById('alt-start-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && bootState._mousedownOnOverlay === e.currentTarget) e.currentTarget.classList.remove('active');
  });
  function _startAltRun(secId) {
    document.getElementById('alt-start-modal-overlay').classList.remove('active');
    startPlaythrough(secId);
  }
  document.getElementById('alt-start-save').addEventListener('click', () => {
    const raw   = document.getElementById('alt-start-input').value.trim();
    const secId = parseSecId(raw || '1');
    const errEl = document.getElementById('alt-start-error');
    if (!isValidSecId(secId) || (typeof secId === 'number' && secId < 1)) { errEl.textContent = t('play.must_be_1_or_greater'); return; }
    if (typeof secId === 'string' && !state.alphanumericSections) {
      confirmAlphanumericSwitch(secId, () => _startAltRun(secId));
      return;
    }
    _startAltRun(secId);
  });
  document.getElementById('alt-start-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('alt-start-save').click();
    if (e.key === 'Escape') document.getElementById('alt-start-cancel').click();
  });
  function _adjustAltStart(delta) {
    const inp = document.getElementById('alt-start-input');
    const cur = parseSecId(inp.value.trim());
    const next = (typeof cur === 'number' && cur > 0) ? Math.max(1, cur + delta) : 1;
    inp.value = String(next);
    document.getElementById('alt-start-error').textContent = '';
  }
  document.getElementById('alt-start-dec').addEventListener('click', () => _adjustAltStart(-1));
  document.getElementById('alt-start-inc').addEventListener('click', () => _adjustAltStart(1));

  document.getElementById('ctx-delete-btn').addEventListener('click', () => {
    const id = bootState.ctxNodeId; hideCtxMenu();
    if (id === null) return;
    if (id === (isValidSecId(state.startSection) ? state.startSection : 1)) return;
    const toDelete = subtreeToDelete(id);
    const extra    = toDelete.size > 1 ? t('confirm.delete_node_extra', { n: toDelete.size - 1 }) : '';
    showConfirm(t('confirm.delete_node', { id, extra }), () => {
      // Capture before deleteNodes mutates state - it may reopen (uncomplete) any
      // playthrough whose path passed through a deleted node, including the one
      // being viewed. Only stop viewing if THIS run's own path was affected -
      // not just because it happens to already be incomplete for other reasons.
      const viewingPtAffected = !!viewingPt && viewingPt.path.some(s => toDelete.has(s));
      deleteNodes(toDelete);
      if (viewingPtAffected) setViewingPt(null);
      render();
    });
  });

}
