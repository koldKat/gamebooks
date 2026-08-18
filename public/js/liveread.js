// liveread.js - "Live reading": a floating, non-blocking panel that renders
// a book's actual prose section-by-section (from admin-imported book_sections
// data) with clickable in-text choices, feeding state.graph via reveal-on-arrival
// as the player reads. Open to every user (db._canLiveRead is now an
// always-true stub - see its own comment) - not yet announced anywhere, but
// no longer account-gated. Still per-book: the client only sees
// hasLiveReading:true for books with admin-imported prose.
// Deliberately NOT built on .inv-overlay: the whole point is that the graph
// stays visible and interactive underneath while reading.

import { state, apiFetch, currentBookId, currentPlaythrough, currentSection, viewingPt, isTerminal, parseSecId } from './state.js?v=13';
import { navigate, commitChoices, showAlert, suppressAutoNav } from './play.js?v=139';
import { network, setLightweightRestabilize } from './graph.js?v=132';
import { t } from './i18n.js?v=63';
import { shortcutLabel, registerPanelShortcut, ALL_PANEL_OVERLAY_IDS } from './util.js?v=77';

// Bumped on every call and re-checked after each await so a slower, now-stale
// fetch (e.g. from a rapid double-click on two different choice links) can't
// overwrite the panel with the wrong section after a newer request already won.
let _showToken = 0;

// The section currently rendered in the panel - renderLiveRead() fires on
// every render() (see setAfterRenderFn wiring in boot.js), which happens far
// more often than the player actually changes section. Without this guard,
// _showSection() would re-fetch and reset scrollTop on every single render(),
// yanking the panel back to the top out from under the player mid-scroll.
let _shownSec;

function _updateHeading(sec) {
  const el = document.getElementById('liveread-heading');
  if (el) el.textContent = isTerminal(sec) ? t('liveread.title') : t('liveread.reading_section', { n: sec });
}

async function _showSection(sec) {
  const body = document.getElementById('liveread-body');
  if (!body) return;
  if (sec === _shownSec) return;
  _shownSec = sec;
  _updateHeading(sec);
  const token = ++_showToken;

  if (isTerminal(sec)) {
    body.innerHTML = `<p class="liveread-empty">${sec === 0 ? t('liveread.the_end_win') : t('liveread.the_end_death')}</p>`;
    return;
  }

  let res;
  try {
    res = await apiFetch(`/api/books/${currentBookId}/sections/${encodeURIComponent(sec)}`);
  } catch (_) {
    return;
  }
  if (token !== _showToken) return;
  if (!res.ok) {
    body.innerHTML = `<p class="liveread-empty">${t('liveread.no_section_data')}</p>`;
    return;
  }
  const data = await res.json();
  if (token !== _showToken) return;
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
}

function _onChoiceClick(e) {
  const a = e.target.closest('a[href^="#section-"]');
  if (!a) return;
  e.preventDefault();
  if (!currentPlaythrough()) return;
  const sec = parseSecId(a.getAttribute('href').slice('#section-'.length));
  if (sec === null) return;
  navigate(sec);
  // navigate() no-ops (just shows an alert) instead of moving pt.path when an
  // alphanumeric book's discoverable-section limit is already reached - only
  // show the target section if the player was actually moved there.
  if (isTerminal(sec) || currentSection() === sec) _showSection(sec);
}

// The app-wide "single known choice -> auto-navigate past it" feature
// (play.js's renderPlaythroughPanel) fires off the back of the very choice
// reveal-on-arrival just committed into state.graph, silently advancing
// pt.path past straight-path sections before the player ever sees their
// text in this panel. Reading is meant to show every section, straight-path
// or not, so auto-nav is suppressed for as long as the panel is open.
function _open() {
  const panel = document.getElementById('liveread-panel');
  if (!panel) return;
  if (!currentPlaythrough()) {
    showAlert(t('liveread.no_active_playthrough'));
    return;
  }
  suppressAutoNav(true);
  setLightweightRestabilize(true);
  panel.classList.add('active');
  _showSection(currentSection() ?? (state.startSection ?? 1));
}

