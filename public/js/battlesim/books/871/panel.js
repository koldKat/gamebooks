import { ROSTER } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, ROSTER, SVG_SKULL, SVG_TROPHY, _appendLog, _battleOver, _checkEnd, _d2, _d6, _data, _enemyDead, _enemyName, _enemyOptionsHtml, _numField, _pickEnemy, _playerDead, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _renderStatus, _rival, _rivalNameById, _round, _startBattle, closeSim871, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim871, openSim871, registerPanelShortcut, renderSim871, resumeRinglasFight, ringlasRound, saveState, setSim871Visible, shortcutLabel, showAlert, startRinglasFight, t });
const { _data, _appendLog, _battleOver, _recordOutcome } = createState(simulatorContext);
const { _rival, _rivalNameById, _d6, _d2, _enemyName, _playerDead, _enemyDead, _checkEnd, _round, _startBattle, _pickEnemy } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Сага за Ринглас, book 871)
// Player 2d6 > enemy target hits; enemy 2d6 < player target (6) hits; each costs 1 stamina.
// Multi-enemy bonuses persist after the encounter; horse attacks resolve separately.

import { currentPlaythrough, saveState } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { startRinglasFight as startFight, resumeRinglasFight as resumeFight, ringlasRound as playRound } from "../.././engines/ringlas-saga.js";

// Resolve current database rules without rewriting existing saved fights.
const startRinglasFight = (data, setup) => startFight(data, setup, _rival(data.enemyId), _rival('armoredknight').companion);
const resumeRinglasFight = data => resumeFight(data, _rival(data.enemyId));
const ringlasRound = (data, roll) => playRound(data, roll, _rival(data.enemyId));

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// ── Render ───────────────────────────────────────────────────────────────

function _renderStatus() {
  const d = _data();
  const el = document.getElementById('sim871-status');
  if (!d || !el) return;
  if (d.over) {
    if (d.winner === 'player') el.innerHTML = t('battlesim871.status.victory', { trophy: SVG_TROPHY });
    else el.innerHTML = t('battlesim871.status.fallen', { skull: SVG_SKULL });
  } else {
    el.textContent = d.rulesVersion === 1 && d.pausedSection ? t('battlesim871.status.paused', { section: d.pausedSection }) : '';
  }
  document.getElementById('sim871-round').disabled = d.over || !d.started || d.rulesVersion === 1 && !!d.pausedSection;
  document.getElementById('sim871-start').disabled = _playerDead(d);
  document.getElementById('sim871-resume').hidden = !(d.rulesVersion === 1 && _rival(d.enemyId).pause?.resumable && d.pausedSection === _rival(d.enemyId).pause.section && !_playerDead(d));
}

function _renderInputs() {
  const d = _data();
  if (!d) return;
  document.getElementById('sim871-enemy-pick').innerHTML = _enemyOptionsHtml(d.enemyId);
  document.getElementById('sim871-player-stamina').value = d.playerStamina;
  document.getElementById('sim871-player-target').value = d.playerTarget;
  document.getElementById('sim871-player-bonus').value = d.playerBonus;
  document.getElementById('sim871-enemy-target').value = d.enemyTarget;
  document.getElementById('sim871-enemy-stamina').value = d.enemyStamina;
  document.getElementById('sim871-enemy-penalty').value = d.enemyPenalty;
  document.getElementById('sim871-multi-cb').checked = !!d.multi;
  document.getElementById('sim871-companion-settings').hidden = !_rival(d.enemyId).companion;
  document.getElementById('sim871-ally-cb').checked = !!d.allyEnabled;
  document.getElementById('sim871-ally-stamina').value = d.allyStamina ?? _rival('armoredknight').companion.stamina;
  document.getElementById('sim871-ally-target').value = d.allyTarget ?? _rival('armoredknight').companion.target;
  document.getElementById('sim871-drunk-cb').checked = !!d.drunk;
  document.getElementById('sim871-simaut-settings').hidden = !_rival(d.enemyId).playerBonus;
  document.getElementById('sim871-simaut-cb').checked = d.simautBonus !== false;
  _renderStatus();
}

function _renderHistory() {
  const d = _data();
  const sumEl = document.getElementById('sim871-history-summary');
  const listEl = document.getElementById('sim871-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim871.history.summary', { n: d.history.length });
  if (!d.history.length) { listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim871.history.empty')}</div>`; return; }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim871.history.won') : t('battlesim871.history.lost');
    const date = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const enemyName = _rivalNameById(h.enemyId);
    return `<div class="bsim-history-row"><span>${icon} ${t('battlesim871.history.you')} ${t('battlesim871.history.vs')} ${escapeHtml(enemyName)} - ${result}</span><span class="bsim-history-meta">${date}</span></div>`;
  }).join('');
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim871-log');
  if (!el || !d) return;
  el.innerHTML = d.log.filter(Boolean).slice().reverse().join('<br>');
}

function _renderAll() { _renderInputs(); _renderLog(); _renderHistory(); }

