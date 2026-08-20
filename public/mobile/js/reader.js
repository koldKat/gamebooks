// reader.js - The "double-screen" play view: top pane is in-app reading,
// bottom pane is always the graph (graph-view.js). Reading-only on purpose -
// mobile play is scoped to books with imported text, no manual section
// entry/choice recording and no Win/Loss/Battle Death buttons. Typing
// section numbers works fine at a desk next to a keyboard; on a phone it
// means putting the book down, hunting-and-pecking on glass, then picking
// the book back up - a much worse version of the same friction, not a
// smaller one. Reading and tapping (in-text links, graph nodes) never have
// that problem, so that's all mobile does. A gap in an otherwise-covered
// book (a section or two without imported text) shows a plain "not
// available here" message instead of falling into manual entry.
//
// Reuses state.js directly but does NOT import play.js/graph.js/liveread.js
// - those transitively pull in i18n.js (reads localStorage at module
// top-level) and vis-network gets loaded separately, on its own terms, for
// the graph pane below. commitChoices/startPlaythrough are small,
// deliberately-local reimplementations of the same DOM-free logic those
// files already have (play.js:856-888, play.js's startPlaythrough).

import {
  state, loadState, saveState, apiFetch, currentBookId,
  currentPlaythrough, currentSection, isTerminal, isValidSecId, parseSecId,
  setViewingPt,
} from '../../js/state.js?v=14';
import { initGraphView, refreshGraph } from './graph-view.js?v=6';
import { openNotebook } from './notebook.js?v=8';
import { hasSim, openSimForBook } from './battlesim-dispatch.js?v=5';
import { t } from '../../js/i18n.js?v=74';

function _escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  });
  state.activePtIndex = state.playthroughs.length - 1;
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
    </div>
    <div class="m-panes">
      <div id="m-top" class="m-top">${t('mobile.loading')}</div>
      <div class="m-tool-row">
        <button id="m-notebook-btn" class="m-tool-btn">${t('notes.notebook_title')}</button>
        <button id="m-battlesim-btn" class="m-tool-btn" style="display:none">${t('battlesim.title')}</button>
      </div>
      <div id="m-graph" class="m-graph"></div>
    </div>`;
  document.getElementById('m-back-btn').addEventListener('click', onBack);
  document.getElementById('m-notebook-btn').addEventListener('click', () => openNotebook(book.id));

  const battlesimBtn = document.getElementById('m-battlesim-btn');
  if (hasSim(book.id)) {
    battlesimBtn.style.display = '';
    battlesimBtn.addEventListener('click', () => openSimForBook(book.id));
  }

  initGraphView(document.getElementById('m-graph'), sec => _onGraphTap(parseSecId(sec) ?? sec));

  await loadState(book.id);
  if (!currentPlaythrough()) {
    const startSec = isValidSecId(state.startSection) ? state.startSection : 1;
    _startPlaythrough(startSec);
    await saveState();
  }
  await _showSection(currentSection());
}

async function _showSection(sec) {
  const top = document.getElementById('m-top');
  if (!top) return;
  const token = ++_showToken;

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
    return;
  }
  const data = await res.json();
  if (token !== _showToken) return;

  top.innerHTML = data.html;
  top.scrollTop = 0;
  if (data.choices?.length) _commitChoices(sec, data.choices);
  refreshGraph(sec);

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

// Tapping the graph is the only navigation gesture mobile has (see file
// header), so it has to distinguish two very different intents: tapping a
// live, reachable-from-here choice should actually advance the run, same as
// tapping that choice's in-text link would; tapping anywhere else on the
// map (older visited nodes, other branches) is just looking something up
// and must never silently rewrite pt.path with a phantom "you chose to
// jump here" entry - that's real fast-travel territory (desktop gates it
// behind an explicit Jump action), not something a plain tap should do.
function _onGraphTap(sec) {
  const curChoices = state.graph[currentSection()]?.choices || [];
  if (curChoices.includes(sec)) _navigate(sec);
  else _previewSection(sec);
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
    refreshGraph(sec);
    _showEndScreen(pt.result);
    return;
  }
  pt.path.push(sec);
  pt.lastActionAt = Date.now();
  saveState();
  _showSection(sec);
}

function _showEndScreen(result) {
  const top = document.getElementById('m-top');
  if (!top) return;
  ++_showToken; // invalidate any in-flight section fetch
  top.innerHTML = `<p class="m-end">${result === 'success' ? t('liveread.the_end_win') : t('liveread.the_end_death')}</p>`;
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
    _showSection(currentSection());
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
    _showSection(currentSection());
  });
  top.querySelectorAll('a[href^="#"]').forEach(a => {
    if (a.id === 'm-preview-return') return;
    const href = a.getAttribute('href').slice(1);
    if (!href) return;
    a.addEventListener('click', e => {
      e.preventDefault();
      if (href.startsWith('section-')) {
        const dest = parseSecId(href.slice('section-'.length));
        if (dest !== null) _previewSection(dest);
      } else {
        _showExtra(href);
      }
    });
  });
}
