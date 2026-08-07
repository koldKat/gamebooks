// play.js - Play screen controller: render pipeline, playthrough actions, navigation, graph node modals

import {
  state, viewingPt, viewingPtIndex, setViewingPt, saveState, isTerminal, parseSecId, isValidSecId,
  currentPlaythrough, currentSection, allDiscoveredSections, mappedCount,
  currentUserLevel, bonusUndos, bonusFastTravels, apiFetch,
} from './state.js?v=13';
import { network, visNodes, syncGraph, inevitableOutcome } from './graph.js?v=92';
import { t } from './i18n.js?v=38';
import { renderCharSheetDisplay } from './charsheet.js?v=65';
import { naturalCompare } from './sort.js?v=1';
import { instantiateLoadout } from './equipment.js?v=137';
import { escapeHtml } from './util.js?v=48';

// ── Discoverable sections cap ────────────────────────────────────���───────────
let _discoverableLimit = null;
export function setDiscoverableLimit(n) { _discoverableLimit = (n != null && n > 0) ? n : null; }

// ── Trail collapsed state ────────────────────────────────────────────────────
let _trailCollapsed = localStorage.getItem('trailCollapsed') === '1'; // default expanded
let _onTrailToggle  = null;
export function setTrailCollapsed(v) { _trailCollapsed = !!v; }
export function setOnTrailToggle(fn) { _onTrailToggle = fn; }

// ── Pre-series runs collapsed state ───────────────────────────────────────────
let _preSeriesCollapsed = localStorage.getItem('preSeriesCollapsed') !== '0'; // default collapsed

// ── Custom confirm dialog ────────────────────────────────────────────────────

export function showConfirm(message, onConfirm, { confirmLabel = null, danger = true, showCancel = true, win = false } = {}) {
  const overlay  = document.getElementById('confirm-overlay');
  const msgEl    = document.getElementById('confirm-message');
  const okEl     = document.getElementById('confirm-ok');
  const cancelEl = document.getElementById('confirm-cancel');

  msgEl.textContent            = message;
  okEl.textContent             = confirmLabel ?? t('btn.delete');
  okEl.classList.toggle('warn', !danger && !win);
  okEl.classList.toggle('win', win);
  cancelEl.style.display       = showCancel ? '' : 'none';
  overlay.classList.add('active');

  const newOk     = okEl.cloneNode(true);
  const newCancel = cancelEl.cloneNode(true);
  okEl.parentNode.replaceChild(newOk, okEl);
  cancelEl.parentNode.replaceChild(newCancel, cancelEl);

  const close = () => {
    overlay.classList.remove('active');
    newCancel.style.display = ''; // restore for next use
  };
  newOk.addEventListener('click',     () => { close(); onConfirm(); });
  newCancel.addEventListener('click', close);
}

export function showAlert(message) {
  showConfirm(message, () => {}, { confirmLabel: t('btn.ok'), danger: false, showCancel: false });
}

// Shared by play.js's own choice-parsing and boot.js's start-node/alt-start
// dialogs - all three hit the same "typed an alphanumeric ID while the book
// is still in numeric mode" fork and used to carry their own copy of this
// confirm dialog (message, confirmLabel, and the alphanumericSections/
// saveState flip itself).
export function confirmAlphanumericSwitch(id, onConfirm) {
  showConfirm(
    t('play.alphanumeric_switch_confirm', { id }),
    () => { state.alphanumericSections = true; saveState(); onConfirm(); },
    { confirmLabel: t('play.yes_switch'), danger: false }
  );
}

// Two-choice dialog: message + two action buttons + cancel
export function showTwoChoice(message, labelA, onA, labelB, onB) {
  const overlay  = document.getElementById('choice-overlay');
  const msgEl    = document.getElementById('choice-message');
  const btnA     = document.getElementById('choice-a');
  const btnB     = document.getElementById('choice-b');
  const cancelEl = document.getElementById('choice-cancel');

  msgEl.textContent = message;

  const newA      = btnA.cloneNode(true);
  const newB      = btnB.cloneNode(true);
  const newCancel = cancelEl.cloneNode(true);
  btnA.parentNode.replaceChild(newA, btnA);
  btnB.parentNode.replaceChild(newB, btnB);
  cancelEl.parentNode.replaceChild(newCancel, cancelEl);

  newA.textContent = labelA;
  newB.textContent = labelB;

  overlay.classList.add('active');
  const close = () => overlay.classList.remove('active');
  newA.addEventListener('click',      () => { close(); onA(); });
  newB.addEventListener('click',      () => { close(); onB(); });
  newCancel.addEventListener('click', close);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) close(); });
}

// ── Open world context (set by main.js when a book is opened) ────────────────
let _owIsOpenWorld  = false;
let _owSeriesId     = null;
let _owSeriesBooks  = []; // [{id, name}] - other books in same series, for portal picker
let _owPortalHandler = null; // callback (sec, portal) set by main.js for portal travel

let _onNewSeriesRun    = null; // set by main.js to intercept new-run in open world
let _owCrossBookEnabled = null; // () => bool - returns true if cross-book center is available
let _onViewPublicRun   = null; // (runIndex) => void - opens public run viewer
let _onRunActivated    = null; // (index) => void - called when loadRun activates a run in open world
let _onRunDeleted      = null; // (index) => void - called after deleteRun splices a run in open world
let _owGetRunLocation  = null; // (index) => { bookId, bookName, section } | null - resolves where a series run currently lives

export function setOnViewPublicRun(fn) { _onViewPublicRun = fn; }

export function setOpenWorldContext({ isOpenWorld = false, seriesId = null, seriesBooks = [], onPortalTravel = null, onNewSeriesRun = null, crossBookEnabled = null, onRunActivated = null, onRunDeleted = null, getRunLocation = null } = {}) {
  _owIsOpenWorld       = !!isOpenWorld;
  _owSeriesId          = seriesId;
  _owSeriesBooks       = seriesBooks || [];
  _owPortalHandler     = onPortalTravel || null;
  _onNewSeriesRun      = onNewSeriesRun || null;
  _owCrossBookEnabled  = crossBookEnabled || null;
  _onRunActivated      = onRunActivated || null;
  _onRunDeleted        = onRunDeleted || null;
  _owGetRunLocation    = getRunLocation || null;
}

// ── Render pipeline ─────────────────────────────────────────────────────────

let _afterRenderFn = null;
export function setAfterRenderFn(fn) { _afterRenderFn = fn; }

// New players often don't realize the choices box needs typing into - pulse it
// until they've used it enough times to have clearly figured it out. Synced
// server-side via ui_prefs (see prefs.js), not per-book, since it's about
// general UI familiarity rather than progress in any one book.
export const CHOICES_PULSE_THRESHOLD = 50;
let _choicesRecordedCount  = 0;
let _onChoicesRecordedFn   = null;
export function setChoicesRecordedCount(n) { _choicesRecordedCount = Number(n) || 0; }
export function setOnChoicesRecorded(fn)   { _onChoicesRecordedFn = fn; }

let _suppressAutoNav = false;
export function suppressAutoNav(v) { _suppressAutoNav = !!v; }

// Tracks the section an auto-nav timer is already pending for, so overlapping
// render() calls (e.g. from saveState/SSE side effects) don't each schedule
// their own navigate() - duplicate/out-of-order pushes onto pt.path could make
// the next hop look "already visited" and halt the chain one node early.
let _pendingAutoNavFrom = null;

