// reader.js - The "double-screen" play view: top pane is in-app reading,
// bottom pane is always the graph (graph-view.js). Reading-only for
// navigation specifically - mobile play is scoped to books with imported
// text, no manual section entry/choice recording (typing section numbers
// works fine at a desk next to a keyboard; on a phone it means putting the
// book down, hunting-and-pecking on glass, then picking the book back up -
// a much worse version of the same friction, not a smaller one). Reading
// and tapping (in-text links, graph nodes) covers real navigation; the
// manual Win/Loss/Battle Death buttons still exist (same as desktop) for
// ending a run the book's own text doesn't link to a numbered 0/-1 choice,
// or a battle-sim loss, which never has an in-text link at all. A gap in an
// otherwise-covered book (a section or two without imported text) shows a
// plain "not available here" message instead of falling into manual entry.
//
// Reuses state.js directly, and graph.js's canReach/findPathTo (pure
// pathfinding, no vis-network/DOM coupling at module load), but does NOT
// import play.js/liveread.js - those pull in charsheet.js/equipment.js and
// vis-network gets loaded separately, on its own terms, for the graph pane
// below. commitChoices/startPlaythrough/undoRun/fast-travel/endPlaythrough
// are small, deliberately-local reimplementations of the same DOM-free
// logic play.js already has (play.js:856-888, startPlaythrough, undoRun,
// doJump, endPlaythrough).
//
// This file owns pane orchestration, section navigation, and playthrough
// lifecycle only - the long-press node context menu (context-menu.js), its
// note editor (note-modal.js), and the toolbar's Fast Travel dialog
// (fast-travel-dialog.js) are each their own self-contained UI module, not
// built here. reader.js passes them the playthrough-lifecycle functions
// they need (checkXpReward/maxFastTravels/doFastTravel) as plain parameters
// on each call rather than those files importing reader.js back - avoids a
// reader.js <-> {context-menu,note-modal,fast-travel-dialog}.js import
// cycle, since reader.js is already the one importing all three.

import {
  state, loadState, saveState, apiFetch, currentBookId,
  currentPlaythrough, currentSection, isTerminal, isValidSecId, parseSecId,
  setViewingPt, viewingPt, currentUserLevel, bonusUndos, bonusFastTravels,
} from '../../js/state.js';
import { canReach, findPathTo } from '../../js/graph.js';
import { showAlert, showConfirm } from '../../js/confirm.js';
import { initGraphView, refreshGraph } from './graph-view.js';
import { openNotebook } from './notebook.js';
import { hasSim, openSimForBook } from './battlesim-dispatch.js';
import { showToast } from './toast.js';
import { openNodeContextMenu, hideNodeContextMenu } from './context-menu.js';
import { openFastTravelDialog } from './fast-travel-dialog.js';
import { t } from '../../js/i18n.js';