function _close() {
  suppressAutoNav(false);
  setLightweightRestabilize(false);
  // Reset so a later reopen always re-fetches, even onto the same section id -
  // it could belong to a different book by then (_shownSec doesn't track book).
  _shownSec = undefined;
  document.getElementById('liveread-panel')?.classList.remove('active');
}

function _toggle() {
  const panel = document.getElementById('liveread-panel');
  if (panel?.classList.contains('active')) _close();
  else _open();
}

// Stays visible-but-disabled rather than hidden when the current book has
// no live-reading data - #play-btns-bar only has 2-3 buttons in it, so
// toggling this one's presence on every book switch made the whole row's
// width (and the buttons after it) visibly shift back and forth.
export function setLiveReadVisible(visible) {
  const btn = document.getElementById('liveread-btn');
  if (btn) {
    btn.disabled = !visible;
    if (visible) btn.removeAttribute('data-tooltip');
    else btn.setAttribute('data-tooltip', t('liveread.not_available'));
  }
  if (!visible) _close();
}

// Called after navigation / viewing-playthrough changes so an already-open
// panel follows along, mirroring the battlesim*.js renderSimNNN() pattern.
// A just-finished run fires this mid-endPlaythrough() (via setViewingPt())
// with currentPlaythrough() already null - fall back to viewingPt's own
// result so the terminal choice shows the end message instead of silently
// closing the panel out from under the player.
export function renderLiveRead() {
  const panel = document.getElementById('liveread-panel');
  if (!panel || !panel.classList.contains('active')) return;
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

// Persisted client-side only (same as trailCollapsed) - this is a reading
// preference, not per-book/per-user state worth round-tripping to the server.
// Stored and stepped in whole percent (not rem) so the readout is always an
// exact multiple of FONT_SIZE_STEP_PCT - stepping in rem directly (e.g.
// 0.08rem against a 0.88rem base) produces an ugly, non-round percentage.
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

// getComputedStyle(el).lineHeight reports what the CSS *asked for*, not
// necessarily the exact box height the browser actually laid the text out
// in (rem-to-px rounding, the browser's own text zoom/accessibility
// settings, subpixel layout) - close enough to look right at a glance but
// not pixel-exact, which is exactly what "ignore system settings" is
// asking to eliminate. Range.getClientRects() instead measures the real,
// already-laid-out line box of actual text on screen - one rect per
// wrapped line - so this can't drift from what the reader is looking at.
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

  // Overrides the browser's default wheel-scroll amount, which multiplies by
  // an OS-level "lines per scroll" setting (can be anywhere from ~3 to 10+
  // lines per tick depending on the reader's own system config) - fixed at
  // exactly one text line per tick instead.
  // { passive: false } is required for preventDefault() to actually suppress
  // the browser's own native scroll - wheel listeners default to passive.
  const body = document.getElementById('liveread-body');
  body.addEventListener('wheel', e => {
    e.preventDefault();
    body.scrollTop += Math.sign(e.deltaY) * _renderedLineHeight(body);
  }, { passive: false });

  // Lives in the static #play-btns-bar (between User Guide and Notebook),
  // not appended to #play-btn-row like every other panel's trigger button -
  // that row already gets crowded with 4-5 buttons (Equipment/Inventory/
  // Character Sheet/Battle Simulator) and this one landing on top of
  // whichever button happened to be at the wrap boundary once it joined
  // them. #play-btns-bar has room since it's only ever had 2-3 buttons.
  const btn = document.getElementById('liveread-btn');
  btn.innerHTML = shortcutLabel(t('liveread.title'));

  // Docked under #legend on the right edge (see liveread.css) - tracks its
  // real height (varies with the collapse toggle and the portal legend row)
  // into --legend-h the same way charsheet.js tracks --play-btn-row-h, so the
  // panel's own top offset stays accurate instead of guessing a fixed value.
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
