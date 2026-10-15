import { WEAPONS } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, SVG_SKULL, SVG_TROPHY, WEAPONS, _appendLog, _checkEnd, _data, _die, _duelEnemyDead, _duelRound, _hordeCleared, _hordeRound, _numField, _pickWeapon, _playerDead, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _renderStatus, _rollDice, _rollWeapon, _round, _setMode, _startBattle, _throwGrenade, _useMedkit, _weapon, _weaponNameById, _weaponOptionsHtml, closeSim161, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim161, openSim161, registerPanelShortcut, renderSim161, saveState, setSim161Visible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _weapon, _weaponNameById, _die, _rollDice, _rollWeapon, _playerDead, _hordeCleared, _duelEnemyDead, _checkEnd, _hordeRound, _duelRound, _round, _startBattle, _throwGrenade, _setMode, _pickWeapon } = createCombat(simulatorContext);
const { _useMedkit } = createEffects(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Blood of the Zombies, book 161)
// Weapon damage removes that many enemies; survivors each retaliate.
// Start at 2d6+20 STAMINA; grenade kills and survivor damage are separate inputs.

import { currentPlaythrough, saveState } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// ── Render ───────────────────────────────────────────────────────────────

function _renderStatus() {
  const d = _data();
  const el = document.getElementById('sim161-status');
  if (!d || !el) return;
  if (d.over) {
    if (d.winner === 'player') el.innerHTML = t('battlesim161.status.victory', { trophy: SVG_TROPHY });
    else el.innerHTML = t('battlesim161.status.fallen', { skull: SVG_SKULL });
  } else {
    el.innerHTML = '';
  }
  document.getElementById('sim161-round').disabled = d.over || !d.started;
}

function _renderInputs() {
  const d = _data();
  if (!d) return;
  const hordeEls = document.getElementById('sim161-horde-fields');
  const duelEls = document.getElementById('sim161-duel-fields');
  if (hordeEls) hordeEls.style.display = d.mode === 'horde' ? '' : 'none';
  if (duelEls) duelEls.style.display = d.mode === 'duel' ? '' : 'none';
  document.getElementById('sim161-mode').value = d.mode;
  document.getElementById('sim161-player-stamina').value = d.playerStamina;
  document.getElementById('sim161-player-stamina-max').value = d.playerStaminaMax;
  document.getElementById('sim161-medkit-amount').value = d.medkitAmount;

  document.getElementById('sim161-weapon-pick').innerHTML = _weaponOptionsHtml(d.weaponId);
  document.getElementById('sim161-dice-n').value = d.diceN;
  document.getElementById('sim161-dice-sides').value = d.diceSides;
  document.getElementById('sim161-dice-mod').value = d.diceMod;
  document.getElementById('sim161-custom-dice-row').style.display = d.weaponId === 'custom' ? '' : 'none';
  document.getElementById('sim161-enemy-count').value = d.enemyCount;
  document.getElementById('sim161-retaliation').value = d.retaliation;

  document.getElementById('sim161-duel-enemy-stamina').value = d.duelEnemyStamina;
  document.getElementById('sim161-duel-enemy-stamina-max').value = d.duelEnemyStaminaMax;
  document.getElementById('sim161-duel-player-mod').value = d.duelPlayerDiceMod;
  document.getElementById('sim161-duel-enemy-mod').value = d.duelEnemyDiceMod;
  _renderStatus();
}

function _renderHistory() {
  const d = _data();
  const sumEl = document.getElementById('sim161-history-summary');
  const listEl = document.getElementById('sim161-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim161.history.summary', { n: d.history.length });
  if (!d.history.length) { listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim161.history.empty')}</div>`; return; }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim161.history.won') : t('battlesim161.history.lost');
    const modeLabel = h.mode === 'duel' ? t('battlesim161.mode.duel') : t('battlesim161.mode.horde');
    const date = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row"><span>${icon} ${escapeHtml(modeLabel)} - ${result}</span><span class="bsim-history-meta">${date}</span></div>`;
  }).join('');
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim161-log');
  if (!el || !d) return;
  el.innerHTML = d.log.filter(Boolean).slice().reverse().join('<br>');
}

function _renderAll() { _renderInputs(); _renderLog(); _renderHistory(); }

