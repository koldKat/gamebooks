import { ROSTER } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

function _isFleeRequested() { return document.getElementById('sim877-flee').checked; }

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, ROSTER, SVG_SKULL, SVG_TROPHY, _appendLog, _isFleeRequested, _data, _encounter, _encounterOptions, _fight, _numField, _pickEncounter, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _roll1d6, _roll2d6, _roll3d6, _rollEsper, _rollSila, _rollZhivot, closeSim877, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim877, openSim877, registerPanelShortcut, renderSim877, resolveGalacticEncounter, saveState, setSim877Visible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _roll1d6, _roll2d6, _roll3d6, _encounter, _fight, _rollSila, _rollZhivot, _rollEsper, _pickEncounter } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Галактическият гигант, book 877)
// Use each encounter's own comparison/roll rules; there is no uniform combat engine.
// Enter current Strength/Life/Esper; life below 3 ends play.

import { currentPlaythrough, saveState } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { resolveGalacticEncounter } from "../.././engines/galactic-giant.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// The database supplies each encounter's rules; the pure engine resolves them
// against current character values and any saved pending duel.



// ── Render ───────────────────────────────────────────────────────────────

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim877-history-summary');
  const listEl = document.getElementById('sim877-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim877.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim877.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : (h.outcome === 'loss' ? SVG_SKULL : '');
    const result = h.outcome === 'win' ? t('battlesim877.history.won') : (h.outcome === 'loss' ? t('battlesim877.history.lost') : t('battlesim877.history.draw'));
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim877-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;
  document.getElementById('sim877-encounter-pick').innerHTML = _encounterOptions(d.encounterId);
  document.getElementById('sim877-player-sila').value   = d.player.sila;
  document.getElementById('sim877-player-zhivot').value = d.player.zhivot;
  document.getElementById('sim877-player-esper').value  = d.player.esper;
  document.getElementById('sim877-encounter-pick').disabled = !!d.pendingDuel;
  document.querySelectorAll('#sim877-overlay .inv-qty-input, #sim877-overlay .inv-qty-btn, #sim877-overlay .bsim-roll-btn')
    .forEach(element => { element.disabled = !!d.pendingDuel; });
  document.getElementById('sim877-flee-row').hidden = _encounter(d.encounterId).fleeBelowStrength === undefined;
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim877() {
  const overlay = document.getElementById('sim877-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim877(); return; }
  _renderAll();
}

function openSim877() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim877-overlay').classList.add('active');
}

function closeSim877() {
  document.getElementById('sim877-overlay')?.classList.remove('active');
}

export function setSim877Visible(visible) {
  const btn = document.getElementById('sim877-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim877();
}

// ── Init ─────────────────────────────────────────────────────────────────

export function initSim877() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim877-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim877.ui.title')}</span>
        <button id="sim877-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim877.ui.you')}</div>
            ${_numField(t('battlesim877.ui.sila'), 'sim877-player-sila', 'sim877-roll-sila')}
            ${_numField(t('battlesim877.ui.zhivot'), 'sim877-player-zhivot', 'sim877-roll-zhivot')}
            ${_numField(t('battlesim877.ui.esper'), 'sim877-player-esper', 'sim877-roll-esper')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim877.ui.encounter')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim877.ui.pick')}</span>
              <select id="sim877-encounter-pick" class="inv-edit-input"></select>
            </div>
            <label id="sim877-flee-row" hidden><input id="sim877-flee" type="checkbox"> ${t('battlesim877.ui.flee')}</label>
          </div>
          <div class="inv-modal-ftr bsim-action-grid">
            <button id="sim877-fight" class="inv-add-btn bsim-action-primary">${t('battlesim877.btn.fight')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim877-history-summary">${t('battlesim877.history.summary', { n: 0 })}</summary>
            <div id="sim877-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim877-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim877-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim877);
  document.getElementById('sim877-close').addEventListener('click', closeSim877);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim877(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim877-overlay'),
    open:  openSim877,
    close: closeSim877,
  });

  document.getElementById('sim877-encounter-pick').addEventListener('change', e => _pickEncounter(e.target.value));
  document.getElementById('sim877-fight').addEventListener('click', _fight);
  document.getElementById('sim877-roll-sila').addEventListener('click', _rollSila);
  document.getElementById('sim877-roll-zhivot').addEventListener('click', _rollZhivot);
  document.getElementById('sim877-roll-esper').addEventListener('click', _rollEsper);

  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d) return;
      const id    = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const val   = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
      input.value = val;
      if (id === 'sim877-player-sila')   d.player.sila = val;
      else if (id === 'sim877-player-zhivot') d.player.zhivot = val;
      else if (id === 'sim877-player-esper')  d.player.esper = val;
      saveState();
    });
  });

  overlay.querySelectorAll('.inv-qty-input').forEach(input => {
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = Math.max(0, parseInt(input.value, 10) || 0);
      input.value = val;
      const id = input.id;
      if (id === 'sim877-player-sila')   d.player.sila = val;
      else if (id === 'sim877-player-zhivot') d.player.zhivot = val;
      else if (id === 'sim877-player-esper')  d.player.esper = val;
      saveState();
    });
  });
}

function _encounterOptions(selectedId) {

  return ROSTER.map(e => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(t(e.nameKey))}</option>`).join('');
}

function _numField(label, id, rollId) {

  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <div class="inv-qty-wrap">
        <button class="inv-qty-btn" data-id="${id}" data-delta="-1">−</button>
        <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
        <button class="inv-qty-btn" data-id="${id}" data-delta="1">+</button>
        ${rollId ? `<button id="${rollId}" class="inv-add-btn bsim-roll-btn">${t('battlesim877.btn.roll')}</button>` : ''}
      </div>
    </div>`;
}

export { initSim877 as init, renderSim877 as render, setSim877Visible as setVisible };
