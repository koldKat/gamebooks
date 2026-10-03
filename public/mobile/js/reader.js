// Mobile reading/navigation and run lifecycle; manual outcomes remain available.
// Avoid desktop play/reading imports; pass lifecycle hooks to separate dialogs.

import {
  state, loadState, saveState, apiFetch, getToken, currentBookId,
  currentPlaythrough, currentSection, isTerminal, isValidSecId, parseSecId,
  setViewingPt, viewingPt, currentUserLevel, bonusUndos, bonusFastTravels,
  isSectionMapped,
} from '../../js/core/state.js';
import { canReach, findPathTo } from '../../js/graph.js';
import { showAlert, showConfirm } from '../../js/ui-helpers/confirm.js';
import { initGraphView, refreshGraph } from './graph-view.js';
import { openNotebook } from './notebook.js';
import { hasSim, openSimForBook } from './battlesim-dispatch.js';
import { showToast } from './toast.js';
import { openNodeContextMenu, hideNodeContextMenu } from './context-menu.js';
import { openFastTravelDialog } from './fast-travel-dialog.js';
import { t } from '../../js/i18n.js';
import { TROPHY_SVG, BROKEN_SHIELD_SVG, terminalHeadingKey } from '../../js/reading/liveread-shared.js';
import { showReadingGate } from '../../js/reading/access.js';

// Debounce reward checks by 750ms to allow deferred server awards to land.
// Merge nearby toast deltas instead of overwriting feedback.
let _lastKnownXp     = null;
let _xpFlushTimer    = null;
let _xpToastPending  = 0;
let _xpToastVisibleUntil = 0;
export async function _seedXpBaseline() {
  try {
    const res = await apiFetch('/api/profile');
    if (res.ok) _lastKnownXp = (await res.json()).xp ?? null;
  } catch (_) {}
}
export function _checkXpReward() {
  if (_lastKnownXp === null || _xpFlushTimer) return;
  _xpFlushTimer = setTimeout(async () => {
    _xpFlushTimer = null;
    try {
      const res = await apiFetch('/api/profile');
      if (!res.ok) return;
      const xp = (await res.json()).xp;
      if (typeof xp === 'number' && xp > _lastKnownXp) {
        const delta = xp - _lastKnownXp;
        _lastKnownXp = xp;
        const now = Date.now();
        _xpToastPending = (now < _xpToastVisibleUntil) ? _xpToastPending + delta : delta;
        _xpToastVisibleUntil = now + 2200; // matches toast.js's own display duration
        showToast(t('mobile.xp_toast', { n: _xpToastPending }));
      }
    } catch (_) {}
  }, 750);
}

function _escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ICON_TEXT  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="14" y2="18"/></svg>`;
const ICON_GRAPH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><line x1="7.5" y1="7.5" x2="10.5" y2="16.5"/><line x1="16.5" y1="7.5" x2="13.5" y2="16.5"/></svg>`;
const ICON_TRACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 17.5 16 6.5"/></svg>`;

function _loadingHtml(label) {
  return `<div class="m-loading">
    <svg class="mlg-graph" viewBox="0 0 32 32">
      <line x1="16" y1="16" x2="6"  y2="7"  stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="16" y1="16" x2="26" y2="7"  stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="16" y1="16" x2="6"  y2="26" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="16" y1="16" x2="26" y2="26" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
      <circle class="mlg-node mlg-n1" cx="6"  cy="7"  r="4" fill="#8e44ad" stroke="#6c3483" stroke-width="1.2"/>
      <circle class="mlg-node mlg-n2" cx="26" cy="7"  r="4" fill="#e74c3c" stroke="#c0392b" stroke-width="1.2"/>
      <circle class="mlg-node mlg-n3" cx="6"  cy="26" r="4" fill="#3498db" stroke="#2980b9" stroke-width="1.2"/>
      <circle class="mlg-node mlg-n4" cx="26" cy="26" r="4" fill="#27ae60" stroke="#1e8449" stroke-width="1.2"/>
      <circle class="mlg-center" cx="16" cy="16" r="6" fill="#f5a623" stroke="#c47d00" stroke-width="1.5"/>
    </svg>
    <span>${_escapeHtml(label)}</span>
  </div>`;
}

// Overlay the graph loader separately: vis.Network owns the graph container.
function _hideGraphLoading() {
  const el = document.getElementById('m-graph-loading');
  if (el) el.style.display = 'none';
}

