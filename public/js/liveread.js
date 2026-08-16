// liveread.js - "Live reading" POC: a floating, non-blocking panel that renders
// a book's actual prose section-by-section (from admin-imported book_sections
// data) with clickable in-text choices, feeding state.graph via reveal-on-arrival
// as the player reads. Gated server-side to a single hardcoded account
// (db._canLiveRead) - the client only ever sees hasLiveReading:true for that
// account, so no extra gating is needed here beyond respecting that flag.
// Deliberately NOT built on .inv-overlay: the whole point is that the graph
// stays visible and interactive underneath while reading.

import { state, apiFetch, currentBookId, currentPlaythrough, currentSection, viewingPt, isTerminal, parseSecId } from './state.js?v=13';
import { navigate, commitChoices, showAlert, suppressAutoNav } from './play.js?v=132';
import { t } from './i18n.js?v=59';
import { getPlayBtnRow } from './charsheet.js?v=89';
import { shortcutLabel, registerPanelShortcut, ALL_PANEL_OVERLAY_IDS } from './util.js?v=72';

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
  panel.classList.add('active');
  _showSection(currentSection() ?? (state.startSection ?? 1));
}

function _close() {
  suppressAutoNav(false);
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

export function setLiveReadVisible(visible) {
  const btn = document.getElementById('liveread-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
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

export function initLiveRead() {
  const panel = document.createElement('div');
  panel.id = 'liveread-panel';
  panel.className = 'liveread-panel';
  panel.innerHTML = `
    <div class="inv-modal-hdr">
      <span id="liveread-heading" class="inv-modal-title">${t('liveread.title')}</span>
      <button id="liveread-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
    </div>
    <div id="liveread-body" class="liveread-body"></div>`;
  document.body.appendChild(panel);

  const btn = document.createElement('button');
  btn.id = 'liveread-btn';
  btn.innerHTML = shortcutLabel(t('liveread.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

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
