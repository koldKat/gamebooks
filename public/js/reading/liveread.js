// Non-blocking prose reader with reveal-on-arrival choices.
// Available for books with imported text; keep the underlying graph interactive.

import { state, apiFetch, getToken, currentBookId, currentPlaythrough, currentSection, viewingPt, isTerminal, parseSecId, isSectionMapped } from '../core/state.js';
import { navigate, startPlaythrough, commitChoices, showAlert, suppressAutoNav } from '../play.js';
import { network, setLightweightRestabilize } from '../graph.js';
import { t } from '../i18n.js';
import { shortcutLabel, registerPanelShortcut, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { TROPHY_SVG, BROKEN_SHIELD_SVG, terminalHeadingKey } from './liveread-shared.js';
import { showReadingGate } from './access.js';

// Reuses the same .feed-loading-graph/.flg-* markup and CSS (demo.css) as the
// activity feed's loading indicator, both loaded on index.html.
const _loadingHtml = () => `<div class="liveread-loading">
  <svg class="feed-loading-graph" viewBox="0 0 32 32">
    <line x1="16" y1="16" x2="6"  y2="7"  stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="16" y1="16" x2="26" y2="7"  stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="16" y1="16" x2="6"  y2="26" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="16" y1="16" x2="26" y2="26" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
    <circle class="flg-node flg-n1" cx="6"  cy="7"  r="4" fill="#8e44ad" stroke="#6c3483" stroke-width="1.2"/>
    <circle class="flg-node flg-n2" cx="26" cy="7"  r="4" fill="#e74c3c" stroke="#c0392b" stroke-width="1.2"/>
    <circle class="flg-node flg-n3" cx="6"  cy="26" r="4" fill="#3498db" stroke="#2980b9" stroke-width="1.2"/>
    <circle class="flg-node flg-n4" cx="26" cy="26" r="4" fill="#27ae60" stroke="#1e8449" stroke-width="1.2"/>
    <circle class="flg-center" cx="16" cy="16" r="6" fill="#f5a623" stroke="#c47d00" stroke-width="1.5"/>
  </svg>
  <span>${t('liveread.loading')}</span>
</div>`;

// Reject stale section responses after each await.
let _showToken = 0;

// Track the displayed section so background renders cannot refetch it or reset scroll.
let _shownSec;
let _accessPending = false;
let _accessLocked = false;
let _accessBookId = null;

// Show a spinner only for the first uncached section after opening.
let _isFirstShowSinceOpen = true;

// Cache and prefetch sections in memory, keyed by book and section.
// Clear on book switches to bound memory.
const _sectionCache = new Map();
let _cacheBookId = null;

function _cacheKey(sec) { return `${currentBookId}:${sec}`; }

// Distinguish network exceptions (silent) from HTTP errors (shown to the reader).
async function _fetchSectionData(sec) {
  if (currentBookId !== _cacheBookId) {
    _sectionCache.clear();
    _cacheBookId = currentBookId;
  }
  const key = _cacheKey(sec);
  if (_sectionCache.has(key)) return { ok: true, data: _sectionCache.get(key) };
  let res;
  try {
    res = await apiFetch(`/api/books/${currentBookId}/sections/${encodeURIComponent(sec)}`);
  } catch (_) {
    return { ok: false, networkError: true };
  }
  if (!res.ok) return { ok: false, networkError: false };
  const data = await res.json();
  _sectionCache.set(key, data);
  return { ok: true, data };
}

function _prefetchChoices(choices) {
  for (const c of choices || []) {
    if (isTerminal(c) || _sectionCache.has(_cacheKey(c))) continue;
    _fetchSectionData(c).catch(() => {});
  }
}

function _updateHeading(sec) {
  const el = document.getElementById('liveread-heading');
  if (el) el.textContent = isTerminal(sec) ? t('liveread.title') : t('liveread.reading_section', { n: sec });
}

function _terminalHtml(sec) {
  const win = sec === 0;
  return `<div class="liveread-end liveread-end--${win ? 'win' : 'death'}">
    ${win ? TROPHY_SVG : BROKEN_SHIELD_SVG}
    <div class="liveread-end-heading">${t(terminalHeadingKey(win))}</div>
  </div>`;
}

async function _showSection(sec) {
  const body = document.getElementById('liveread-body');
  if (!body) return;
  if (isTerminal(sec)) {
    if (sec === _shownSec) return;
    _previewSec = null;
    _shownSec = sec;
    _updateHeading(sec);
    body.innerHTML = _terminalHtml(sec);
    return;
  }
  if (sec === _shownSec) return;
  _previewSec = null;
  _shownSec = sec;
  _updateHeading(sec);
  const token = ++_showToken;

  if (_isFirstShowSinceOpen && !_sectionCache.has(_cacheKey(sec))) {
    body.innerHTML = _loadingHtml();
  }
  _isFirstShowSinceOpen = false;

  const result = await _fetchSectionData(sec);
  if (token !== _showToken) return;
  if (!result.ok) {
    if (!result.networkError) body.innerHTML = `<p class="liveread-empty">${t('liveread.no_section_data')}</p>`;
    return;
  }
  const data = result.data;
  body.innerHTML = data.html;
  body.scrollTop = 0;
  if (data.choices?.length) commitChoices(sec, data.choices);
  // Hovering an in-text choice link highlights the matching node on the graph,
  // same as the run trail's pills and the choice-list buttons (play.js).
  if (network) {
    body.querySelectorAll('a[href^="#section-"]').forEach(a => {
      const id = parseSecId(a.getAttribute('href').slice('#section-'.length));
      if (id === null) return;
      a.addEventListener('mouseenter', () => network.selectNodes([id]));
      a.addEventListener('mouseleave', () => network.selectNodes([]));
    });
  }
  _prefetchChoices(data.choices);
}

// Non-section links are prose-only asides with Back navigation; never add graph choices.
async function _showExtra(key) {
  const body = document.getElementById('liveread-body');
  if (!body) return;
  const token = ++_showToken;
  if (_isFirstShowSinceOpen && !_sectionCache.has(_cacheKey(key))) {
    body.innerHTML = _loadingHtml();
  }
  _isFirstShowSinceOpen = false;
  const result = await _fetchSectionData(key);
  if (token !== _showToken) return;
  if (!result.ok) return;
  const data = result.data;
  body.innerHTML = `${data.html}<p class="liveread-back"><a href="#" id="liveread-back-link">${t('btn.back')}</a></p>`;
  body.scrollTop = 0;
  document.getElementById('liveread-back-link')?.addEventListener('click', e => {
    e.preventDefault();
    const sec = _shownSec;
    _shownSec = undefined;
    _showSection(sec);
  });
}

// Track read-only previews separately from the actual run position.
let _previewSec = null;

function _onChoiceClick(e) {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const href = a.getAttribute('href').slice(1);
  if (!href) return;
  e.preventDefault();
  if (href.startsWith('section-')) {
    const sec = parseSecId(href.slice('section-'.length));
    if (sec === null) return;
    if (_previewSec !== null) {
      // Preview links may open only mapped sections, never navigate the run or reveal spoilers.
      if (isSectionMapped(sec)) previewSection(sec);
      return;
    }
    if (!currentPlaythrough()) return;
    navigate(sec);
    // Show the destination only if navigation actually moved the run.
    if (isTerminal(sec) || currentSection() === sec) _showSection(sec);
    return;
  }
  _showExtra(href);
}

// Preview only previously mapped sections; refreshing their choices is idempotent.
export async function previewSection(sec) {
  const panel = document.getElementById('liveread-panel');
  if (!panel?.classList.contains('active')) return;
  if (_accessPending || _accessLocked) return;
  // Clicking the current section is normal reading, not a preview.
  if (sec === currentSection()) {
    _returnToCurrent();
    return;
  }
  if (!isSectionMapped(sec)) return;
  const body  = document.getElementById('liveread-body');
  if (!body) return;
  // Keep _shownSec at the actual position so background renders leave the preview intact.
  const token = ++_showToken;
  if (_isFirstShowSinceOpen && !_sectionCache.has(_cacheKey(sec))) {
    body.innerHTML = _loadingHtml();
  }
  _isFirstShowSinceOpen = false;
  const result = await _fetchSectionData(sec);
  if (token !== _showToken) return;
  if (!result.ok) {
    // Keep network failures silent, but show HTTP errors rather than leaving a spinner stuck.
    if (!result.networkError) body.innerHTML = `<p class="liveread-empty">${t('liveread.no_section_data')}</p>`;
    return;
  }
  const data = result.data;
  if (data.choices?.length) commitChoices(sec, data.choices);
  _previewSec = sec;
  _updateHeading(sec);
  body.innerHTML = `<p class="liveread-preview-banner">${t('mobile.preview_banner', { sec })}</p>${data.html}<p class="liveread-back"><a href="#" id="liveread-preview-return">${t('mobile.preview_return')}</a></p>`;
  body.scrollTop = 0;
  document.getElementById('liveread-preview-return').addEventListener('click', e => {
    e.preventDefault();
    _returnToCurrent();
  });
}

// Return to the active section or finished run's terminal screen.
function _returnToCurrent() {
  _previewSec = null;
  const sec = currentSection();
  if (sec != null) { _shownSec = undefined; _showSection(sec); return; }
  if (viewingPt?.completed) { _shownSec = undefined; _showSection(viewingPt.result === 'success' ? 0 : -1); return; }
  _close();
}

// Suppress auto-navigation while reading so every section's prose remains visible.
async function _open() {
  const panel = document.getElementById('liveread-panel');
  if (!panel) return;
  suppressAutoNav(true);
  setLightweightRestabilize(true);
  panel.classList.add('active');
  _isFirstShowSinceOpen = true;
  const bookId = currentBookId;
  _accessBookId = bookId;
  const authToken = getToken();
  const token = ++_showToken;
  const isCurrent = () => authToken === getToken() && token === _showToken && bookId === currentBookId && panel.classList.contains('active');
  _accessPending = true;
  _accessLocked = false;
  const body = document.getElementById('liveread-body');
  body.innerHTML = _loadingHtml();
  const begin = (unlocked = false) => {
    _accessPending = false;
    _accessLocked = false;
    _shownSec = undefined;
    if (!currentPlaythrough() || (unlocked && currentSection() !== 1)) startPlaythrough(unlocked ? 1 : null);
    _showSection(currentSection() ?? (state.startSection ?? 1));
  };
  try {
    const locked = await showReadingGate(body, bookId, { isCurrent, onUnlock: () => begin(true) });
    if (!isCurrent()) return;
    _accessPending = false;
    _accessLocked = locked;
    if (!locked) begin();
    else document.getElementById('liveread-heading').textContent = t('reading_access.intro');
  } catch (_) {
    if (!isCurrent()) return;
    _accessPending = false;
    _accessLocked = true;
    body.textContent = t('auth.network_error');
  }
}

function _close() {
  document.getElementById('liveread-body')?.classList?.remove('reading-gate');
  ++_showToken;
  _accessPending = false;
  _accessLocked = false;
  _accessBookId = null;
  suppressAutoNav(false);
  setLightweightRestabilize(false);
  // Clear the section guard on close; the same ID may belong to another book on reopen.
  _shownSec = undefined;
  _isFirstShowSinceOpen = true;
  document.getElementById('liveread-panel')?.classList.remove('active');
}

function _toggle() {
  const panel = document.getElementById('liveread-panel');
  if (panel?.classList.contains('active')) _close();
  else _open();
}

// Keep unavailable reading buttons visible but disabled to prevent row layout shifts.
export function setLiveReadVisible(visible) {
  const btn = document.getElementById('liveread-btn');
  if (btn) {
    btn.disabled = !visible;
    if (visible) btn.removeAttribute('data-tooltip');
    else btn.setAttribute('data-tooltip', t('liveread.not_available'));
  }
  if (!visible) _close();
}

// Follow navigation and viewed-run changes; retain the terminal screen after completion.
export function renderLiveRead() {
  const panel = document.getElementById('liveread-panel');
  if (!panel || !panel.classList.contains('active')) return;
  if (_accessBookId !== null && _accessBookId !== currentBookId) { _close(); return; }
  if (_accessPending || _accessLocked) return;
  const sec = currentSection();
  if (sec != null) {
    _showSection(sec);
    return;
  }
  if (viewingPt?.completed) {
    _showSection(viewingPt.result === 'success' ? 0 : -1);
    return;
  }
  _close();
}

// Store font size locally in whole-percent steps for an exact readout.
const FONT_SIZE_KEY = 'liveread-font-pct';
const FONT_SIZE_MIN_PCT = 70;
const FONT_SIZE_MAX_PCT = 130;
const FONT_SIZE_STEP_PCT = 5;
const FONT_SIZE_DEFAULT_PCT = 100;
const FONT_SIZE_BASE_REM = 0.88;

function _fontSizePct() {
  const saved = parseInt(localStorage.getItem(FONT_SIZE_KEY), 10);
  return Number.isFinite(saved) ? Math.min(FONT_SIZE_MAX_PCT, Math.max(FONT_SIZE_MIN_PCT, saved)) : FONT_SIZE_DEFAULT_PCT;
}

function _applyFontSize(panel) {
  const pct = _fontSizePct();
  panel.style.setProperty('--liveread-font-size', `${(FONT_SIZE_BASE_REM * pct / 100).toFixed(3)}rem`);
  const pctEl = panel.querySelector('#liveread-font-pct');
  if (pctEl) pctEl.textContent = `${pct}%`;
}

function _stepFontSize(panel, dir) {
  const next = Math.min(FONT_SIZE_MAX_PCT, Math.max(FONT_SIZE_MIN_PCT, _fontSizePct() + dir * FONT_SIZE_STEP_PCT));
  localStorage.setItem(FONT_SIZE_KEY, String(next));
  _applyFontSize(panel);
}

// Measure laid-out text with Range rather than computed lineHeight to account for browser text zoom.
function _renderedLineHeight(body) {
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
  });
  const node = walker.nextNode();
  if (node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = range.getClientRects();
    if (rects.length) return rects[0].height;
  }
  return parseFloat(getComputedStyle(body).lineHeight) || 24;
}

