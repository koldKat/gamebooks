import { PLAYER_STAT_KEYS } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, PLAYER_STAT_KEYS, ROSTER, SVG_SKULL, SVG_TROPHY, _appendLog, _applyPassivePenalty, _battleOver, _checkDodge, _data, _defaultPlayerStats, _enemy, _enemyAttackTotal, _enemyDefenseTotal, _enemyName, _enemyOptions, _hasWon, _moveLabelKey, _numField, _pickEnemy, _playerAttackTotal, _playerDefenseTotal, _playerLost, _playerWon, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _renderStatus, _resetBattle, _roll1d6, _runRound, advanceKungFuAction, closeSim772, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim772, kungFuAction, kungFuDefeated, kungFuEnemy, openSim772, registerPanelShortcut, renderSim772, saveState, setSim772Visible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _battleOver, _recordOutcome } = createState(simulatorContext);
const { _enemy, _defaultPlayerStats, _roll1d6, _enemyName, _hasWon, _playerWon, _playerLost, _playerAttackTotal, _playerDefenseTotal, _enemyAttackTotal, _enemyDefenseTotal, _moveLabelKey, _applyPassivePenalty, _checkDodge, _runRound, _resetBattle, _pickEnemy } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Бойците на Кунг-Фу, book 772)
// Enter journal stats; opponent-specific patterns select attack/defense actions.
// Victory/defeat requires two consecutive or three total round wins/losses.
// Passive defense is once per fight; NPC defense does not use the player's stat-drain effect.

import { currentPlaythrough, saveState } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { kungFuEnemy, kungFuAction, advanceKungFuAction, kungFuDefeated } from "../.././engines/kung-fu.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Player stat keys (typed in by the reader from their own journal).
// Labels are i18n keys, resolved via t() at render time.

// Select the enemy action from round/history; resolve NPC defense as aggressive, without player-only drain.
const ROSTER = [
  {
    id: 'park_attackers', name: 'Нападатели в парка',
    defLeg: 13, atkLeg: null, defHand: 16, atkHand: 22, defComb: 22, atkComb: null,
    dodge: null,
    pattern() { return { type: 'attack', move: 'hand' }; },
  },
  {
    id: 'kao_lie', name: 'Као Лье',
    defLeg: 35, atkLeg: 42, defHand: 36, atkHand: 44, defComb: 50, atkComb: 45,
    dodge: [1, 2, 4],
    pattern() { return { type: 'defend', move: 'aggressive' }; },
  },
  {
    id: 'li_xiao', name: 'Ли Сяо',
    defLeg: 19, atkLeg: 22, defHand: 17, atkHand: 22, defComb: 24, atkComb: 24,
    dodge: null,
    pattern(i) {
      const cycle = ['combined', 'combined', 'leg', 'hand'];
      return { type: 'attack', move: cycle[i % cycle.length] };
    },
  },
  {
    id: 'tun_tsin', name: 'Тун Цзин',
    defLeg: null, atkLeg: null, defHand: null, atkHand: 24, defComb: null, atkComb: 25,
    dodge: [4],
    pattern(i) {
      const cycle = ['hand', 'combined'];
      return { type: 'attack', move: cycle[i % cycle.length] };
    },
  },
  {
    id: 'dupont_early', name: 'Жак Дюпон, ранна среща',
    defLeg: 17, atkLeg: 23, defHand: 16, atkHand: null, defComb: 22, atkComb: null,
    dodge: null,
    pattern() {
      return { type: 'attack', move: 'leg' };
    },
  },
  {
    id: 'dupont_tournament', name: 'Жак Дюпон, турнир',
    defLeg: 25, atkLeg: 29, defHand: 23, atkHand: null, defComb: 31, atkComb: null,
    dodge: null,
    pattern(i) {
      return i === 0 ? { type: 'defend', move: 'aggressive' } : { type: 'attack', move: 'leg' };
    },
  },
  {
    id: 'steve_train', name: 'Стив Трейн',
    defLeg: null, atkLeg: null, defHand: 30, atkHand: 41, defComb: 41, atkComb: 39,
    dodge: null,
    pattern(i) {
      // First attack is hands (i=0), then alternates hand/combined.
      return { type: 'attack', move: i % 2 === 0 ? 'hand' : 'combined' };
    },
  },
  {
    id: 'lin_bao_tournament', name: 'Лин Бао, турнир',
    defLeg: 33, atkLeg: 38, defHand: 31, atkHand: 40, defComb: 44, atkComb: 42,
    dodge: [2, 5],
    pattern(i) {
      const cycle = ['leg', 'hand', 'combined'];
      return { type: 'attack', move: cycle[i % cycle.length] };
    },
  },
  {
    id: 'lin_bao_rescue', name: 'Лин Бао, спасяване',
    defLeg: 31, atkLeg: null, defHand: 30, atkHand: 37, defComb: null, atkComb: null,
    dodge: [2, 5],
    pattern(i) {
      return i < 2 ? { type: 'attack', move: 'hand' } : { type: 'defend', move: 'aggressive' };
    },
  },
  {
    id: 'mac_stone', name: 'Мак Стоун',
    defLeg: 34, atkLeg: 43, defHand: 34, atkHand: 43, defComb: 46, atkComb: 43,
    dodge: [1, 3, 5],
    pattern(i) {
      if (i === 0) return { type: 'defend', move: 'aggressive' };
      const moves = ['leg', 'hand', 'combined'];
      return { type: 'attack', move: moves[Math.floor(Math.random() * moves.length)] };
    },
  },
  {
    id: 'arena_guards', name: 'Охрана на арената',
    defLeg: 28, atkLeg: null, defHand: 26, atkHand: null, defComb: 36, atkComb: null,
    dodge: null,
    pattern() {
      return { type: 'defend', move: 'passive' };
    },
  },
  {
    id: 'arena_rescue_guards', name: 'Охрана при спасяването на Бо Дзи',
    defLeg: 31, atkLeg: null, defHand: 30, atkHand: null, defComb: 38, atkComb: 40,
    dodge: null,
    pattern() { return { type: 'defend', move: 'aggressive' }; },
  },
  {
    id: 'arena_melee_guards', name: 'Охрана в мелето на арената',
    defLeg: 29, atkLeg: null, defHand: 28, atkHand: 38, defComb: 38, atkComb: 36,
    dodge: null,
    pattern() { return { type: 'attack', move: 'hand' }; },
  },
];