export function renderSim871() {
  const overlay = document.getElementById('sim871-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim871(); return; }
  _renderAll();
}

function openSim871() {
  if (!_data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  _renderAll();
  document.getElementById('sim871-overlay').classList.add('active');
}

function closeSim871() { document.getElementById('sim871-overlay')?.classList.remove('active'); }

export function setSim871Visible(visible) {
  const btn = document.getElementById('sim871-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim871();
}

// ── Init ─────────────────────────────────────────────────────────────────

export function initSim871() {
  const overlay = document.createElement('div');
  overlay.id = 'sim871-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim871.ui.title')}</span>
        <button id="sim871-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim871.ui.you')}</div>
            ${_numField(t('battlesim871.ui.stamina'), 'sim871-player-stamina')}
            ${_numField(t('battlesim871.ui.target'), 'sim871-player-target')}
            ${_numField(t('battlesim871.ui.bonus'), 'sim871-player-bonus')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim871.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim871.ui.pick')}</span>
              <select id="sim871-enemy-pick" class="inv-edit-input"></select>
            </div>
            ${_numField(t('battlesim871.ui.target'), 'sim871-enemy-target')}
            ${_numField(t('battlesim871.ui.stamina'), 'sim871-enemy-stamina')}
            ${_numField(t('battlesim871.ui.penalty'), 'sim871-enemy-penalty')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim871.ui.multi')}</span>
              <input id="sim871-multi-cb" type="checkbox">
            </div>
          </div>
          <div id="sim871-companion-settings" class="bsim-side" hidden>
            <div class="bsim-side-title">${t('battlesim871.ui.next_fight')}</div>
            <label class="inv-edit-row"><span class="inv-edit-label">${t('battlesim871.ui.ally')}</span><input id="sim871-ally-cb" type="checkbox"></label>
            ${_numField(t('battlesim871.ui.ally_stamina'), 'sim871-ally-stamina')}
            ${_numField(t('battlesim871.ui.ally_target'), 'sim871-ally-target')}
            <label class="inv-edit-row"><span class="inv-edit-label">${t('battlesim871.ui.drunk')}</span><input id="sim871-drunk-cb" type="checkbox"></label>
          </div>
          <div id="sim871-simaut-settings" class="bsim-side" hidden>
            <label class="inv-edit-row"><span class="inv-edit-label">${t('battlesim871.ui.simaut_bonus')}</span><input id="sim871-simaut-cb" type="checkbox"></label>
          </div>
          <div id="sim871-status" class="bsim-status"></div>
          <div class="inv-modal-ftr bsim-action-grid">
            <button id="sim871-round" class="inv-add-btn bsim-action-primary">${t('battlesim871.btn.round')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim871-start" class="inv-add-btn">${t('battlesim871.btn.start')}</button>
            <button id="sim871-resume" class="inv-add-btn" hidden>${t('battlesim871.btn.resume')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim871-history-summary">${t('battlesim871.history.summary', { n: 0 })}</summary>
            <div id="sim871-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim871-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id = 'sim871-btn';
  btn.innerHTML = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim871);
  document.getElementById('sim871-close').addEventListener('click', closeSim871);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim871(); });
  registerPanelShortcut('KeyS', {
    getButton: () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim871-overlay'),
    open: openSim871,
    close: closeSim871,
  });

  document.getElementById('sim871-enemy-pick').addEventListener('change', e => _pickEnemy(e.target.value));
  document.getElementById('sim871-start').addEventListener('click', _startBattle);
  document.getElementById('sim871-round').addEventListener('click', _round);
  document.getElementById('sim871-resume').addEventListener('click', () => {
    const d = _data();
    if (d && resumeRinglasFight(d)) { saveState(); _renderAll(); }
  });
  const rememberSetup = d => { d.enemySetup = { target: d.enemyTarget, stamina: d.enemyStamina, multi: d.multi }; };
  document.getElementById('sim871-multi-cb').addEventListener('change', e => { const d = _data(); if (d) { d.multi = !!e.target.checked; rememberSetup(d); saveState(); } });
  for (const [id, key] of [['sim871-ally-cb', 'allyEnabled'], ['sim871-drunk-cb', 'drunk'], ['sim871-simaut-cb', 'simautBonus']]) {
    document.getElementById(id).addEventListener('change', e => { const d = _data(); if (d) { d[key] = e.target.checked; saveState(); } });
  }

  const fieldMap = {
    'sim871-player-stamina': (d, v) => { d.playerStamina = v; },
    'sim871-player-target': (d, v) => { d.playerTarget = v; },
    'sim871-player-bonus': (d, v) => { d.playerBonus = v; },
    'sim871-enemy-target': (d, v) => { d.enemyTarget = v; rememberSetup(d); },
    'sim871-enemy-stamina': (d, v) => { d.enemyStamina = v; rememberSetup(d); },
    'sim871-enemy-penalty': (d, v) => { d.enemyPenalty = v; },
    'sim871-ally-stamina': (d, v) => { d.allyStamina = v; },
    'sim871-ally-target': (d, v) => { d.allyTarget = v; },
  };

  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d) return;
      const id = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const val = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
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
      const val = Math.max(0, parseInt(input.value, 10) || 0);
      input.value = val;
      if (fieldMap[input.id]) fieldMap[input.id](d, val);
      saveState();
      _renderStatus();
    });
  });
}

function _enemyOptionsHtml(selectedId) {

  return ROSTER.map(r => `<option value="${r.id}" ${r.id === selectedId ? 'selected' : ''}>${escapeHtml(t(r.nameKey))}</option>`).join('');
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

export { initSim871 as init, renderSim871 as render, setSim871Visible as setVisible };