export function render() {
  const savedChoices = document.getElementById('choices-input')?.value ?? null;
  syncGraph();
  updateStats();
  renderPlaythroughPanel();
  renderCharSheetDisplay();
  if (savedChoices) {
    const inp = document.getElementById('choices-input');
    if (inp) inp.value = savedChoices;
  }
  const centerBtn = document.getElementById('center-current-btn');
  if (centerBtn) {
    const hasCrossBook = _owIsOpenWorld && !!(_owCrossBookEnabled?.());
    centerBtn.disabled = (!currentPlaythrough() || viewingPtIndex >= 0) && !hasCrossBook;
    // When the active run lives in another book, relabel so it's clear clicking will switch books.
    const localSec = currentSection();
    if (hasCrossBook && !localSec) {
      const loc = _owGetRunLocation?.(state.activePtIndex);
      if (loc?.bookName) {
        centerBtn.textContent = loc.section
          ? t('play.center_open_at', { book: loc.bookName, section: loc.section })
          : t('play.center_open', { book: loc.bookName });
      } else {
        centerBtn.textContent = t('play.center_default');
      }
    } else {
      centerBtn.textContent = t('play.center_default');
    }
  }
  if (_afterRenderFn) _afterRenderFn();
}

function updateStats() {
  const discovered       = allDiscoveredSections();
  const normalDiscovered = [...discovered].filter(s => !isTerminal(s)).length;
  const rawTotal         = state.totalSections || 0;
  const total            = _discoverableLimit || rawTotal;
  const mapped           = mappedCount();

  function pct(n) {
    if (!total) return '';
    const p = n >= total ? 100 : Math.min(99, Math.floor(n / total * 100));
    return ` (${p}%)`;
  }

  const titleEl = document.getElementById('book-title');
  titleEl.textContent      = state.bookName || t('books.untitled');
  titleEl.dataset.tooltip  = state.bookName || t('books.untitled');
  document.getElementById('mapped-count').textContent     = mapped;
  document.getElementById('total-count').textContent      = total + pct(mapped);
  document.getElementById('discovered-count').textContent = normalDiscovered;
  const discTotalEl = document.getElementById('discovered-total');
  if (discTotalEl) discTotalEl.textContent = total + pct(normalDiscovered);
  document.getElementById('pt-total').textContent = state.playthroughs.length;
  const deaths   = state.playthroughs.filter(p => p.completed && (p.result === 'death' || p.result === 'battle')).length;
  const wins     = state.playthroughs.filter(p => p.completed && p.result === 'success').length;
  const outcomes = document.getElementById('pt-outcomes');
  if (outcomes) {
    outcomes.innerHTML = (deaths || wins)
      ? ` (<span class="pt-won">${wins} won</span> / <span class="pt-lost">${deaths} lost</span>)`
      : '';
  }

  // Progress bars
  const mappedBar = document.getElementById('mapped-bar');
  if (mappedBar) mappedBar.style.width = total > 0 ? `${Math.min(100, mapped / total * 100)}%` : '0%';
  const discBar = document.getElementById('discovered-bar');
  if (discBar) discBar.style.width = total > 0 ? `${Math.min(100, normalDiscovered / total * 100)}%` : '0%';
  const splitWrap = document.getElementById('pt-split-wrap');
  const winsBar   = document.getElementById('pt-wins-bar');
  const lossBar   = document.getElementById('pt-losses-bar');
  if (splitWrap && winsBar && lossBar) {
    const finished = wins + deaths;
    if (finished > 0) {
      splitWrap.style.display = '';
      winsBar.style.width   = `${wins   / finished * 100}%`;
      lossBar.style.width   = `${deaths / finished * 100}%`;
    } else {
      splitWrap.style.display = 'none';
    }
  }

  // Missing: only shown when mapped == discovered (all found sections are fully mapped)
  const notFoundRow  = document.getElementById('not-found-row');
  const countEl      = document.getElementById('not-found-count');
  const notFoundTotal = document.getElementById('not-found-total');
  if (!notFoundRow || !countEl) return;
  if (total > 0 && mapped === normalDiscovered) {
    const missing = [];
    for (let i = 1; i <= total; i++) {
      if (!discovered.has(i)) missing.push(i);
    }
    const labelEl = document.getElementById('missing-label');
    if (missing.length) {
      notFoundRow.style.display    = '';
      countEl.textContent          = missing.length;
      if (notFoundTotal) notFoundTotal.textContent = total + pct(missing.length);
      if (labelEl) labelEl.dataset.tooltip = missing.join(', ');
    } else {
      notFoundRow.style.display = 'none';
    }
  } else {
    notFoundRow.style.display = 'none';
  }
}

function renderPathTrail(pt, header) {
  const el = document.getElementById('run-trail-float');
  if (!pt || !pt.path.length) { el.innerHTML = ''; return; }

  const isActive = pt === currentPlaythrough();
  const nodes = pt.path.map((s, i) => {
    const isCurrent = isActive && i === pt.path.length - 1;
    return `<span class="trail-node${isCurrent ? ' trail-current' : ''}">${s}</span>`;
  });

  if (pt.completed) {
    const cls = pt.result === 'success' ? 'trail-win' : pt.result === 'battle' ? 'trail-battle' : 'trail-death';
    const lbl = pt.result === 'success' ? '★' : pt.result === 'battle' ? 'BTL' : '✝';
    nodes.push(`<span class="trail-node ${cls}">${lbl}</span>`);
  }

  // Each arrow is glued to the pill BEFORE it inside one wrapper (not the
  // pill after), so when a row wraps, the break falls between two whole
  // .trail-item units - the arrow stays at the end of the row it belongs
  // to instead of landing at the start of the next one.
  const trailHtml = nodes.map((n, i) => i === nodes.length - 1 ? n : `<span class="trail-item">${n}<span class="trail-arrow">›</span></span>`).join('');

  el.classList.toggle('trail-collapsed', _trailCollapsed);
  el.innerHTML =
    `<div class="trail-header">` +
      `<span>${header || t('runs.this')}</span>` +
      `<button class="trail-toggle-btn" aria-label="${t('runs.toggle_trail')}">▾</button>` +
    `</div>` +
    `<div class="trail">${trailHtml}</div>`;

  // Hovering a pill highlights the matching node on the graph, same as the
  // public run-path viewer's trail (public-profile.js's _wirePathHover).
  if (network) {
    el.querySelectorAll('.trail-node').forEach(span => {
      const id = parseInt(span.textContent, 10);
      if (!id || id < 1) return;
      span.addEventListener('mouseenter', () => network.selectNodes([id]));
      span.addEventListener('mouseleave', () => network.selectNodes([]));
    });
  }

  const toggleTrail = () => {
    _trailCollapsed = !_trailCollapsed;
    localStorage.setItem('trailCollapsed', _trailCollapsed ? '1' : '0');
    el.classList.toggle('trail-collapsed', _trailCollapsed);
    if (_onTrailToggle) _onTrailToggle(_trailCollapsed);
  };
  el.querySelector('.trail-header').addEventListener('click', toggleTrail);
  el.querySelector('.trail-toggle-btn').addEventListener('click', e => {
    e.stopPropagation();
    toggleTrail();
  });
}