export function initLiveRead() {
  const panel = document.createElement('div');
  panel.id = 'liveread-panel';
  panel.className = 'liveread-panel';
  panel.innerHTML = `
    <div class="inv-modal-hdr">
      <span id="liveread-heading" class="inv-modal-title">${t('liveread.title')}</span>
      <div class="liveread-font-controls">
        <button id="liveread-font-dec" class="inv-close-btn liveread-font-btn" aria-label="${t('liveread.font_decrease')}">−</button>
        <span id="liveread-font-pct" class="liveread-font-pct"></span>
        <button id="liveread-font-inc" class="inv-close-btn liveread-font-btn" aria-label="${t('liveread.font_increase')}">+</button>
      </div>
      <button id="liveread-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
    </div>
    <div id="liveread-body" class="liveread-body"></div>`;
  document.body.appendChild(panel);
  _applyFontSize(panel);
  document.getElementById('liveread-font-dec').addEventListener('click', () => _stepFontSize(panel, -1));
  document.getElementById('liveread-font-inc').addEventListener('click', () => _stepFontSize(panel, 1));

  // Scroll one actual text line per wheel tick; passive:false allows suppressing native scrolling.
  const body = document.getElementById('liveread-body');
  body.addEventListener('wheel', e => {
    e.preventDefault();
    const scroller = body.querySelector('.reading-gate-prose') || body;
    scroller.scrollTop += Math.sign(e.deltaY) * _renderedLineHeight(body);
  }, { passive: false });

  // Mount with Guide and Notebook to avoid crowding the character/inventory action row.
  const btn = document.getElementById('liveread-btn');
  btn.innerHTML = shortcutLabel(t('liveread.title'));

  // Observe legend height so the docked reader clears collapsed and portal variants.
  const legend = document.getElementById('legend');
  if (legend) {
    new ResizeObserver(() => {
      document.documentElement.style.setProperty('--legend-h', `${legend.offsetHeight}px`);
    }).observe(legend);
  }

  btn.addEventListener('click', _toggle);
  document.getElementById('liveread-close').addEventListener('click', _close);
  document.getElementById('liveread-body').addEventListener('click', _onChoiceClick);

  registerPanelShortcut('KeyR', {
    getButton:  () => document.getElementById('liveread-btn'),
    getOverlay: () => panel,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS,
    open:  _open,
    close: _close,
  });
}