// Pane modes are mutually exclusive toggles, each returning to both when deselected.
let _paneMode = 'both';
function _setPaneMode(mode) {
  const prev = _paneMode;
  _paneMode = mode;
  const panes = document.getElementById('m-panes');
  if (!panes) return;
  panes.classList.toggle('m-text-only', mode === 'text');
  panes.classList.toggle('m-graph-only', mode === 'graph');
  document.getElementById('m-toggle-text-btn')?.classList.toggle('active', mode === 'text');
  document.getElementById('m-toggle-graph-btn')?.classList.toggle('active', mode === 'graph');
  // Refresh after revealing the graph so resize and centering use non-zero dimensions.
  if (prev === 'text' && mode !== 'text') {
    requestAnimationFrame(() => refreshGraph(currentSection()));
  }
}

// Reveal and merge choices on arrival, preserving existing node metadata.
export function _commitChoices(sec, choices) {
  const deduped = [...new Set(choices)].sort((a, b) => {
    const av = isValidSecId(a), bv = isValidSecId(b);
    if (av && bv) {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      if (typeof a === 'number') return -1;
      if (typeof b === 'number') return 1;
      return String(a).localeCompare(String(b));
    }
    if (av) return -1;
    if (bv) return 1;
    return (b === 0 ? 1 : 0) - (a === 0 ? 1 : 0); // 0 (win) before -1 (death)
  });
  const existing = state.graph[sec] || {};
  state.graph[sec] = { choices: deduped };
  if (existing.note)     state.graph[sec].note     = existing.note;
  if (existing.priority) state.graph[sec].priority = existing.priority;
  if (existing.battle)   state.graph[sec].battle   = existing.battle;
  if (existing.color)    state.graph[sec].color    = existing.color;
  if (existing.portals)  state.graph[sec].portals  = existing.portals;
  if (existing.showNote) state.graph[sec].showNote = existing.showNote;
}

// Initialize desktop-compatible run fields; mobile does not instantiate starting-item templates.
export function _startPlaythrough(startSec) {
  state.playthroughs.push({
    path: [startSec], completed: false, result: null,
    undosUsed: 0, fastTravelsUsed: 0, startedAt: Date.now(),
    charSheet: { fields: [] },
    inventory: [], equipment: {}, equipmentVisible: {},
    diceState: { count: 2, die: 6, lastResult: null },
    // Keep visited sections permanently even when undo shrinks the live path.
    mVisited: [startSec],
  });
  state.activePtIndex = state.playthroughs.length - 1;
}

// Merge the live path into mVisited on every load, including navigation done on desktop.
export function _ensureMVisited(pt) {
  if (!Array.isArray(pt.mVisited)) pt.mVisited = [];
  for (const sec of pt.path) if (!pt.mVisited.includes(sec)) pt.mVisited.push(sec);
  return pt.mVisited;
}

// Check the request generation after each await so stale results cannot replace newer content.
let _showToken = 0;
let _readerSession = 0;

// Cache section responses and prefetch choice targets; reset the cache on each book open.
const _sectionCache = new Map();