function renderPlaythroughPanel() {
  const panel = document.getElementById('playthrough-panel');
  const pt    = currentPlaythrough();
  const sec   = currentSection();

  let html = '';

  // ── Active run controls ──────────────────────────────────────
  if (!pt) {
    const viewHeader = viewingPt
      ? (_owIsOpenWorld ? 'Path in this book' : t('runs.path', { n: state.playthroughs.indexOf(viewingPt) + 1 }))
      : null;
    renderPathTrail(viewingPt, viewHeader);
  } else {
    const isPlaceholder = pt.path.length === 0;
    const trailHeader = _owIsOpenWorld ? 'Path in this book' : null;
    renderPathTrail(isPlaceholder ? null : pt, trailHeader);
    const undosLeft = maxUndos() - (pt.undosUsed || 0);
    const undoDisabled = (undosLeft <= 0 || pt.path.length <= 1) ? ' disabled' : '';
    let secDisplay;
    if (isPlaceholder) {
      if (_owIsOpenWorld) {
        const loc = _owGetRunLocation?.(state.activePtIndex);
        const where = loc?.bookName
          ? `in ${escapeHtml(loc.bookName)}${loc.section ? ` at ${loc.section}` : ''} ⇒`
          : 'another book ⇒';
        secDisplay = `<span class="section-cross-book">${where}</span>`;
      } else {
        secDisplay = '-';
      }
    } else {
      secDisplay = sec;
    }
    html += `<div class="section-row"><span class="section-label">${t('record.section')}</span><span class="section-display">${secDisplay}</span></div>` +
            `<div class="run-controls-group">` +
            `<div class="undo-ft-row">` +
            `<button id="undo-run-btn" class="undo-run-btn"${undoDisabled}>${t('runs.undo', { n: undosLeft })}</button>` +
            (!isPlaceholder
              ? `<button id="fasttravel-btn" class="fasttravel-btn" data-tooltip="${t('ft.tooltip')}"${(maxFastTravels() - (pt.fastTravelsUsed || 0)) <= 0 ? ' disabled' : ''}>${t('runs.fasttravel', { n: maxFastTravels() - (pt.fastTravelsUsed || 0) })}</button>`
              : '') +
            `</div>` +
            (!isPlaceholder
              ? `<div class="end-run-group"><div class="win-loss-row"><button id="win-run-btn" class="win-btn">★ Win</button><button id="loss-run-btn" class="loss-btn">✝ Loss</button></div><button id="battle-death-btn" class="battle-death-btn">${t('runs.battle_death')}</button></div>`
              : '') +
            `</div>`;
    const secData = state.graph[sec];
    if (!secData || secData.choices.length === 0) {
      const pulseClass = _choicesRecordedCount < CHOICES_PULSE_THRESHOLD ? ' choices-input--pulse' : '';
      html +=
        `<div class="input-group">` +
          `<label>${t('record.choices.label')}</label>` +
          `<input type="text" id="choices-input" class="${pulseClass.trim()}" placeholder="${t('record.choices.placeholder')}" autocomplete="off">` +
          `<div class="record-btn-row">` +
            `<button id="record-btn" class="primary-btn">${t('record.btn')}</button>` +
          `</div>` +
        `</div>`;
    } else if (secData.choices.length === 1 && !isTerminal(secData.choices[0]) && !pt.path.includes(secData.choices[0]) && !_suppressAutoNav && !(_owIsOpenWorld && secData.portals?.length)) {
      const dest = secData.choices[0];
      if (_pendingAutoNavFrom !== sec) {
        _pendingAutoNavFrom = sec;
        setTimeout(() => {
          _pendingAutoNavFrom = null;
          navigate(dest);
        }, 0);
      }
      const destLabel = dest === -1 ? t('record.death') : dest === 0 ? t('record.victory') : dest;
      html += `<div class="choices-label auto-nav">${t('record.auto', { dest: destLabel })}</div>`;
    } else {
      html += `<div class="choices-label">${t('record.where')}</div><div class="choice-buttons">`;
      const sortedChoices = [...secData.choices].sort((a, b) => {
        if (a >= 1 && b >= 1) return a - b;
        if (a >= 1) return -1;
        if (b >= 1) return 1;
        return a - b;
      });
      // A real destination (not literal -1/0) still gets colored red/green
      // when it inevitably leads to death/win through an unbranching chain -
      // same inevitableOutcome() check the graph's own edge coloring already
      // uses, so a choice pill agrees with the connector leading to it.
      const choiceOutcomeClass = c => {
        if (c === -1) return 'death-btn';
        if (c === 0) return 'win-btn';
        const outcome = inevitableOutcome(c);
        return outcome === 'death' ? 'death-btn' : outcome === 'win' ? 'win-btn' : '';
      };
      html += sortedChoices.map(c => {
        const extra = choiceOutcomeClass(c);
        const lbl   = c === -1 ? t('runs.death') : c === 0 ? t('runs.victory') : c;
        return `<button class="choice-btn ${extra}" data-choice="${c}">${lbl}</button>`;
      }).join('');
      html += `</div>`;
    }
    if (_owIsOpenWorld) {
      html += `<button id="add-portal-btn" class="add-portal-btn" data-tooltip="Add a cross-book portal from this section">⇒ Portal</button>`;
    }
    // ── Portal destinations on this section (open world) ─────────
    if (_owIsOpenWorld && pt) {
      const portals = state.graph[sec]?.portals || [];
      if (portals.length > 0) {
        html += `<div class="portal-destinations">` +
          `<div class="portal-dest-label">${t('play.portal_destinations')}</div>`;
        portals.forEach((p, idx) => {
          const bk = _owSeriesBooks.find(b => b.id === p.targetBookId);
          const bkName = bk ? bk.name : `Book #${p.targetBookId}`;
          const lbl = p.label || `⇒ ${bkName} ${p.targetSection}`;
          html += `<div class="portal-dest-item">` +
            `<button class="portal-travel-btn primary-btn" data-portal-idx="${idx}">⇒ ${lbl}</button>` +
            `<button class="portal-edit-btn" data-portal-idx="${idx}" data-tooltip="Edit portal">✎</button>` +
            `<button class="portal-del-btn" data-portal-idx="${idx}" data-tooltip="Remove portal">✕</button>` +
          `</div>`;
        });
        html += `</div>`;
      }
    }
  }

  // ── Runs list ────────────────────────────────────────────────
  html += `<div class="runs-section">`;
  const noActiveRun = state.activePtIndex === null || state.activePtIndex === undefined;
  html += `<div class="runs-header"><span>${t('runs.header')}</span>` +
          `<div class="runs-header-actions">` +
          `<button id="new-pt-btn" class="new-run-btn${noActiveRun ? ' pulse' : ''}">${t('runs.new')}</button>` +
          (_owIsOpenWorld ? '' : `<button id="new-pt-alt-btn" class="new-run-alt-btn" data-tooltip="Start at a specific section">⚑</button>`) +
          `</div></div>`;

  if (state.playthroughs.length === 0) {
    html += `<div class="runs-empty">${t('runs.empty')}</div>`;
  } else {
    html += `<div class="runs-list">`;
    state.playthroughs.map((p, i) => i).reverse().forEach(i => {
      const p = state.playthroughs[i];
      const isActive   = i === state.activePtIndex;
      const isViewing  = viewingPtIndex >= 0 && i === viewingPtIndex;
      const isPortalPaused = p.completed && p.result === 'portal';
      const isDone     = p.completed && !isPortalPaused;
      // In OW: only suppress the Load button when the run is genuinely active IN this book
      // (has actual progress here and isn't portal-paused to another book).
      // Cross-book placeholder/portal-paused runs keep their Load button so the user can click
      // to navigate to the book where the run lives.
      const isActiveHere = _owIsOpenWorld
        ? (isActive && p.path.length > 0 && !isPortalPaused)
        : isActive;
      const lastSec    = p.path[p.path.length - 1];
      let statusText, statusCls;
      if (isDone) {
        statusText = p.result === 'success' ? t('runs.victory') : p.result === 'battle' ? t('runs.battle') : t('runs.death');
        statusCls  = p.result === 'success' ? 'run-win' : p.result === 'battle' ? 'run-battle' : 'run-death';
      } else if (isPortalPaused) {
        // Portal-paused - run is now active in the target book (via portalTarget) or wherever the series cache says it is.
        const target = p.portalTarget?.bookId
          ? { bookName: (_owSeriesBooks.find(b => b.id === p.portalTarget.bookId)?.name) || `Book #${p.portalTarget.bookId}`, section: p.portalTarget.section }
          : _owGetRunLocation?.(i);
        const targetSec = target?.section ?? '?';
        const targetName = target?.bookName ? escapeHtml(target.bookName) : null;
        statusText = targetName ? `⇒ ${targetName} ${targetSec}` : (lastSec ? `⇒ ${lastSec}` : '⇒ Travelling');
        statusCls  = 'run-portal';
      } else if (!lastSec && _owIsOpenWorld) {
        // Placeholder in open world - run is alive in another book
        const loc = _owGetRunLocation?.(i);
        statusText = loc?.bookName
          ? `<span class="section-cross-book">in ${escapeHtml(loc.bookName)}${loc.section ? ` at ${loc.section}` : ''} ⇒</span>`
          : '<span class="section-cross-book">another book ⇒</span>';
        statusCls  = isActive ? 'run-active-label' : '';
      } else {
        statusText = lastSec ? t('runs.section', { n: lastSec }) : t('runs.section', { n: '-' });
        statusCls  = isActive ? 'run-active-label' : '';
      }
      const isPublic = isDone && (p.isPublic || false);
      html +=
        `<div class="run-item${isActive ? ' run-item-active' : ''}${isViewing ? ' run-item-viewing' : ''}">` +
          `<div class="run-info">` +
            `<span class="run-num">${t('runs.run', { n: i + 1 })}</span>` +
            `<span class="run-status ${statusCls}">${statusText}</span>` +
          `</div>` +
          `<div class="run-actions">` +
            (isDone
              ? `<button class="run-public-btn${isPublic ? ' is-public' : ''}" data-index="${i}">${t('play.public_run')}</button>`
              : '') +
            (!isActiveHere
              ? `<button class="run-load-btn${isViewing ? ' run-view-active' : ''}" data-index="${i}">${t('runs.load')}</button>`
              : '') +
            `<button class="run-del-btn" data-index="${i}" data-tooltip="${escapeHtml(t('runs.delete_run'))}">✕</button>` +
          `</div>` +
        `</div>`;
    });
    html += `</div>`;
  }
  html += `</div>`; // close .runs-section - pre-series runs below are its sibling, not its child

  // ── Pre-series runs (existed before book joined open world series) ───────────
  const preRuns = _owIsOpenWorld ? (state.preSeriesRuns || []) : [];
  if (preRuns.length > 0) {
    html += `<div class="pre-series-runs-section${_preSeriesCollapsed ? ' pre-series-collapsed' : ''}">`;
    html += `<div class="pre-series-runs-header">` +
      `<span>${t('play.before_joining_series')}</span>` +
      `<button class="pre-series-toggle-btn" aria-label="${t('play.toggle_pre_series')}">▾</button>` +
    `</div>`;
    html += `<div class="runs-list">`;
    // Display in reverse: most recent = Run -1 (last in array), oldest = Run -N (first)
    preRuns.map((p, i) => i).reverse().forEach(i => {
      const p    = preRuns[i];
      const negN = -(preRuns.length - i); // -1 for last, -N for first
      const isViewing = viewingPtIndex < 0 && state._viewingPreSeriesIdx === i;
      const isDone = p.completed && p.result !== 'portal';
      const lastSec = p.path[p.path.length - 1];
      let statusText, statusCls;
      if (isDone) {
        statusText = p.result === 'success' ? t('runs.victory') : p.result === 'battle' ? t('runs.battle') : t('runs.death');
        statusCls  = p.result === 'success' ? 'run-win' : p.result === 'battle' ? 'run-battle' : 'run-death';
      } else {
        statusText = lastSec ? t('runs.section', { n: lastSec }) : t('runs.section', { n: '-' });
        statusCls  = '';
      }
      html +=
        `<div class="run-item run-item-preseries${isViewing ? ' run-item-viewing' : ''}">` +
          `<div class="run-info">` +
            `<span class="run-num run-num-preseries">${t('runs.run', { n: negN })}</span>` +
            `<span class="run-status ${statusCls}">${statusText}</span>` +
          `</div>` +
          `<div class="run-actions">` +
            `<button class="run-load-btn run-load-preseries${isViewing ? ' run-view-active' : ''}" data-pre-index="${i}">${t('runs.load')}</button>` +
            `<button class="run-del-btn run-del-preseries" data-pre-index="${i}" data-tooltip="${escapeHtml(t('runs.delete_run'))}">✕</button>` +
          `</div>` +
        `</div>`;
    });
    html += `</div></div>`;
  }

  html += `</div>`;
  panel.innerHTML = html;

  panel.querySelector('.pre-series-runs-header')?.addEventListener('click', () => {
    _preSeriesCollapsed = !_preSeriesCollapsed;
    localStorage.setItem('preSeriesCollapsed', _preSeriesCollapsed ? '1' : '0');
    panel.querySelector('.pre-series-runs-section')?.classList.toggle('pre-series-collapsed', _preSeriesCollapsed);
  });

  // ── Attach events ────────────────────────────────────────────
  document.getElementById('new-pt-btn').addEventListener('click', () => {
    if (_owIsOpenWorld && _onNewSeriesRun) {
      _onNewSeriesRun();
    } else {
      const known = _knownStartSections();
      if (known.length >= 2) {
        showStartPicker(known);
      } else {
        startPlaythrough();
      }
    }
  });

  const newPtAltBtn = document.getElementById('new-pt-alt-btn');
  if (newPtAltBtn && _altStartHandler) newPtAltBtn.addEventListener('click', _altStartHandler);

  const undoBtn = document.getElementById('undo-run-btn');
  if (undoBtn) undoBtn.addEventListener('click', undoRun);

  const ftBtn = document.getElementById('fasttravel-btn');
  if (ftBtn && _fastTravelHandler) ftBtn.addEventListener('click', _fastTravelHandler);

  const winBtn = document.getElementById('win-run-btn');
  if (winBtn) winBtn.addEventListener('click', () =>
    showConfirm('Mark this run as a Victory?', () => endPlaythrough('success'),
      { confirmLabel: '★ Victory', danger: false, win: true }));

  const lossBtn = document.getElementById('loss-run-btn');
  if (lossBtn) lossBtn.addEventListener('click', () =>
    showConfirm('Mark this run as a Loss?', () => endPlaythrough('death'),
      { confirmLabel: '✝ Loss', danger: true }));

  const battleBtn = document.getElementById('battle-death-btn');
  if (battleBtn) battleBtn.addEventListener('click', () =>
    showConfirm('Mark this run as a Battle Death?', () => {
      const sec = currentSection();
      if (sec && !state.graph[sec]?.battle) {
        if (!state.graph[sec]) state.graph[sec] = { choices: [] };
        state.graph[sec].battle = true;
      }
      endPlaythrough('battle');
    }, { confirmLabel: 'Battle Death', danger: true }));

  if (pt) {
    const recBtn = document.getElementById('record-btn');
    if (recBtn) {
      const inp = document.getElementById('choices-input');
      inp.focus();
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') recBtn.click(); });
      recBtn.addEventListener('click', () => {
        const raw = inp.value.trim();
        if (raw) {
          _choicesRecordedCount++;
          _onChoicesRecordedFn?.(_choicesRecordedCount);
        }
        handleRecordChoices(sec, raw);
      });
    }

    const addPortalBtn = document.getElementById('add-portal-btn');
    if (addPortalBtn) {
      addPortalBtn.addEventListener('click', () => openPortalModal(sec, null));
    }

    panel.querySelectorAll('.portal-travel-btn').forEach(btn => {
      const idx = +btn.dataset.portalIdx;
      btn.addEventListener('click', () => {
        const portals = state.graph[sec]?.portals || [];
        const p = portals[idx];
        if (!p || !_owPortalHandler) return;
        const bk = _owSeriesBooks.find(b => b.id === p.targetBookId);
        const bkName = bk ? bk.name : `Book #${p.targetBookId}`;
        const fromSec = currentSection();
        showConfirm(
          `Travel from ${fromSec} to "${bkName}" ${p.targetSection}?\n\nYour character sheet and run number travel with you. This run pauses here at ${fromSec} until you return.`,
          () => _owPortalHandler(p),
          { confirmLabel: '⇒ Travel', danger: false }
        );
      });
    });

    panel.querySelectorAll('.portal-edit-btn').forEach(btn => {
      const idx = +btn.dataset.portalIdx;
      btn.addEventListener('click', () => openPortalModal(sec, idx));
    });

    panel.querySelectorAll('.portal-del-btn').forEach(btn => {
      const idx = +btn.dataset.portalIdx;
      btn.addEventListener('click', () => {
        const node = state.graph[sec];
        if (!node?.portals) return;
        node.portals.splice(idx, 1);
        if (!node.portals.length) delete node.portals;
        saveState();
        render();
      });
    });

    document.querySelectorAll('.choice-btn').forEach(btn => {
      const nodeId = parseSecId(btn.dataset.choice);
      btn.addEventListener('click', () => navigate(nodeId));
      if (isValidSecId(nodeId)) {
        btn.addEventListener('mouseenter', () => { if (network) network.selectNodes([nodeId]); });
        btn.addEventListener('mouseleave', () => { if (network) network.selectNodes([]); });
      }
    });
  }

  document.querySelectorAll('.run-load-btn').forEach(btn => {
    btn.addEventListener('click', () => loadRun(Number(btn.dataset.index)));
  });

  document.querySelectorAll('.run-del-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteRun(Number(btn.dataset.index)));
  });

  panel.querySelectorAll('.run-public-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.index;
      const pt = state.playthroughs[i];
      if (!pt || !pt.completed) return;
      pt.isPublic = !pt.isPublic;
      // For open world series: immediately push public status to series_runs
      if (_owIsOpenWorld && _owSeriesId) {
        apiFetch(`/api/series/${_owSeriesId}/runs/${i}`, {
          method: 'PUT',
          body: JSON.stringify({ is_public: pt.isPublic }),
        }).catch(() => {});
      }
      saveState();
      btn.classList.toggle('is-public', pt.isPublic);
    });
  });

  panel.querySelectorAll('.run-load-preseries').forEach(btn => {
    btn.addEventListener('click', () => {
      const i  = +btn.dataset.preIndex;
      const pt = (state.preSeriesRuns || [])[i];
      if (!pt) return;
      // View completed pre-series runs; resume incomplete ones
      if (pt.completed) {
        state._viewingPreSeriesIdx = i;
        setViewingPt(pt);
        render();
      } else {
        state._viewingPreSeriesIdx = null;
        setViewingPt(null, true);
        state.activePtIndex = null; // pre-series runs are not series runs
        render();
        const sec = pt.path[pt.path.length - 1];
        if (sec && network) network.focus(sec, { animation: true, scale: 1.2 });
      }
    });
  });

  panel.querySelectorAll('.run-del-preseries').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.preIndex;
      showConfirm(t('confirm.delete_run', { n: -(((state.preSeriesRuns || []).length) - i) }), () => {
        if (state._viewingPreSeriesIdx === i) {
          state._viewingPreSeriesIdx = null;
          setViewingPt(null);
        }
        (state.preSeriesRuns || []).splice(i, 1);
        saveState();
        render();
      });
    });
  });
}