export function renderSim161() {
  const overlay = document.getElementById('sim161-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim161(); return; }
  _renderAll();
}

function openSim161() {
  if (!_data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  _renderAll();
  document.getElementById('sim161-overlay').classList.add('active');
}

function closeSim161() { document.getElementById('sim161-overlay')?.classList.remove('active'); }

export function setSim161Visible(visible) {
  const btn = document.getElementById('sim161-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim161();
}

// ── Init ─────────────────────────────────────────────────────────────────

export function initSim161() {
  const overlay = document.createElement('div');
  overlay.id = 'sim161-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim161.ui.title')}</span>
        <button id="sim161-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim161.ui.mode')}</span>
              <select id="sim161-mode" class="inv-edit-input">
                <option value="horde">${t('battlesim161.mode.horde')}</option>
                <option value="duel">${t('battlesim161.mode.duel')}</option>
              </select>
            </div>
            <div class="bsim-side-title">${t('battlesim161.ui.you')}</div>
            ${_numField(t('battlesim161.ui.stamina'), 'sim161-player-stamina')}
            ${_numField(t('battlesim161.ui.stamina_max'), 'sim161-player-stamina-max')}
            ${_numField(t('battlesim161.ui.medkit_amount'), 'sim161-medkit-amount')}
            <div class="inv-modal-ftr">
              <button id="sim161-medkit" class="inv-add-btn">${t('battlesim161.btn.medkit')}</button>
            </div>
          </div>
          <div id="sim161-horde-fields" class="bsim-side">
            <div class="bsim-side-title">${t('battlesim161.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim161.ui.pick')}</span>
              <select id="sim161-weapon-pick" class="inv-edit-input"></select>
            </div>
            <div id="sim161-custom-dice-row">
              ${_numField(t('battlesim161.ui.dice_n'), 'sim161-dice-n')}
              ${_numField(t('battlesim161.ui.dice_sides'), 'sim161-dice-sides')}
              ${_numField(t('battlesim161.ui.dice_mod'), 'sim161-dice-mod')}
            </div>
            ${_numField(t('battlesim161.ui.enemy_count'), 'sim161-enemy-count')}
            ${_numField(t('battlesim161.ui.retaliation'), 'sim161-retaliation')}
            <div class="inv-modal-ftr">
              <button id="sim161-grenade" class="inv-add-btn">${t('battlesim161.btn.grenade')}</button>
            </div>
          </div>
          <div id="sim161-duel-fields" class="bsim-side">
            <div class="bsim-side-title">${t('battlesim161.ui.duel_enemy')}</div>
            ${_numField(t('battlesim161.ui.stamina'), 'sim161-duel-enemy-stamina')}
            ${_numField(t('battlesim161.ui.stamina_max'), 'sim161-duel-enemy-stamina-max')}
            ${_numField(t('battlesim161.ui.your_mod'), 'sim161-duel-player-mod')}
            ${_numField(t('battlesim161.ui.enemy_mod'), 'sim161-duel-enemy-mod')}
          </div>
          <div id="sim161-status" class="bsim-status"></div>
          <div class="inv-modal-ftr bsim-action-grid">
            <button id="sim161-round" class="inv-add-btn bsim-action-primary">${t('battlesim161.btn.round')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim161-start" class="inv-add-btn">${t('battlesim161.btn.start')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim161-history-summary">${t('battlesim161.history.summary', { n: 0 })}</summary>
            <div id="sim161-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim161-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id = 'sim161-btn';
  btn.innerHTML = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim161);
  document.getElementById('sim161-close').addEventListener('click', closeSim161);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim161(); });
  registerPanelShortcut('KeyS', {
    getButton: () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim161-overlay'),
    open: openSim161,
    close: closeSim161,
  });

  document.getElementById('sim161-mode').addEventListener('change', e => _setMode(e.target.value));
  document.getElementById('sim161-weapon-pick').addEventListener('change', e => _pickWeapon(e.target.value));
  document.getElementById('sim161-start').addEventListener('click', _startBattle);
  document.getElementById('sim161-round').addEventListener('click', _round);
  document.getElementById('sim161-grenade').addEventListener('click', _throwGrenade);
  document.getElementById('sim161-medkit').addEventListener('click', _useMedkit);

  const fieldMap = {
    'sim161-player-stamina': (d, v) => { d.playerStamina = v; },
    'sim161-player-stamina-max': (d, v) => { d.playerStaminaMax = v; },
    'sim161-medkit-amount': (d, v) => { d.medkitAmount = v; },
    'sim161-dice-n': (d, v) => { d.diceN = v; },
    'sim161-dice-sides': (d, v) => { d.diceSides = v; },
    'sim161-dice-mod': (d, v) => { d.diceMod = v; },
    'sim161-enemy-count': (d, v) => { d.enemyCount = v; },
    'sim161-retaliation': (d, v) => { d.retaliation = v; },
    'sim161-duel-enemy-stamina': (d, v) => { d.duelEnemyStamina = v; },
    'sim161-duel-enemy-stamina-max': (d, v) => { d.duelEnemyStaminaMax = v; },
    'sim161-duel-player-mod': (d, v) => { d.duelPlayerDiceMod = v; },
    'sim161-duel-enemy-mod': (d, v) => { d.duelEnemyDiceMod = v; },
  };
  // Allow signed dice modifiers, unlike ordinary quantity fields.
  const signedFields = new Set(['sim161-dice-mod', 'sim161-duel-player-mod', 'sim161-duel-enemy-mod']);

  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d) return;
      const id = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const min = signedFields.has(id) ? -99 : 0;
      const val = Math.max(min, (parseInt(input.value, 10) || 0) + delta);
      input.value = val;
      if (fieldMap[id]) fieldMap[id](d, val);
      saveState();
      _renderStatus();
    });
  });

  overlay.querySelectorAll('.inv-qty-input').forEach(input => {
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const min = signedFields.has(input.id) ? -99 : 0;
      const val = Math.max(min, parseInt(input.value, 10) || 0);
      input.value = val;
      if (fieldMap[input.id]) fieldMap[input.id](d, val);
      saveState();
      _renderStatus();
    });
  });
}

function _weaponOptionsHtml(selectedId) {

  return WEAPONS.map(w => `<option value="${w.id}" ${w.id === selectedId ? 'selected' : ''}>${escapeHtml(t(w.nameKey))}</option>`).join('');
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

export { initSim161 as init, renderSim161 as render, setSim161Visible as setVisible };