function _prefetchChoices(choices) {
  for (const raw of choices || []) {
    // Normalize choice IDs before terminal checks and cache lookups.
    const c = parseSecId(raw);
    if (c === null || isTerminal(c)) continue;
    const key = String(c);
    if (_sectionCache.has(key)) continue;
    // Prefetch is independent of the display generation: stale display requests may still warm the cache.
    apiFetch(`/api/books/${currentBookId}/sections/${encodeURIComponent(c)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) _sectionCache.set(key, data); })
      .catch(() => {});
  }
}

export async function renderReader(mount, book, onBack, { startAtOne = false, isAdmin = false } = {}) {
  ++_showToken;
  const session = ++_readerSession;
  const authToken = getToken();
  mount.innerHTML = `<div class="m-topbar"><button type="button" id="m-access-back"></button></div><div class="m-top" id="m-access-body"></div>`;
  const back = mount.querySelector('#m-access-back');
  back.textContent = t('mobile.back_home');
  back.addEventListener('click', () => { ++_readerSession; ++_showToken; onBack(); });
  const gateBody = mount.querySelector('#m-access-body');
  const isCurrent = () => authToken === getToken() && session === _readerSession && mount.isConnected;
  const resume = async () => {
    const opening = renderReader(mount, book, onBack, { startAtOne: true, isAdmin });
    const openingSession = _readerSession;
    try {
      await opening;
    } catch (error) {
      if (openingSession !== _readerSession || authToken !== getToken() || !mount.isConnected) return;
      console.warn('Unlocked reader failed to load', error);
      mount.innerHTML = '<div class="m-topbar"><button id="m-access-back"></button></div><div class="m-top"><p id="m-access-error"></p><button id="m-access-retry" class="reading-unlock-button"></button></div>';
      mount.querySelector('#m-access-error').textContent = t('auth.network_error');
      const back = mount.querySelector('#m-access-back');
      back.textContent = t('mobile.back_home');
      back.addEventListener('click', () => { ++_readerSession; ++_showToken; onBack(); });
      const retry = mount.querySelector('#m-access-retry');
      retry.textContent = t('covers.error_retry');
      retry.addEventListener('click', resume);
    }
  };
  const locked = await showReadingGate(gateBody, book.id, { isCurrent, onUnlock: resume });
  if (!isCurrent() || locked) return;
  _sectionCache.clear();
  mount.innerHTML = `
    <div class="m-topbar">
      <button id="m-back-btn">${t('mobile.back_home')}</button>
      <span class="m-book-title">${_escapeHtml(book.name)}</span>
      <button id="m-toggle-text-btn" class="m-pane-toggle-btn" aria-label="${t('mobile.text_only')}">${ICON_TEXT}</button>
      <button id="m-toggle-graph-btn" class="m-pane-toggle-btn" aria-label="${t('mobile.graph_only')}">${ICON_GRAPH}</button>
      ${isAdmin ? `<button id="m-mode-track-btn" class="m-pane-toggle-btn" aria-label="${t('track.switch_to_track')}">${ICON_TRACK}</button>` : ''}
    </div>
    <div class="m-panes" id="m-panes">
      <div id="m-top" class="m-top">${_loadingHtml(t('mobile.loading'))}</div>
      <div class="m-tool-row">
        <button id="m-undo-btn" class="m-tool-btn"></button>
        <button id="m-fasttravel-btn" class="m-tool-btn"></button>
      </div>
      <div class="m-tool-row" id="m-endrun-row">
        <button id="m-win-btn" class="m-tool-btn m-win-btn">${t('runs.victory')}</button>
        <button id="m-loss-btn" class="m-tool-btn m-loss-btn">${t('runs.death')}</button>
        <button id="m-battledeath-btn" class="m-tool-btn m-battledeath-btn">${t('runs.battle_death')}</button>
      </div>
      <div class="m-tool-row">
        <button id="m-notebook-btn" class="m-tool-btn">${t('notes.notebook_title')}</button>
        <button id="m-battlesim-btn" class="m-tool-btn" style="display:none">${t('battlesim.title')}</button>
      </div>
      <div id="m-graph-wrap" class="m-graph-wrap">
        <div id="m-graph" class="m-graph"></div>
        <div id="m-graph-loading" class="m-graph-loading">${_loadingHtml(t('mobile.loading_graph'))}</div>
      </div>
    </div>`;
  document.getElementById('m-back-btn').addEventListener('click', () => { ++_readerSession; ++_showToken; onBack(); });
  document.getElementById('m-notebook-btn').addEventListener('click', () => openNotebook(book.id));
  document.getElementById('m-undo-btn').addEventListener('click', _undoRun);
  document.getElementById('m-fasttravel-btn').addEventListener('click', () => openFastTravelDialog(_doFastTravel));
  document.getElementById('m-win-btn').addEventListener('click', () =>
    showConfirm(t('mobile.confirm_win'), () => _endPlaythrough('success'), { confirmLabel: t('runs.victory'), danger: false, win: true }));
  document.getElementById('m-loss-btn').addEventListener('click', () =>
    showConfirm(t('mobile.confirm_loss'), () => _endPlaythrough('death'), { confirmLabel: t('runs.death') }));
  document.getElementById('m-battledeath-btn').addEventListener('click', () =>
    showConfirm(t('mobile.confirm_battle_death'), () => {
      // Mark the section as a battle as well as ending the run.
      const sec = currentSection();
      if (sec !== null && !state.graph[sec]?.battle) {
        if (!state.graph[sec]) state.graph[sec] = { choices: [] };
        state.graph[sec].battle = true;
      }
      _endPlaythrough('battle');
    }, { confirmLabel: t('runs.battle_death') }));
  document.getElementById('m-toggle-text-btn').addEventListener('click', () => _setPaneMode(_paneMode === 'text' ? 'both' : 'text'));
  document.getElementById('m-toggle-graph-btn').addEventListener('click', () => _setPaneMode(_paneMode === 'graph' ? 'both' : 'graph'));
  if (isAdmin) document.getElementById('m-mode-track-btn').addEventListener('click', async () => {
    ++_readerSession; ++_showToken;
    const { renderTrack } = await import('./track.js');
    renderTrack(mount, book, onBack, { isAdmin: true });
  });
  _setPaneMode('both');

  const battlesimBtn = document.getElementById('m-battlesim-btn');
  if (hasSim(book.id)) {
    battlesimBtn.style.display = '';
    battlesimBtn.addEventListener('click', async () => {
      try {
        await openSimForBook(book.id);
      } catch (error) {
        console.warn('Mobile simulator failed to load', error);
        showAlert(t('auth.network_error'));
      }
    });
  }

  // Keep stable hook references for the session's one-time dialog bindings.
  const ctxHooks = { checkXpReward: _checkXpReward, maxFastTravels: _maxFastTravels, doFastTravel: _doFastTravel };
  initGraphView(
    document.getElementById('m-graph'),
    sec => _onGraphTap(parseSecId(sec) ?? sec),
    (sec, x, y) => openNodeContextMenu(parseSecId(sec) ?? sec, x, y, ctxHooks),
    hideNodeContextMenu,
  );

  // Clear pending toast rewards between book sessions.
  _xpToastPending = 0;
  _xpToastVisibleUntil = 0;
  _seedXpBaseline();
  await loadState(book.id, { strict: true, isCurrent });
  if (!isCurrent()) return;
  if (!currentPlaythrough() || (startAtOne && currentSection() !== 1)) {
    const startSec = startAtOne ? 1 : (isValidSecId(state.startSection) ? state.startSection : 1);
    _startPlaythrough(startSec);
    await saveState();
  } else {
    // Catch up on anything a desktop session did since mobile last saved -
    // see _ensureMVisited's own comment for why this matters.
    _ensureMVisited(currentPlaythrough());
  }
  _updateRunControls();
  await _showSection(currentSection());
}

// Match desktop's level-based limits without importing its UI dependencies.
function _maxUndos()       { const lvl = currentUserLevel || 0; return (lvl <= 30 ? 3 : Math.min(10, 3 + Math.ceil((lvl - 30) / 10))) + (bonusUndos || 0); }
function _maxFastTravels() { const lvl = currentUserLevel || 0; return (lvl <= 30 ? 3 : Math.min(10, 3 + Math.ceil((lvl - 30) / 10))) + (bonusFastTravels || 0); }

// Keeps the two run-control buttons' label/disabled state in sync with the
// live playthrough - called after every render, undo, and fast travel.
function _updateRunControls() {
  const undoBtn = document.getElementById('m-undo-btn');
  const ftBtn   = document.getElementById('m-fasttravel-btn');
  if (!undoBtn || !ftBtn) return;
  const pt = currentPlaythrough();
  const undosLeft = _maxUndos() - (pt?.undosUsed || 0);
  const ftLeft     = _maxFastTravels() - (pt?.fastTravelsUsed || 0);
  undoBtn.textContent = t('runs.undo', { n: undosLeft });
  undoBtn.disabled = !pt || undosLeft <= 0 || pt.path.length <= 1;
  ftBtn.textContent = t('runs.fasttravel', { n: ftLeft });
  ftBtn.disabled = !pt || ftLeft <= 0;
  // Require a started run before recording an outcome.
  const endRow = document.getElementById('m-endrun-row');
  if (endRow) endRow.style.display = (pt && pt.path.length > 0) ? '' : 'none';
}

// Undo past forced nodes; mobile omits portal handling and lets refreshGraph recenter.
function _undoRun() {
  const pt = currentPlaythrough();
  if (!pt) return;
  const used = pt.undosUsed || 0;
  if (used >= _maxUndos() || pt.path.length <= 1) return;
  pt.path.pop();
  while (pt.path.length > 1) {
    const node = state.graph[pt.path[pt.path.length - 1]];
    if (!node || node.choices.length !== 1) break;
    const hasMetadata = node.note || node.priority || node.battle || node.color || node.portals || node.showNote || node.manual;
    const wouldAutoNavHere = !isTerminal(node.choices[0]) && !pt.path.includes(node.choices[0]);
    if (hasMetadata && !wouldAutoNavHere) break;
    pt.path.pop();
  }
  pt.undosUsed = used + 1;
  pt.lastActionAt = Date.now();
  saveState();
  const sec = pt.path[pt.path.length - 1];
  _showSection(sec);
}

// Fast travel with manual section entry and four route preferences.
function _doFastTravel(mode, id) {
  const pt = currentPlaythrough();
  if (!pt) return;
  const from = currentSection();
  if (!canReach(from, id)) { showAlert(t('ctx.fasttravel.no_path')); return; }
  const path = findPathTo(from, id, mode);
  if (!path || path.length < 2) { showAlert(t('ctx.fasttravel.no_path')); return; }
  const mVisited = _ensureMVisited(pt);
  for (let i = 1; i < path.length; i++) {
    pt.path.push(path[i]);
    if (!mVisited.includes(path[i])) mVisited.push(path[i]);
  }
  pt.fastTravelsUsed = (pt.fastTravelsUsed || 0) + 1;
  pt.lastActionAt = Date.now();
  saveState();
  document.getElementById('ft-overlay')?.classList.remove('active');
  _showSection(id);
}

async function _showSection(sec) {
  // Restore text for real navigation; leave text-only mode unchanged.
  if (_paneMode === 'graph') _setPaneMode('both');
  const top = document.getElementById('m-top');
  if (!top) return;
  const token = ++_showToken;

  const cacheKey = String(sec);
  let data = _sectionCache.get(cacheKey);
  if (!data) {
    top.innerHTML = _loadingHtml(t('mobile.loading'));
    let res;
    try {
      res = await apiFetch(`/api/books/${currentBookId}/sections/${encodeURIComponent(sec)}`);
    } catch (_) {
      return;
    }
    if (token !== _showToken) return;

    if (!res.ok) {
      top.innerHTML = `
        <div class="m-notice">
          <p class="m-end">${t('mobile.not_available')}</p>
          <p class="m-manual-hint">${t('mobile.manual_hint')}</p>
        </div>`;
      refreshGraph(sec);
      _hideGraphLoading();
      _updateRunControls();
      return;
    }
    data = await res.json();
    if (token !== _showToken) return;
    _sectionCache.set(cacheKey, data);
  }

  top.innerHTML = data.html;
  top.scrollTop = 0;
  // Prefetch choice targets while the current section is being read.
  _prefetchChoices(data.choices);
  if (data.choices?.length) {
    _commitChoices(sec, data.choices);
    // Save again after fetching choices: the earlier navigation save did not contain them.
    saveState();
  }
  // Check rewards for leaf visits too, not only sections with choices.
  _checkXpReward();
  refreshGraph(sec);
  _hideGraphLoading();
  _updateRunControls();

  // Show non-section links as bonus prose without changing the graph or run path.
  top.querySelectorAll('a[href^="#"]').forEach(a => {
    const href = a.getAttribute('href').slice(1);
    if (!href) return;
    a.addEventListener('click', e => {
      e.preventDefault();
      if (href.startsWith('section-')) {
        const dest = parseSecId(href.slice('section-'.length));
        if (dest !== null) _navigate(dest);
      } else {
        _showExtra(href);
      }
    });
  });
}

// Graph taps preview mapped sections only; in-text choices perform navigation.
// Long-press Fast Travel is an explicit navigation exception.
function _onGraphTap(sec) {
  // Keep graph-only taps from restoring text and resizing the canvas during a gesture.
  if (_paneMode === 'graph') return;
  // Treat a tap on the current node as reading, not a read-only preview.
  if (sec === currentSection()) { _returnToCurrent(); return; }
  if (isSectionMapped(sec)) _previewSection(sec);
}

function _navigate(sec) {
  const pt = currentPlaythrough();
  if (!pt) return;
  if (isTerminal(sec)) {
    pt.completed   = true;
    pt.result      = sec === 0 ? 'success' : 'death';
    pt.completedAt = Date.now();
    pt.lastActionAt = Date.now();
    // Retain the completed run as viewingPt so its final path remains visible.
    setViewingPt(pt);
    saveState();
    _checkXpReward();
    refreshGraph(sec);
    _showEndScreen(pt.result);
    return;
  }
  pt.path.push(sec);
  const mVisited = _ensureMVisited(pt);
  if (!mVisited.includes(sec)) mVisited.push(sec);
  pt.lastActionAt = Date.now();
  saveState();
  _showSection(sec);
}

// Manual outcomes cover unnumbered endings and simulated battle deaths.
function _endPlaythrough(result) {
  const pt = currentPlaythrough();
  if (!pt) return;
  const sec = currentSection();
  pt.completed    = true;
  pt.result       = result;
  pt.completedAt  = Date.now();
  pt.lastActionAt = Date.now();
  setViewingPt(pt);
  // A simulated battle loss ends the run, not every future visit to this section.
  if (result !== 'battle' && sec !== null && isValidSecId(sec)) {
    if (!state.graph[sec]) state.graph[sec] = { choices: [] };
    const sentinel = result === 'success' ? 0 : -1;
    if (!state.graph[sec].choices.includes(sentinel)) state.graph[sec].choices.push(sentinel);
  }
  saveState();
  _checkXpReward();
  refreshGraph(sec);
  _showEndScreen(result);
}

// Return from previews/asides to the active section or viewingPt's terminal screen.
function _returnToCurrent() {
  if (!currentPlaythrough() && viewingPt?.completed) _showEndScreen(viewingPt.result);
  else _showSection(currentSection());
}

// Use shared achievement icons/headings; reward toasts already report XP.
function _showEndScreen(result) {
  if (_paneMode === 'graph') _setPaneMode('both'); // see _showSection's own comment
  const top = document.getElementById('m-top');
  if (!top) return;
  ++_showToken; // invalidate any in-flight section fetch
  const win = result === 'success';
  top.innerHTML = `<div class="m-end-achievement m-end-achievement--${win ? 'win' : 'death'}">
    ${win ? TROPHY_SVG : BROKEN_SHIELD_SVG}
    <div class="m-end-heading">${t(terminalHeadingKey(win))}</div>
  </div>`;
  _updateRunControls();
}

async function _showExtra(key) {
  const top = document.getElementById('m-top');
  if (!top) return;
  const token = ++_showToken;
  let res;
  try {
    res = await apiFetch(`/api/books/${currentBookId}/sections/${encodeURIComponent(key)}`);
  } catch (_) {
    return;
  }
  if (token !== _showToken || !res.ok) return;
  const data = await res.json();
  if (token !== _showToken) return;
  top.innerHTML = `${data.html}<p class="m-back-link"><a href="#" id="m-extra-back">${t('mobile.back')}</a></p>`;
  top.scrollTop = 0;
  document.getElementById('m-extra-back')?.addEventListener('click', e => {
    e.preventDefault();
    _returnToCurrent();
  });
}

// Preview without moving the run or graph center; in-text links lead to more previews.
async function _previewSection(sec) {
  if (_paneMode === 'graph') _setPaneMode('both'); // see _showSection's own comment
  const top = document.getElementById('m-top');
  if (!top) return;
  const token = ++_showToken;

  const cacheKey = String(sec);
  let data = _sectionCache.get(cacheKey);
  if (!data) {
    let res;
    try {
      res = await apiFetch(`/api/books/${currentBookId}/sections/${encodeURIComponent(sec)}`);
    } catch (_) {
      return;
    }
    if (token !== _showToken || !res.ok) return;
    data = await res.json();
    if (token !== _showToken) return;
    _sectionCache.set(cacheKey, data);
  }

  if (data.choices?.length) _commitChoices(sec, data.choices);

  top.innerHTML = `
    <p class="m-preview-banner">${t('mobile.preview_banner', { sec })}</p>
    ${data.html}
    <p class="m-back-link"><a href="#" id="m-preview-return">${t('mobile.preview_return')}</a></p>`;
  top.scrollTop = 0;

  document.getElementById('m-preview-return').addEventListener('click', e => {
    e.preventDefault();
    _returnToCurrent();
  });
  top.querySelectorAll('a[href^="#"]').forEach(a => {
    if (a.id === 'm-preview-return') return;
    const href = a.getAttribute('href').slice(1);
    if (!href) return;
    a.addEventListener('click', e => {
      e.preventDefault();
      if (href.startsWith('section-')) {
        const dest = parseSecId(href.slice('section-'.length));
        // Gate preview links to mapped sections to prevent spoilers.
        if (dest !== null) _onGraphTap(dest);
      } else {
        _showExtra(href);
      }
    });
  });
}