// ── Playthrough actions ─────────────────────────────────────────────────────

export function startPlaythrough(entrySection = null) {
  const sheet = state.charSheetTemplate
    ? JSON.parse(JSON.stringify(state.charSheetTemplate))
    : { fields: [] };
  const startSec = isValidSecId(entrySection) ? entrySection : (isValidSecId(state.startSection) ? state.startSection : 1);
  const { inventory: invTmpl, equipment: eqTmpl, equipmentVisible: eqVisTmpl } = instantiateLoadout();
  state.playthroughs.push({ path: [startSec], completed: false, result: null, undosUsed: 0, fastTravelsUsed: 0, startedAt: Date.now(), charSheet: sheet, inventory: invTmpl, equipment: eqTmpl, equipmentVisible: eqVisTmpl, diceState: { count: state.dicePrefs?.count ?? 2, die: state.dicePrefs?.die ?? 6, lastResult: null } });
  state.activePtIndex = state.playthroughs.length - 1;
  // Fire AFTER the new playthrough is active, so the viewing-pt-change callback
  // (which refreshes #inv-display and the charsheet) reflects the new run's
  // inventory/equipment instead of the stale previous state.
  setViewingPt(null, true);
  saveState();
  render();
  const focusSec = state.playthroughs[state.activePtIndex]?.path.at(-1) ?? startSec;
  if (network) setTimeout(() => network.focus(focusSec, { scale: Math.max(network.getScale(), 1.2), animation: { duration: 400, easingFunction: 'easeInOutQuad' } }), 50);
}

