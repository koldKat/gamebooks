// Admin-only track mode: play any book by manually entering turned-to sections.
// Reuses the reader's record machinery (state.graph, choice/visit recording, XP) and the read-only graph.

import {
  state, loadState, saveState, currentPlaythrough, currentSection,
  setViewingPt, viewingPt, parseSecId, isValidSecId,
} from '../../js/core/state.js';
import {
  _startPlaythrough, _ensureMVisited, _commitChoices, _seedXpBaseline, _checkXpReward,
} from './reader.js';
import { initGraphView, refreshGraph } from './graph-view.js';
import { showConfirm } from '../../js/ui-helpers/confirm.js';
import { t } from '../../js/i18n.js';

function _escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let _session = 0;

export async function renderTrack(mount, book, onBack, { isAdmin = false, keepState = false } = {}) {
  if (!isAdmin) return; // defence in depth: track mode is admin-only
  const session = ++_session;

  mount.innerHTML = `
    <div class="m-topbar">
      <button id="m-back-btn">${t('mobile.back_home')}</button>
      <span class="m-book-title">${_escapeHtml(book.name)}</span>
      ${book.hasLiveReading ? `<button id="m-mode-read-btn" class="m-mode-btn" aria-label="${t('track.switch_to_read')}">${t('track.read')}</button>` : ''}
    </div>
    <div class="m-track">
      <div id="m-track-controls" class="m-track-controls"></div>
      <div id="m-graph-wrap" class="m-graph-wrap">
        <div id="m-graph" class="m-graph"></div>
      </div>
    </div>`;

  mount.querySelector('#m-back-btn').addEventListener('click', () => { ++_session; onBack(); });
  if (book.hasLiveReading) {
    mount.querySelector('#m-mode-read-btn').addEventListener('click', async () => {
      ++_session;
      await saveState();
      const { renderReader } = await import('./reader.js');
      renderReader(mount, book, onBack, { isAdmin: true });
    });
  }

  initGraphView(
    mount.querySelector('#m-graph'),
    () => {}, // graph is a read-only mini-map in track mode
    () => {},
    () => {},
  );

  // Coming from the reader the state is already loaded with the live run; reloading
  // from the server would discard it and look like a fresh run, so keep it.
  if (!keepState) {
    await loadState(book.id);
    if (session !== _session) return;
  }
  _seedXpBaseline();
  _render();
}

const controls = () => document.getElementById('m-track-controls');

// Rebuild the control column from state, then recenter the read-only graph.
function _render() {
  const el = controls();
  if (!el) return;
  const pt  = currentPlaythrough();
  const done = !pt && viewingPt?.completed ? viewingPt : null;

  if (!pt) {
    const startDefault = isValidSecId(state.startSection) ? state.startSection : 1;
    el.innerHTML = `
      ${done ? `<div class="m-track-outcome m-track-outcome--${done.result === 'success' ? 'win' : 'loss'}">${t(done.result === 'success' ? 'runs.victory' : 'runs.death')}</div>` : ''}
      <p class="m-track-hint">${t('track.no_run')}</p>
      <div class="ft-input-row">
        <span class="ft-input-row-label">${t('track.start_section')}</span>
        ${_stepper('m-track-start', startDefault)}
      </div>
      <button id="m-track-startrun" class="m-tool-btn m-win-btn">${t('track.start_run')}</button>`;
    _bindStepper('m-track-start');
    el.querySelector('#m-track-startrun').addEventListener('click', _startRun);
    refreshGraph(done ? currentSectionOf(done) : (isValidSecId(state.startSection) ? state.startSection : 1));
    return;
  }

  const cur = currentSection();
  const choices = (state.graph[cur]?.choices || []).filter(c => isValidSecId(parseSecId(c)));
  const trail = [...pt.path].reverse();

  el.innerHTML = `
    <div class="m-track-current">${t('track.at_section', { sec: cur })}</div>
    <div class="ft-input-row">
      <span class="ft-input-row-label">${t('track.turn_to')}</span>
      ${_stepper('m-track-turn', '')}
      <button id="m-track-go" class="m-tool-btn m-track-go">${t('track.go')}</button>
    </div>
    ${choices.length ? `<div class="m-track-chips">${choices.map(c =>
      `<button class="m-track-chip" data-sec="${_escapeHtml(c)}">${_escapeHtml(c)}</button>`).join('')}</div>` : ''}
    <div class="m-tool-row">
      <button id="m-track-undo" class="m-tool-btn"${pt.path.length <= 1 ? ' disabled' : ''}>${t('track.undo')}</button>
      <button id="m-track-win" class="m-tool-btn m-win-btn">${t('runs.victory')}</button>
      <button id="m-track-loss" class="m-tool-btn m-loss-btn">${t('runs.death')}</button>
    </div>
    <div class="m-track-trail">
      <div class="m-track-trail-label">${t('track.trail')}</div>
      <ol class="m-track-trail-list">${trail.map((s, i) =>
        `<li${i === 0 ? ' class="m-track-trail-cur"' : ''}>${_escapeHtml(s)}</li>`).join('')}</ol>
    </div>`;

  _bindStepper('m-track-turn');
  const go = () => _turnTo(document.getElementById('m-track-turn').value);
  el.querySelector('#m-track-go').addEventListener('click', go);
  document.getElementById('m-track-turn').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  el.querySelectorAll('.m-track-chip').forEach(btn =>
    btn.addEventListener('click', () => _turnTo(btn.dataset.sec)));
  el.querySelector('#m-track-undo').addEventListener('click', _undo);
  el.querySelector('#m-track-win').addEventListener('click', () =>
    showConfirm(t('mobile.confirm_win'), () => _endRun('success'), { confirmLabel: t('runs.victory'), danger: false, win: true }));
  el.querySelector('#m-track-loss').addEventListener('click', () =>
    showConfirm(t('mobile.confirm_loss'), () => _endRun('death'), { confirmLabel: t('runs.death') }));

  refreshGraph(cur);
}