// Reward feedback (see toast.js's own header comment for why mobile uses a
// toast rather than porting rewards.js's fly-to-badge floaters). Desktop
// only learns XP was awarded via a live SSE push on /api/user/stream
// (livetab.js) - deliberately not imported here, so mobile has to find out
// on its own instead: cache the last known XP total, then after a real
// navigation re-check it once the server's fire-and-forget award (see
// processStateXp in server/routes/books.js, which runs *after* the save's
// own response is already sent) has had time to land. 750ms matches
// desktop's own _scheduleRewardProfileRefresh delay for the same race.
//
// Mirrors two things rewards.js does for the exact same reason - toast.js's
// own showToast() just overwrites whatever's currently visible, so without
// this a second award landing close behind the first would silently erase
// it rather than show or merge it:
//   1. Multiple _checkXpReward() calls within the same 750ms window collapse
//      into a single poll (_xpFlushTimer), same as rewards.js's own
//      _queueRewardFloater accumulating window.
//   2. If a toast from an earlier poll is still on screen when a later one
//      resolves, the new delta is added to it and the display timer resets,
//      rather than replacing it - same spirit as rewards.js's floater queue,
//      just additive instead of a literal stacked queue (mobile's toast only
//      ever shows one message at a time).
let _lastKnownXp     = null;
let _xpFlushTimer    = null;
let _xpToastPending  = 0;
let _xpToastVisibleUntil = 0;
async function _seedXpBaseline() {
  try {
    const res = await apiFetch('/api/profile');
    if (res.ok) _lastKnownXp = (await res.json()).xp ?? null;
  } catch (_) {}
}
function _checkXpReward() {
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

function _loadingHtml(label) {
  return `<div class="m-loading"><div class="m-spinner"></div><span>${_escapeHtml(label)}</span></div>`;
}

// The graph pane's own placeholder (see #m-graph-loading in renderReader) -
// separate element layered over #m-graph rather than swapped innerHTML,
// since initGraphView()'s vis.Network takes ownership of #m-graph's own
// content the moment it's constructed. Hidden for good once the first real
// section load populates the graph; nothing ever shows it again.
function _hideGraphLoading() {
  const el = document.getElementById('m-graph-loading');
  if (el) el.style.display = 'none';
}

// 'both' | 'text' | 'graph' - which pane(s) are showing. Each toggle button
// sets its own mode, or clears back to 'both' if it's already active -
// there's no state where both toggles could claim to be "on" at once, so
// only one button ever needs the active look.
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
  // #m-graph-wrap sits at display:none the whole time text-only mode is
  // active, so vis-network's own autoResize never sees it change size and
  // the canvas/centering it last computed goes stale. Re-running
  // refreshGraph() once the wrap is visible again forces a fresh
  // moveTo() against the container's real (now non-zero) size.
  if (prev === 'text' && mode !== 'text') {
    requestAnimationFrame(() => refreshGraph(currentSection()));
  }
}