// runIndex: the series-level run index being resumed. charSheet: the shared charsheet to apply.
export function startPortalRun(entrySection, runIndex, charSheet = null) {
  const entrySec = isValidSecId(entrySection) ? entrySection : (isValidSecId(state.startSection) ? state.startSection : 1);

  // Activate the specific run index (guaranteed to exist after series sync)
  let pt = state.playthroughs[runIndex];
  if (pt) {
    // Un-pause a portal-paused run, or activate a placeholder (path may be empty)
    pt.completed = false;
    pt.result    = null;
    delete pt.portalTarget;
    if (!pt.startedAt) pt.startedAt = Date.now(); // stamp first activation in this book
    state.activePtIndex = runIndex;
    if (!state.graph[entrySec]) state.graph[entrySec] = { choices: [], discovered: true };
    const wasEmpty = pt.path.length === 0;
    if (wasEmpty || pt.path[pt.path.length - 1] !== entrySec) pt.path.push(entrySec);
    if (wasEmpty) pt.portalEntry = true;
    if (!pt.inventory || !pt.equipment) {
      const { inventory: invTmpl, equipment: eqTmpl, equipmentVisible: eqVisTmpl } = instantiateLoadout();
      if (!pt.inventory) pt.inventory = invTmpl;
      if (!pt.equipment) { pt.equipment = eqTmpl; pt.equipmentVisible = eqVisTmpl; }
    }
    if (charSheet) pt.charSheet = JSON.parse(JSON.stringify(charSheet));
    // Fire AFTER the run is active, so the viewing-pt-change callback refreshes
    // #inv-display/charsheet from the now-current playthrough, not the stale one.
    setViewingPt(null, true);
    saveState();
    render();
    if (network) network.focus(entrySec, { animation: true, scale: 1.2 });
    return;
  }

  // Fallback: pad playthroughs to the required index and create a new run
  while (state.playthroughs.length <= runIndex) {
    const { inventory: invTmpl, equipment: eqTmpl, equipmentVisible: eqVisTmpl } = instantiateLoadout();
    state.playthroughs.push({ path: [], completed: false, result: null, undosUsed: 0, fastTravelsUsed: 0, startedAt: Date.now(), charSheet: { fields: [] }, inventory: invTmpl, equipment: eqTmpl, equipmentVisible: eqVisTmpl, diceState: { count: state.dicePrefs?.count ?? 2, die: state.dicePrefs?.die ?? 6, lastResult: null } });
  }
  pt = state.playthroughs[runIndex];
  pt.charSheet = JSON.parse(JSON.stringify(charSheet || state.charSheetTemplate || { fields: [] }));
  state.activePtIndex = runIndex;
  if (!state.graph[entrySec]) state.graph[entrySec] = { choices: [], discovered: true };
  pt.portalEntry = true;
  pt.path.push(entrySec);
  setViewingPt(null, true);
  saveState();
  render();
  if (network) network.focus(entrySec, { animation: true, scale: 1.2 });
}