function currentSectionOf(pt) { return pt.path.length ? pt.path[pt.path.length - 1] : 1; }

// Reuse the fast-travel stepper markup so numeric entry looks and behaves consistently.
function _stepper(id, value) {
  return `<div class="ft-qty-wrap">
      <button class="ft-qty-btn" data-step="dec" data-for="${id}">−</button>
      <input id="${id}" class="ft-qty-input" type="text" inputmode="numeric" value="${_escapeHtml(value)}">
      <button class="ft-qty-btn" data-step="inc" data-for="${id}">+</button>
    </div>`;
}

function _bindStepper(id) {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener('input', () => { input.value = input.value.replace(/[^0-9]/g, ''); });
  controls().querySelectorAll(`[data-for="${id}"]`).forEach(btn => btn.addEventListener('click', () => {
    const v = parseInt(input.value, 10);
    if (btn.dataset.step === 'dec') { if (v > 1) input.value = v - 1; }
    else input.value = isNaN(v) ? 1 : v + 1;
  }));
}

function _startRun() {
  const raw = document.getElementById('m-track-start')?.value;
  const startSec = parseSecId(raw);
  _startPlaythrough(isValidSecId(startSec) ? startSec : 1);
  saveState();
  _checkXpReward();
  _render();
}

// Same backend action as tapping a choice in the reader: record the edge + visit, save.
function _turnTo(raw) {
  const pt = currentPlaythrough();
  if (!pt) return;
  const dest = parseSecId(raw);
  if (!isValidSecId(dest)) return;
  const cur = currentSection();
  if (cur !== null) _commitChoices(cur, [...(state.graph[cur]?.choices || []), dest]);
  pt.path.push(dest);
  const mVisited = _ensureMVisited(pt);
  if (!mVisited.includes(dest)) mVisited.push(dest);
  pt.lastActionAt = Date.now();
  saveState();
  _checkXpReward();
  _render();
}

// Step back one section; mVisited keeps the section permanently, matching the reader.
function _undo() {
  const pt = currentPlaythrough();
  if (!pt || pt.path.length <= 1) return;
  pt.path.pop();
  pt.lastActionAt = Date.now();
  saveState();
  _render();
}

// Mirror the reader's run-end state mutation: record the terminal sentinel and freeze as viewingPt.
function _endRun(result) {
  const pt = currentPlaythrough();
  if (!pt) return;
  const sec = currentSection();
  pt.completed = true;
  pt.result = result;
  pt.completedAt = Date.now();
  pt.lastActionAt = Date.now();
  setViewingPt(pt);
  if (sec !== null && isValidSecId(sec)) {
    if (!state.graph[sec]) state.graph[sec] = { choices: [] };
    const sentinel = result === 'success' ? 0 : -1;
    if (!state.graph[sec].choices.includes(sentinel)) state.graph[sec].choices.push(sentinel);
  }
  saveState();
  _checkXpReward();
  _render();
}