// Count wins: true if 2 consecutive wins, or 3 total wins (non-consecutive
// counts fine since 2 consecutive is already covered separately).

// ── Combat ───────────────────────────────────────────────────────────────

// NPC defense is aggressive-style, without the player's passive stat-drain effect.

// ── Render ───────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim772-status');
  if (!d || !el) return;
  if (_playerLost(d))      el.innerHTML = t('battlesim772.status.fallen', { skull: SVG_SKULL });
  else if (_playerWon(d))  el.innerHTML = t('battlesim772.status.victory', { trophy: SVG_TROPHY });
  else                     el.innerHTML = '';
  const over = _battleOver(d);
  ['sim772-atk-leg', 'sim772-atk-hand', 'sim772-atk-combined', 'sim772-def-passive', 'sim772-def-aggressive'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    let disabled = over;
    if (id === 'sim772-def-passive' && d.playerPassiveUsed) disabled = true;
    btn.disabled = disabled;
  });
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim772-history-summary');
  const listEl = document.getElementById('sim772-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim772.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim772.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim772.history.won') : t('battlesim772.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${t('battlesim772.history.you')} ${t('battlesim772.history.vs')} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim772-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim772-enemy-pick').innerHTML = _enemyOptions(d.enemyId);

  PLAYER_STAT_KEYS.forEach(([k]) => {
    const el = document.getElementById(`sim772-player-${k}`);
    if (el) el.value = d.player[k];
  });

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim772() {
  const overlay = document.getElementById('sim772-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim772(); return; }
  _renderAll();
}

function openSim772() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim772-overlay').classList.add('active');
}

function closeSim772() {
  document.getElementById('sim772-overlay')?.classList.remove('active');
}

export function setSim772Visible(visible) {
  const btn = document.getElementById('sim772-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim772();
}

// ── Init ─────────────────────────────────────────────────────────────────

export function initSim772() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim772-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim772.ui.title')}</span>
        <button id="sim772-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim772.ui.you')}</div>
            ${PLAYER_STAT_KEYS.map(([k, labelKey]) => _numField(t(labelKey), `sim772-player-${k}`)).join('')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim772.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim772.ui.pick')}</span>
              <select id="sim772-enemy-pick" class="inv-edit-input"></select>
            </div>
          </div>
          <div id="sim772-status" class="bsim-status"></div>
          <div class="inv-modal-ftr bsim-action-grid">
            <button id="sim772-atk-leg"        class="inv-add-btn bsim-action-primary">${t('battlesim772.btn.atk_leg')}</button>
            <button id="sim772-atk-hand"       class="inv-add-btn bsim-action-primary">${t('battlesim772.btn.atk_hand')}</button>
            <button id="sim772-atk-combined"   class="inv-add-btn bsim-action-primary">${t('battlesim772.btn.atk_combined')}</button>
            <button id="sim772-def-passive"    class="inv-add-btn">${t('battlesim772.btn.def_passive')}</button>
            <button id="sim772-def-aggressive" class="inv-add-btn">${t('battlesim772.btn.def_aggressive')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim772-reset" class="inv-add-btn">${t('battlesim772.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim772-history-summary">${t('battlesim772.history.summary', { n: 0 })}</summary>
            <div id="sim772-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim772-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim772-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim772);
  document.getElementById('sim772-close').addEventListener('click', closeSim772);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim772(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim772-overlay'),
    open:  openSim772,
    close: closeSim772,
  });

  document.getElementById('sim772-enemy-pick').addEventListener('change', e => _pickEnemy(e.target.value));
  document.getElementById('sim772-atk-leg').addEventListener('click', () => _runRound({ type: 'attack', move: 'leg' }));
  document.getElementById('sim772-atk-hand').addEventListener('click', () => _runRound({ type: 'attack', move: 'hand' }));
  document.getElementById('sim772-atk-combined').addEventListener('click', () => _runRound({ type: 'attack', move: 'combined' }));
  document.getElementById('sim772-def-passive').addEventListener('click', () => _runRound({ type: 'defend', move: 'passive' }));
  document.getElementById('sim772-def-aggressive').addEventListener('click', () => _runRound({ type: 'defend', move: 'aggressive' }));
  document.getElementById('sim772-reset').addEventListener('click', _resetBattle);

  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d) return;
      const id    = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const val   = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
      input.value = val;
      const key = id.replace('sim772-player-', '');
      if (Object.prototype.hasOwnProperty.call(d.player, key)) d.player[key] = val;
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
      const key = input.id.replace('sim772-player-', '');
      if (Object.prototype.hasOwnProperty.call(d.player, key)) d.player[key] = val;
      saveState();
      _renderStatus();
    });
  });
}

function _enemyOptions(selectedId) {

  return ROSTER.map(e => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('');
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

export { initSim772 as init, renderSim772 as render, setSim772Visible as setVisible };
