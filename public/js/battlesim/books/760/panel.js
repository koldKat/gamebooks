import { ROSTER } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, ROSTER, SVG_SKULL, SVG_TROPHY, _appendLog, _battleOver, _data, _enemyName, _fighter, _fighterOptions, _numField, _pickEnemy, _pickPlayer, _playerLost, _playerName, _playerWon, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _renderStatus, _resetBattle, _roll1d6, _runRound, _startBattle, _strike, closeSim760, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim760, openSim760, registerPanelShortcut, renderSim760, saveState, setSim760Visible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _battleOver, _recordOutcome } = createState(simulatorContext);
const { _fighter, _roll1d6, _playerName, _enemyName, _playerWon, _playerLost, _startBattle, _strike, _runRound, _resetBattle, _pickPlayer, _pickEnemy } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Бойците на Европа, book 760)
// Initiative uses interactive status + 1d6; a gap of 3+ grants two opening hits.
// Alternate attacks dealing max(0,offensive status+1d6-defensive status); no bracket tracking.

import { currentPlaythrough, saveState } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;




















// ── Combat ───────────────────────────────────────────────────────────────













// ── Render ───────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim760-status');
  if (!d || !el) return;
  if (_playerLost(d))      el.innerHTML = t('battlesim760.status.fallen', { skull: SVG_SKULL });
  else if (_playerWon(d))  el.innerHTML = t('battlesim760.status.victory', { trophy: SVG_TROPHY });
  else                     el.innerHTML = '';
  document.getElementById('sim760-round').disabled = _battleOver(d);
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim760-history-summary');
  const listEl = document.getElementById('sim760-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim760.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim760.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim760.history.won') : t('battlesim760.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.player)} ${t('battlesim760.history.vs')} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim760-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}



function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim760-player-pick').innerHTML = _fighterOptions(d.playerId);
  document.getElementById('sim760-enemy-pick').innerHTML  = _fighterOptions(d.enemyId);

  document.getElementById('sim760-player-attack').value      = d.player.attack;
  document.getElementById('sim760-player-defense').value     = d.player.defense;
  document.getElementById('sim760-player-interactive').value = d.player.interactive;
  document.getElementById('sim760-player-life').value        = d.player.life;

  document.getElementById('sim760-enemy-attack').value      = d.enemy.attack;
  document.getElementById('sim760-enemy-defense').value     = d.enemy.defense;
  document.getElementById('sim760-enemy-interactive').value = d.enemy.interactive;
  document.getElementById('sim760-enemy-life').value        = d.enemy.life;

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim760() {
  const overlay = document.getElementById('sim760-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim760(); return; }
  _renderAll();
}

function openSim760() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim760-overlay').classList.add('active');
}

function closeSim760() {
  document.getElementById('sim760-overlay')?.classList.remove('active');
}

export function setSim760Visible(visible) {
  const btn = document.getElementById('sim760-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim760();
}

// ── Init ─────────────────────────────────────────────────────────────────



export function initSim760() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim760-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim760.ui.title')}</span>
        <button id="sim760-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim760.ui.you')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim760.ui.pick')}</span>
              <select id="sim760-player-pick" class="inv-edit-input"></select>
            </div>
            ${_numField(t('battlesim760.ui.attack'), 'sim760-player-attack')}
            ${_numField(t('battlesim760.ui.defense'), 'sim760-player-defense')}
            ${_numField(t('battlesim760.ui.interactive'), 'sim760-player-interactive')}
            ${_numField(t('battlesim760.ui.life'), 'sim760-player-life')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim760.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim760.ui.pick')}</span>
              <select id="sim760-enemy-pick" class="inv-edit-input"></select>
            </div>
            ${_numField(t('battlesim760.ui.attack'), 'sim760-enemy-attack')}
            ${_numField(t('battlesim760.ui.defense'), 'sim760-enemy-defense')}
            ${_numField(t('battlesim760.ui.interactive'), 'sim760-enemy-interactive')}
            ${_numField(t('battlesim760.ui.life'), 'sim760-enemy-life')}
          </div>
          <div id="sim760-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim760-round" class="inv-add-btn bsim-action-primary">${t('battlesim760.btn.round')}</button>
            <button id="sim760-reset" class="inv-add-btn">${t('battlesim760.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim760-history-summary">${t('battlesim760.history.summary', { n: 0 })}</summary>
            <div id="sim760-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim760-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim760-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim760);
  document.getElementById('sim760-close').addEventListener('click', closeSim760);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim760(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim760-overlay'),
    open:  openSim760,
    close: closeSim760,
  });

  document.getElementById('sim760-player-pick').addEventListener('change', e => _pickPlayer(e.target.value));
  document.getElementById('sim760-enemy-pick').addEventListener('change', e => _pickEnemy(e.target.value));
  document.getElementById('sim760-round').addEventListener('click', _runRound);
  document.getElementById('sim760-reset').addEventListener('click', _resetBattle);

  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d) return;
      const id    = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const val   = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
      input.value = val;
      if (id === 'sim760-player-attack')      d.player.attack = val;
      else if (id === 'sim760-player-defense')     d.player.defense = val;
      else if (id === 'sim760-player-interactive') d.player.interactive = val;
      else if (id === 'sim760-player-life')        d.player.life = val;
      else if (id === 'sim760-enemy-attack')       d.enemy.attack = val;
      else if (id === 'sim760-enemy-defense')      d.enemy.defense = val;
      else if (id === 'sim760-enemy-interactive')  d.enemy.interactive = val;
      else if (id === 'sim760-enemy-life')         d.enemy.life = val;
      saveState();
      _renderStatus();
    });
  });

  overlay.querySelectorAll('.inv-qty-input').forEach(input => {
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = Math.max(0, parseInt(input.value, 10) || 0);
      input.value = val;
      const id = input.id;
      if (id === 'sim760-player-attack')      d.player.attack = val;
      else if (id === 'sim760-player-defense')     d.player.defense = val;
      else if (id === 'sim760-player-interactive') d.player.interactive = val;
      else if (id === 'sim760-player-life')        d.player.life = val;
      else if (id === 'sim760-enemy-attack')       d.enemy.attack = val;
      else if (id === 'sim760-enemy-defense')      d.enemy.defense = val;
      else if (id === 'sim760-enemy-interactive')  d.enemy.interactive = val;
      else if (id === 'sim760-enemy-life')         d.enemy.life = val;
      saveState();
      _renderStatus();
    });
  });
}

function _fighterOptions(selectedId) {

  return ROSTER.map(f => `<option value="${f.id}" ${f.id === selectedId ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('');
}

function _numField(label, id) {

  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <div class="inv-qty-wrap">
        <button class="inv-qty-btn" data-id="${id}" data-delta="-1">−</button>
        <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
        <button class="inv-qty-btn" data-id="${id}" data-delta="1">+</button>
      </div>
    </div>`;
}

export { initSim760 as init, renderSim760 as render, setSim760Visible as setVisible };