// Mirrors play.js's commitChoices() - reveal-on-arrival: merge this
// section's own choice list into state.graph, deduped/sorted, preserving
// any existing per-node metadata (note/priority/etc - mobile never writes
// those itself, kept only so a desktop session editing the same run later
// doesn't lose anything).
function _commitChoices(sec, choices) {
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

// Mirrors play.js's startPlaythrough() shape, stripped to what mobile
// needs. Doesn't call equipment.js's instantiateLoadout() (desktop-only
// machinery, and a book's own configured starting-item template - if any -
// won't get applied to a mobile-started run for now), but does fill in
// empty-but-present inventory/equipment/diceState in the exact shape
// instantiateLoadout() itself falls back to with no template configured, so
// inventory.js/equipment.js/dice.js don't hit an undefined field if the same
// run is later opened on desktop.
function _startPlaythrough(startSec) {
  state.playthroughs.push({
    path: [startSec], completed: false, result: null,
    undosUsed: 0, fastTravelsUsed: 0, startedAt: Date.now(),
    charSheet: { fields: [] },
    inventory: [], equipment: {}, equipmentVisible: {},
    diceState: { count: 2, die: 6, lastResult: null },
    // Every section ever actually read this run, permanent - unlike
    // pt.path (which undo shrinks), this never loses an entry. Drives both
    // the graph's "visited" node colour (see graph-view.js's refreshGraph)
    // and which nodes a tap is even allowed to preview (see _onGraphTap) -
    // desktop has no equivalent since it doesn't gate graph taps at all.
    mVisited: [startSec],
  });
  state.activePtIndex = state.playthroughs.length - 1;
}

// A run saved before mVisited existed won't have it yet - seed it from the
// live path. Also reconciles an EXISTING mVisited against the live path
// every time, not just when missing - mVisited is mobile-only (desktop's
// play.js has no idea it exists), so a session that goes mobile -> desktop
// -> mobile comes back with pt.path grown by real desktop navigation but
// mVisited untouched. pt.path is the one field both platforms reliably
// keep current, so folding it in here on every load is what keeps a node
// actually read on desktop from showing as unvisited (wrong graph colour,
// and blocked from preview) the next time the same run is opened on mobile.
function _ensureMVisited(pt) {
  if (!Array.isArray(pt.mVisited)) pt.mVisited = [];
  for (const sec of pt.path) if (!pt.mVisited.includes(sec)) pt.mVisited.push(sec);
  return pt.mVisited;
}

// Bumped on every call and re-checked after each await, same pattern as
// liveread.js's own _showToken - a slower, now-stale fetch (e.g. from
// tapping two links quickly) can't overwrite the panel after a newer
// request already won.
let _showToken = 0;

export async function renderReader(mount, book, onBack) {
  mount.innerHTML = `
    <div class="m-topbar">
      <button id="m-back-btn">${t('mobile.back_home')}</button>
      <span class="m-book-title">${_escapeHtml(book.name)}</span>
      <button id="m-toggle-text-btn" class="m-pane-toggle-btn" aria-label="${t('mobile.text_only')}">${ICON_TEXT}</button>
      <button id="m-toggle-graph-btn" class="m-pane-toggle-btn" aria-label="${t('mobile.graph_only')}">${ICON_GRAPH}</button>
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
  document.getElementById('m-back-btn').addEventListener('click', onBack);
  document.getElementById('m-notebook-btn').addEventListener('click', () => openNotebook(book.id));
  document.getElementById('m-undo-btn').addEventListener('click', _undoRun);
  document.getElementById('m-fasttravel-btn').addEventListener('click', () => openFastTravelDialog(_doFastTravel));
  document.getElementById('m-win-btn').addEventListener('click', () =>
    showConfirm(t('mobile.confirm_win'), () => _endPlaythrough('success'), { confirmLabel: t('runs.victory'), danger: false, win: true }));
  document.getElementById('m-loss-btn').addEventListener('click', () =>
    showConfirm(t('mobile.confirm_loss'), () => _endPlaythrough('death'), { confirmLabel: t('runs.death') }));
  document.getElementById('m-battledeath-btn').addEventListener('click', () =>
    showConfirm(t('mobile.confirm_battle_death'), () => {
      // Matches play.js's own battle-death-btn handler: marks the current
      // node's battle flag too, not just the run outcome - otherwise this
      // node would never get the graph's battle badge just because the
      // death happened to come from a sim instead of the book text.
      const sec = currentSection();
      if (sec !== null && !state.graph[sec]?.battle) {
        if (!state.graph[sec]) state.graph[sec] = { choices: [] };
        state.graph[sec].battle = true;
      }
      _endPlaythrough('battle');
    }, { confirmLabel: t('runs.battle_death') }));
  document.getElementById('m-toggle-text-btn').addEventListener('click', () => _setPaneMode(_paneMode === 'text' ? 'both' : 'text'));
  document.getElementById('m-toggle-graph-btn').addEventListener('click', () => _setPaneMode(_paneMode === 'graph' ? 'both' : 'graph'));
  _setPaneMode('both');

  const battlesimBtn = document.getElementById('m-battlesim-btn');
  if (hasSim(book.id)) {
    battlesimBtn.style.display = '';
    battlesimBtn.addEventListener('click', () => openSimForBook(book.id));
  }

  // Stable function references, built once per renderReader() call and
  // reused for the whole reader session - context-menu.js captures this in
  // its own one-time DOM-build closures (see that file's own comment).
  const ctxHooks = { checkXpReward: _checkXpReward, maxFastTravels: _maxFastTravels, doFastTravel: _doFastTravel };
  initGraphView(
    document.getElementById('m-graph'),
    sec => _onGraphTap(parseSecId(sec) ?? sec),
    (sec, x, y) => openNodeContextMenu(parseSecId(sec) ?? sec, x, y, ctxHooks),
    hideNodeContextMenu,
  );

  // Fresh per book session - a leftover pending amount from a book closed
  // less than 2.2s ago would otherwise get added onto this book's first
  // real award, showing an inflated total that has nothing to do with it.
  _xpToastPending = 0;
  _xpToastVisibleUntil = 0;
  _seedXpBaseline();
  await loadState(book.id);
  if (!currentPlaythrough()) {
    const startSec = isValidSecId(state.startSection) ? state.startSection : 1;
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

// Same level-based formula as play.js's own maxUndos()/maxFastTravels() -
// duplicated rather than imported since importing play.js would pull in
// charsheet.js/equipment.js/graph.js's initGraph/syncGraph, exactly the
// desktop-DOM-coupled weight this file's header explains mobile avoids.
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
  // Same gating as desktop's own !isPlaceholder check (play.js) - a run
  // that hasn't taken its first step yet has no section to mark an outcome
  // against.
  const endRow = document.getElementById('m-endrun-row');
  if (endRow) endRow.style.display = (pt && pt.path.length > 0) ? '' : 'none';
}

// Mirrors play.js's undoRun() (same pop-past-forced-passthroughs walk-back
// logic) minus the open-world portal check (mobile doesn't support
// open-world/portals) and the final network.focus() call (refreshGraph's
// own centerOnSec argument already does the equivalent re-centering).
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

// ── Fast travel ──────────────────────────────────────────────────────────
// Same dialog shape as desktop's showFastTravelDialog()/doJump() (numeric
// section entry + high/shortest/normal/low path-preference modes) rather
// than a mobile-native tap-to-arm flow - desktop's dialog is genuinely the
// wanted UX here, not a compromise. Reuses .inv-overlay/.inv-modal (already
// linked via equipment.css) and .inv-qty-* for the stepper instead of
// desktop's own .cs-num-wrap/.ft-dialog-* (neither of which mobile links),
// matching the app's broader modal/stepper convention instead.
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
  // Graph-only mode hides #m-top entirely - rendering into it there would
  // be a silent no-op the reader can't see, so any real navigation brings
  // the text back first. (Text-only mode is left alone: the graph being
  // hidden doesn't stop reading, and refreshGraph() below still keeps its
  // state current for whenever the reader switches back.)
  if (_paneMode === 'graph') _setPaneMode('both');
  const top = document.getElementById('m-top');
  if (!top) return;
  const token = ++_showToken;
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
  const data = await res.json();
  if (token !== _showToken) return;

  top.innerHTML = data.html;
  top.scrollTop = 0;
  if (data.choices?.length) {
    _commitChoices(sec, data.choices);
    // _navigate's own saveState() already fired before this fetch resolved,
    // so it saved pt.path/mVisited but not these just-discovered choices -
    // without a second save here they only reach the server the next time
    // something else happens to call saveState (e.g. opening live-reading,
    // which is why desktop wouldn't see them until then).
    saveState();
  }
  // Checked regardless of whether this section had any choices to commit -
  // a dead-end/leaf section (no outgoing choices at all) is still a real
  // first-time visit and still XP-eligible; gating this on data.choices too
  // would silently skip the toast for exactly that case. _navigate's own
  // earlier save already carries a dead-end visit like this one, so there's
  // always *some* save behind this check either way.
  _checkXpReward();
  refreshGraph(sec);
  _hideGraphLoading();
  _updateRunControls();

  // Any in-text link that isn't a real #section-N choice (e.g. an unnumbered
  // "Epilogue" some books tack on after their win section) is pure bonus
  // text - fetched and shown inline, never touching state.graph/pt.path.
  // Same pattern as liveread.js's _showExtra, same reasoning: importing a
  // non-numeric target as a real choice would register it as a graph node
  // it isn't.
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

// A plain tap NEVER advances the run, even onto an adjacent already-known
// choice - that's real navigation and belongs to tapping the choice's
// in-text link instead (see _showSection's own link wiring), the one and
// only way pt.path is allowed to change from a tap. A tap only ever opens
// a read-only preview, and only for a node the player has actually read
// before (pt.mVisited) - showing an unvisited node's real text on a tap
// would let the reader skip ahead just by touching the map, which is
// exactly the "cheating" this gate exists to prevent. Long-press (see
// _onGraphHold) is the only tap-adjacent gesture that can still move the
// run, via its own explicit Fast Travel action.
function _onGraphTap(sec) {
  // Graph-only mode exists so the reader can pan/zoom/drag the map without
  // the reading pane in the way - _previewSection/_returnToCurrent both
  // force _setPaneMode('both') to have somewhere to put the text, which
  // resizes #m-graph-wrap out from under an in-progress touch (the exact
  // "why does the book reappear and I hit the wrong node" complaint). A tap
  // while genuinely just looking at the map shouldn't be able to yank the
  // layout back; the toggle button is the one deliberate way back to
  // reading.
  if (_paneMode === 'graph') return;
  // Tapping the node the reader is actually standing on isn't a lookup -
  // routing it through _previewSection would show the read-only preview
  // banner and turn its own in-text choice links into more previews
  // instead of real navigation, forcing an extra "return to where you left
  // off" tap before any choice could be clicked at all.
  if (sec === currentSection()) { _returnToCurrent(); return; }
  const pt = currentPlaythrough() || viewingPt;
  const mVisited = pt ? _ensureMVisited(pt) : [];
  if (mVisited.includes(sec)) _previewSection(sec);
}

function _navigate(sec) {
  const pt = currentPlaythrough();
  if (!pt) return;
  if (isTerminal(sec)) {
    pt.completed   = true;
    pt.result      = sec === 0 ? 'success' : 'death';
    pt.completedAt = Date.now();
    pt.lastActionAt = Date.now();
    // currentPlaythrough() stops returning this pt the instant .completed
    // flips true - without keeping a reference here, the graph would lose
    // the whole traveled path (and any final-node color) the moment the
    // run ends. Mirrors play.js's endPlaythrough()/setViewingPt() pairing.
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

// Mirrors play.js's endPlaythrough() - the manual Win/Loss/Battle Death
// buttons, for when the book's own text ends a run without ever linking a
// numbered win(0)/death(-1) choice (or, for Battle Death, when the ending
// comes from a battle sim result rather than the book text at all - there's
// never an in-text link for that one). isTerminal(sec)-driven endings (see
// _navigate above) already cover the common case where the section DOES
// link a real 0/-1 choice; this is the fallback for when it doesn't.
function _endPlaythrough(result) {
  const pt = currentPlaythrough();
  if (!pt) return;
  const sec = currentSection();
  pt.completed    = true;
  pt.result       = result;
  pt.completedAt  = Date.now();
  pt.lastActionAt = Date.now();
  setViewingPt(pt);
  // Same skip-for-battle reasoning as play.js's own endPlaythrough(): a
  // simulated combat loss ends THIS run, but the section itself may have
  // real, not-yet-recorded branches - recording it as a graph-wide dead end
  // would wrongly auto-end every future run that lands on this node.
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

// Shared by _showExtra's and _previewSection's "back"/"return" links - a
// preview (or an extra) can be opened after the run has already ended
// (tapping the graph is still allowed post-completion, see _onGraphTap),
// in which case currentSection() is null and _showSection(null) would 404
// into the "not available" error message instead of restoring the actual
// win/death screen. viewingPt (set by _navigate's terminal branch) is what
// still holds the finished run's result once currentPlaythrough() stops
// returning it, same pairing play.js's own endPlaythrough() uses.
function _returnToCurrent() {
  if (!currentPlaythrough() && viewingPt?.completed) _showEndScreen(viewingPt.result);
  else _showSection(currentSection());
}

function _showEndScreen(result) {
  if (_paneMode === 'graph') _setPaneMode('both'); // see _showSection's own comment
  const top = document.getElementById('m-top');
  if (!top) return;
  ++_showToken; // invalidate any in-flight section fetch
  top.innerHTML = `<p class="m-end">${result === 'success' ? t('liveread.the_end_win') : t('liveread.the_end_death')}</p>`;
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

// Read-only lookup for a graph tap that isn't a live choice from the
// current section (see _onGraphTap) - renders the section's text but never
// touches pt.path/state.graph beyond the same harmless reveal-on-arrival
// commit _showSection itself does, and never calls refreshGraph(), so the
// graph stays centered on the player's real position throughout. In-text
// links inside a preview chain to more previews rather than real
// navigation - clicking a choice link while just looking something up on
// the map should not be able to silently move the run.
async function _previewSection(sec) {
  if (_paneMode === 'graph') _setPaneMode('both'); // see _showSection's own comment
  const top = document.getElementById('m-top');
  if (!top) return;
  const token = ++_showToken;

  let res;
  try {
    res = await apiFetch(`/api/books/${currentBookId}/sections/${encodeURIComponent(sec)}`);
  } catch (_) {
    return;
  }
  if (token !== _showToken || !res.ok) return;
  const data = await res.json();
  if (token !== _showToken) return;

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
        // Same mVisited gate as a graph tap (_onGraphTap) - a link inside
        // an already-visited section's own preview could easily point
        // forward at a section the reader hasn't reached yet, and chaining
        // straight into that would be exactly the spoiler this whole gate
        // exists to prevent.
        if (dest !== null) _onGraphTap(dest);
      } else {
        _showExtra(href);
      }
    });
  });
}