export function loadRun(index) {
  const pt = state.playthroughs[index];
  if (!pt) return;
  if (pt.completed && pt.result !== 'portal') {
    // Normally completed - view only
    setViewingPt(pt);
    state.activePtIndex = null;
    saveState();
    render();
  } else {
    // Placeholder or in-progress run
    state.activePtIndex = index;
    // Fire AFTER activation, so the viewing-pt-change callback refreshes
    // #inv-display/charsheet from this run, not the previously-active one.
    setViewingPt(null, true);
    saveState();
    render();
    const sec = pt.path.length > 0 ? pt.path[pt.path.length - 1] : null;
    if (sec && network && visNodes?.get(sec)) network.focus(sec, { animation: true, scale: 1.2 });
    if (_onRunActivated) _onRunActivated(index);
  }
}

export function deleteRun(index) {
  const pt = state.playthroughs[index];
  if (!pt) return;
  showConfirm(t('confirm.delete_run', { n: index + 1 }), async () => {
    if (viewingPt === state.playthroughs[index]) setViewingPt(null);
    state.playthroughs.splice(index, 1);
    if (state.activePtIndex === index) {
      state.activePtIndex = null;
    } else if (state.activePtIndex > index) {
      state.activePtIndex -= 1;
    }
    saveState();
    if (_owIsOpenWorld && _owSeriesId !== null) {
      await apiFetch(`/api/series/${_owSeriesId}/runs/${index}`, { method: 'DELETE' }).catch(() => {});
      if (_onRunDeleted) _onRunDeleted(index);
    }
    render();
  });
}

function _commitChoices(sec, choices) {
  const deduped = [...new Set(choices)].sort((a, b) => {
    const av = isValidSecId(a), bv = isValidSecId(b);
    if (av && bv) {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      if (typeof a === 'number') return -1;
      if (typeof b === 'number') return 1;
      return naturalCompare(a, b);
    }
    if (av) return -1;
    if (bv) return 1;
    return (b === 0 ? 1 : 0) - (a === 0 ? 1 : 0); // 0 (win) before -1 (death)
  });
  const existingNote    = state.graph[sec]?.note;
  const existingPri     = state.graph[sec]?.priority;
  const existingBattle  = state.graph[sec]?.battle;
  const existingColor   = state.graph[sec]?.color;
  const existingPortals = state.graph[sec]?.portals;
  const existingShowNote = state.graph[sec]?.showNote;
  const oldChoices = state.graph[sec]?.choices || [];
  state.graph[sec] = { choices: deduped };
  if (existingNote)     state.graph[sec].note     = existingNote;
  if (existingPri)      state.graph[sec].priority = existingPri;
  if (existingBattle)   state.graph[sec].battle   = existingBattle;
  if (existingColor)    state.graph[sec].color    = existingColor;
  if (existingPortals)  state.graph[sec].portals  = existingPortals;
  if (existingShowNote) state.graph[sec].showNote  = existingShowNote;

  _cleanupOrphanedTargets(sec, oldChoices, deduped);

  saveState();
  render();
}

// A choice that's removed from `sec` may leave its target node with no
// incoming edges from anywhere. If a playthrough's current position is
// that now-orphaned node, revert it back to the previous node in its path.
// The orphaned node itself is also deleted, unless it carries metadata
// (note/priority/battle/color/portals) worth preserving.
function _cleanupOrphanedTargets(sec, oldChoices, newChoices) {
  // Protect the book's default start plus every run's own entry point (path[0])
  // - a run begun via the alternate-start button (play.js's startPlaythrough)
  // can legitimately sit on a node nothing else points to.
  const roots = new Set([isValidSecId(state.startSection) ? state.startSection : 1]);
  state.playthroughs.forEach(pt => { if (isValidSecId(pt?.path?.[0])) roots.add(pt.path[0]); });
  const removed = oldChoices.filter(c => !newChoices.includes(c) && !isTerminal(c) && c !== sec);

  for (const target of removed) {
    if (roots.has(target)) continue;

    const hasIncoming = Object.entries(state.graph).some(([srcKey, data]) => {
      const src = parseSecId(srcKey);
      return src !== target && (data.choices || []).includes(target);
    });
    if (hasIncoming) continue;

    state.playthroughs.forEach(pt => {
      while (pt.path.length > 1 && pt.path[pt.path.length - 1] === target) {
        pt.path.pop();
      }
    });

    const node = state.graph[target];
    const hasMetadata = node && (node.note || node.priority || node.battle || node.color || node.portals || node.showNote);
    if (node && !hasMetadata) {
      delete state.graph[target];
    }
  }
}

// allowEmpty: an explicitly empty box commits choices:[] ("no more choices
// here", a genuine dead end) instead of silently doing nothing - that no-op
// meant openEditModal's "clear everything and save" had no way to ever
// actually remove the last choice(s) from an already-mapped node. Only
// openEditModal opts into this; the first-time "Record & Choose" flow keeps
// the old no-op behavior, since an empty submit there is far more likely to
// be an accidental click/Enter before typing anything than a deliberate
// "this section has no choices" - see call sites.
export function handleRecordChoices(sec, raw, allowEmpty = false) {
  if (raw === '') {
    if (allowEmpty) _commitChoices(sec, []);
    return;
  }
  if (!raw) return;
  const parsed = raw
    .split(/[.,;\s]+/)
    .map(s => parseSecId(s.trim()))
    .filter(n => n !== null && n !== sec && (isTerminal(n) || isValidSecId(n)));
  if (!parsed.length) return;

  const hasAlpha = parsed.some(n => typeof n === 'string');

  if (hasAlpha && !state.alphanumericSections) {
    const example = parsed.find(n => typeof n === 'string');
    confirmAlphanumericSwitch(example, () => _commitChoices(sec, parsed));
    return;
  }

  const choices = state.alphanumericSections
    ? parsed
    : parsed.filter(n => typeof n !== 'number' || n <= (state.totalSections || Infinity));
  if (!choices.length) return;

  if (state.alphanumericSections && state.totalSections > 0) {
    const discovered = allDiscoveredSections();
    const newSections = choices.filter(n => isValidSecId(n) && !discovered.has(n));
    if (discovered.size + newSections.length > state.totalSections) {
      showAlert(t('play.choices_exceed_limit', { limit: state.totalSections }));
      return;
    }
  }

  _commitChoices(sec, choices);
}

export function navigate(sec) {
  const pt = currentPlaythrough();
  if (!pt) return;
  if (isTerminal(sec)) {
    endPlaythrough(sec === 0 ? 'success' : 'death');
    return;
  }
  if (state.alphanumericSections && state.totalSections > 0) {
    const discovered = allDiscoveredSections();
    if (!discovered.has(sec) && discovered.size >= state.totalSections) {
      showAlert(t('play.reached_section_limit', { limit: state.totalSections }));
      return;
    }
  }
  pt.path.push(sec);
  pt.lastActionAt = Date.now();
  saveState();
  render();
  // Skip animation if this section will be immediately auto-navigated away from -
  // stacking multiple 1s vis.js animations corrupts its internal camera state.
  const secData = state.graph[sec];
  const willAutoNav = !_suppressAutoNav && secData?.choices.length === 1 && !isTerminal(secData.choices[0]) && !pt.path.includes(secData.choices[0]) && !(_owIsOpenWorld && secData.portals?.length);
  if (network && !willAutoNav) network.focus(sec, { animation: true, scale: 1.2 });
}

function maxUndos() {
  const lvl  = currentUserLevel || 0;
  const base = lvl <= 30 ? 3 : Math.min(10, 3 + Math.ceil((lvl - 30) / 10));
  return base + (bonusUndos || 0);
}

export function maxFastTravels() {
  const lvl  = currentUserLevel || 0;
  const base = lvl <= 30 ? 3 : Math.min(10, 3 + Math.ceil((lvl - 30) / 10));
  return base + (bonusFastTravels || 0);
}

let _fastTravelHandler = null;
export function setFastTravelHandler(fn) { _fastTravelHandler = fn; }

let _altStartHandler = null;
export function setAltStartHandler(fn) { _altStartHandler = fn; }

export function showFastTravelDialog(onConfirm) {
  let overlay = document.getElementById('ft-dialog-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ft-dialog-overlay';
    overlay.innerHTML = `
      <div id="ft-dialog">
        <div class="ft-dialog-title">${t('ctx.fasttravel')}</div>
        <div class="cs-num-wrap">
          <button class="cs-num-btn" id="ft-dec-btn">−</button>
          <input id="ft-dialog-input" class="ft-dialog-input" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="${t('ft.section_placeholder')}">
          <button class="cs-num-btn" id="ft-inc-btn">+</button>
        </div>
        <div class="ft-dialog-modes">
          <button class="ft-dialog-mode-btn ft-mode-high" data-mode="high">${t('ctx.fasttravel.high')}</button>
          <button class="ft-dialog-mode-btn ft-mode-shortest" data-mode="shortest">${t('ctx.fasttravel.shortest')}</button>
          <button class="ft-dialog-mode-btn ft-mode-normal" data-mode="normal">${t('ctx.fasttravel.normal')}</button>
          <button class="ft-dialog-mode-btn ft-mode-low" data-mode="low">${t('ctx.fasttravel.low')}</button>
        </div>
        <div class="ft-dialog-footer">
          <button id="ft-dialog-cancel" class="ft-dialog-cancel">${t('btn.cancel')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('ft-dialog-cancel').addEventListener('click', () => overlay.classList.remove('active'));
    let _mdOnOvl = false;
    overlay.addEventListener('mousedown', e => { _mdOnOvl = e.target === overlay; });
    overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOvl) overlay.classList.remove('active'); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('active')) overlay.classList.remove('active');
    });
    document.getElementById('ft-dec-btn').addEventListener('click', () => {
      const inp = document.getElementById('ft-dialog-input');
      const v = parseInt(inp.value, 10);
      if (v > 1) inp.value = v - 1;
    });
    document.getElementById('ft-inc-btn').addEventListener('click', () => {
      const inp = document.getElementById('ft-dialog-input');
      const v = parseInt(inp.value, 10);
      inp.value = isNaN(v) ? 1 : v + 1;
    });
  }

  const input = document.getElementById('ft-dialog-input');
  input.value = '';

  // Re-wire mode buttons with new onConfirm each call
  overlay.querySelectorAll('.ft-dialog-mode-btn').forEach(btn => {
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
  });
  overlay.querySelectorAll('.ft-dialog-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const secId = parseInt(input.value, 10);
      if (!secId || secId < 1) { input.focus(); return; }
      overlay.classList.remove('active');
      onConfirm(secId, btn.dataset.mode);
    });
  });

  overlay.classList.add('active');
  setTimeout(() => input.focus(), 50);
}

// ── Start-run section picker ────────────────────────────────────────────────
// Known starts = the book's default start plus every distinct path[0] seen
// across existing playthroughs, filtered down to sections that still exist in
// state.graph - so a start used once by mistake and then deleted from the
// graph drops out of the list on its own, no separate cleanup needed.
function _knownStartSections() {
  const defaultSec = isValidSecId(state.startSection) ? state.startSection : 1;
  const known = new Set();
  if (state.graph[defaultSec] !== undefined) known.add(defaultSec);
  for (const pt of state.playthroughs) {
    const sec = pt.path?.[0];
    if (isValidSecId(sec) && state.graph[sec] !== undefined) known.add(sec);
  }
  return [...known].sort((a, b) => {
    if (a === defaultSec) return -1;
    if (b === defaultSec) return 1;
    return naturalCompare(String(a), String(b));
  });
}

function showStartPicker(sections) {
  let overlay = document.getElementById('start-picker-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'start-picker-overlay';
    overlay.innerHTML = `
      <div id="start-picker-dialog">
        <div class="ft-dialog-title">${t('runs.pick_start')}</div>
        <div class="ft-dialog-modes" id="start-picker-options"></div>
        <div class="ft-dialog-footer">
          <button id="start-picker-alt" class="ft-dialog-cancel">⚑ ${t('runs.pick_start_custom')}</button>
          <button id="start-picker-cancel" class="ft-dialog-cancel">${t('btn.cancel')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('start-picker-cancel').addEventListener('click', () => overlay.classList.remove('active'));
    document.getElementById('start-picker-alt').addEventListener('click', () => {
      overlay.classList.remove('active');
      if (_altStartHandler) _altStartHandler();
    });
    let _mdOnOvl = false;
    overlay.addEventListener('mousedown', e => { _mdOnOvl = e.target === overlay; });
    overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOvl) overlay.classList.remove('active'); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('active')) overlay.classList.remove('active');
    });
  }

  const defaultSec = isValidSecId(state.startSection) ? state.startSection : 1;
  const optionsEl = document.getElementById('start-picker-options');
  optionsEl.innerHTML = sections.map(sec =>
    `<button class="ft-dialog-mode-btn" data-sec="${escapeHtml(String(sec))}">` +
      escapeHtml(t('runs.section', { n: sec })) +
      (sec === defaultSec ? ` <span class="start-picker-default-tag">(${escapeHtml(t('runs.pick_start_default'))})</span>` : '') +
    `</button>`
  ).join('');
  optionsEl.querySelectorAll('.ft-dialog-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.classList.remove('active');
      startPlaythrough(parseSecId(btn.dataset.sec));
    });
  });

  overlay.classList.add('active');
}

export function undoRun() {
  const pt = currentPlaythrough();
  if (!pt) return;
  const used = pt.undosUsed || 0;
  if (used >= maxUndos() || pt.path.length <= 1) return;
  // Pop the current node, then keep popping past any forced (single-choice) nodes
  // until we land on a real decision point or the start of the run. A node with only
  // one recorded choice isn't necessarily a forced passthrough though - it may be a
  // real decision the user just recorded (possibly a wrong one they're undoing right
  // now) - so in principle it's worth stopping at any node carrying metadata rather
  // than silently skipping past it. But stopping there is only actually meaningful if
  // the render pipeline won't immediately auto-navigate straight back through it: once
  // popped, that node's one recorded destination is no longer in pt.path, which is
  // exactly the condition auto-nav fires on (see the `willAutoNav`/choices.length===1
  // check further down) - landing on a metadata node right before its own auto-nav
  // fires just re-plays the undo's own forward step, sending the user right back
  // where they started. So only stop at a metadata node when auto-nav wouldn't
  // immediately fire for it; otherwise keep walking back to a genuine decision point.
  pt.path.pop();
  while (pt.path.length > 1) {
    const node = state.graph[pt.path[pt.path.length - 1]];
    if (!node || node.choices.length !== 1) break; // real decision point, dead end, or missing node
    const hasMetadata = node.note || node.priority || node.battle || node.color || node.portals || node.showNote;
    const wouldAutoNav = !isTerminal(node.choices[0]) && !pt.path.includes(node.choices[0]) && !(_owIsOpenWorld && node.portals?.length);
    if (hasMetadata && !wouldAutoNav) break;
    pt.path.pop();
  }
  pt.undosUsed = used + 1;
  pt.lastActionAt = Date.now();
  saveState();
  render();
  const sec = pt.path[pt.path.length - 1];
  if (network) network.focus(sec, { animation: true, scale: 1.2 });
}

export function endPlaythrough(result) {
  const pt = currentPlaythrough();
  if (!pt) return;
  const sec = currentSection();
  pt.completed        = true;
  pt.result           = result;
  pt.completedAt      = Date.now();
  state.activePtIndex = null;
  setViewingPt(pt);
  // Add the outcome sentinel to this node's choices so edge/node colouring reflects it.
  // Skip for 'battle': a simulated combat loss ends THIS run, but the book section
  // itself may have real, not-yet-recorded branches - recording it as a graph-wide
  // dead end would wrongly auto-end every future run that lands on this node.
  if (result !== 'battle' && sec !== null && isValidSecId(sec)) {
    if (!state.graph[sec]) state.graph[sec] = { choices: [] };
    const sentinel = (result === 'success') ? 0 : -1;
    if (!state.graph[sec].choices.includes(sentinel))
      state.graph[sec].choices.push(sentinel);
  }
  saveState();
  render();
}

// ── Modal ───────────────────────────────────────────────────────────────────

export function openEditModal(nodeId) {
  const existing = (state.graph[nodeId]?.choices || []).join(', ');
  document.getElementById('edit-modal-title').textContent = t('modal.edit.title', { n: nodeId });

  // Clone input + both buttons to wipe all stale listeners in one pass
  const oldInp    = document.getElementById('edit-choices-input');
  const save      = document.getElementById('edit-modal-save');
  const cancel    = document.getElementById('edit-modal-cancel');
  const newInp    = oldInp.cloneNode(true);
  const newSave   = save.cloneNode(true);
  const newCancel = cancel.cloneNode(true);
  oldInp.parentNode.replaceChild(newInp, oldInp);
  save.parentNode.replaceChild(newSave, save);
  cancel.parentNode.replaceChild(newCancel, cancel);

  newInp.value = existing;
  document.getElementById('edit-modal-overlay').classList.add('active');
  newInp.focus();
  newInp.select();

  newSave.addEventListener('click', () => {
    handleRecordChoices(nodeId, document.getElementById('edit-choices-input').value.trim(), true);
    closeEditModal();
  });
  newCancel.addEventListener('click', closeEditModal);
  newInp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  newSave.click();
    if (e.key === 'Escape') closeEditModal();
  });
}

export function closeEditModal() {
  document.getElementById('edit-modal-overlay').classList.remove('active');
}

export function openNoteModal(nodeId) {
  document.getElementById('note-modal-title').textContent = t('modal.note.title', { n: nodeId });
  const pinCb = document.getElementById('note-pin-cb');

  const oldInp    = document.getElementById('note-modal-input');
  const save      = document.getElementById('note-modal-save');
  const cancel    = document.getElementById('note-modal-cancel');
  const newInp    = oldInp.cloneNode(true);
  const newSave   = save.cloneNode(true);
  const newCancel = cancel.cloneNode(true);
  oldInp.parentNode.replaceChild(newInp, oldInp);
  save.parentNode.replaceChild(newSave, save);
  cancel.parentNode.replaceChild(newCancel, cancel);

  newInp.value = state.graph[nodeId]?.note || '';
  pinCb.checked = !!(state.graph[nodeId]?.showNote);
  document.getElementById('note-modal-overlay').classList.add('active');
  newInp.focus();

  newSave.addEventListener('click', () => {
    const note     = document.getElementById('note-modal-input').value.trim();
    const showNote = document.getElementById('note-pin-cb').checked;
    if (note) {
      if (!state.graph[nodeId]) state.graph[nodeId] = { choices: [], discovered: true };
      state.graph[nodeId].note     = note;
      if (showNote) state.graph[nodeId].showNote = true;
      else          delete state.graph[nodeId].showNote;
    } else if (state.graph[nodeId]) {
      delete state.graph[nodeId].note;
      delete state.graph[nodeId].showNote;
      const n = state.graph[nodeId];
      // Same "worth keeping" check as _cleanupOrphanedTargets/_pruneDiscovered
      // (boot.js) - was missing `portals` here too, so clearing the note off
      // a node whose only other content was a portal silently deleted it.
      if (n.discovered && !n.priority && !n.battle && !n.color && !n.portals) delete state.graph[nodeId];
    }
    saveState();
    render();
    closeNoteModal();
  });
  newCancel.addEventListener('click', closeNoteModal);
  newInp.addEventListener('keydown', e => { if (e.key === 'Escape') closeNoteModal(); });
}

export function closeNoteModal() {
  document.getElementById('note-modal-overlay').classList.remove('active');
}

// ── Portal modal ─────────────────────────────────────────────────────────────

export function openPortalModal(sectionId, editIdx = null) {
  const overlay = document.getElementById('portal-modal-overlay');
  const title   = document.getElementById('portal-modal-title');
  const sel     = document.getElementById('portal-book-select');
  const secInp  = document.getElementById('portal-section-input');
  const lblInp  = document.getElementById('portal-label-input');

  title.textContent = editIdx !== null ? t('play.edit_portal') : t('play.add_portal');

  sel.innerHTML = _owSeriesBooks.length === 0
    ? '<option value="">- No other books in series -</option>'
    : _owSeriesBooks.map(b => `<option value="${b.id}">${b.name}</option>`).join('');

  const existing = editIdx !== null ? (state.graph[sectionId]?.portals?.[editIdx] || null) : null;
  if (existing) {
    sel.value    = String(existing.targetBookId);
    secInp.value = String(existing.targetSection);
    lblInp.value = existing.label || '';
  } else {
    secInp.value = '';
    lblInp.value = '';
  }

  overlay.classList.add('active');
  secInp.focus();

  const saveBtn   = document.getElementById('portal-modal-save');
  const cancelBtn = document.getElementById('portal-modal-cancel');
  const newSave   = saveBtn.cloneNode(true);
  const newCancel = cancelBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSave, saveBtn);
  cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

  const close = () => overlay.classList.remove('active');

  newSave.addEventListener('click', () => {
    const targetBookId = +sel.value;
    const targetSection = +secInp.value.trim();
    if (!targetBookId || !targetSection) return;
    const portal = { targetBookId, targetSection, label: lblInp.value.trim() || null };
    if (!state.graph[sectionId]) state.graph[sectionId] = { choices: [], discovered: true };
    if (!state.graph[sectionId].portals) state.graph[sectionId].portals = [];
    if (editIdx !== null) {
      state.graph[sectionId].portals[editIdx] = portal;
    } else {
      state.graph[sectionId].portals.push(portal);
    }
    saveState();
    render();
    close();
  });
  newCancel.addEventListener('click', close);
  secInp.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}
