import { WEAPONS, ROSTER } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, ROSTER, SVG_SKULL, SVG_TROPHY, WEAPONS, _appendLog, _attack, _battleOver, _data, _defaultAmmo, _defend, _enemy, _enemyName, _enemyOptions, _enemyStrike, _finishRound, _numField, _pickEnemy, _playerLost, _playerWon, _printedRound, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _renderStatus, _resetBattle, _roll1d6, _weapon, closeSim781, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim781, mutatedFleshRound, mutatedFleshWon, openSim781, registerPanelShortcut, renderSim781, saveState, setSim781Visible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _battleOver, _recordOutcome } = createState(simulatorContext);
const { _weapon, _enemy, _defaultAmmo, _roll1d6, _enemyName, _playerWon, _playerLost, _enemyStrike, _attack, _defend, _printedRound, _finishRound, _resetBattle, _pickEnemy } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Мутирала плът, book 781)
// Enter current journal stats; resolve the selected encounter's attack/defense rules.
// No fixed starting build is assumed.

import { currentPlaythrough, saveState } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { mutatedFleshRound, mutatedFleshWon } from "../.././engines/mutated-flesh.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;
























// ── Combat ───────────────────────────────────────────────────────────────















// ── Render ───────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim781-status');
  if (!d || !el) return;
  if (_playerLost(d))      el.innerHTML = t('battlesim781.status.fallen', { skull: SVG_SKULL });
  else if (_playerWon(d))  el.innerHTML = t('battlesim781.status.victory', { trophy: SVG_TROPHY });
  else                     el.innerHTML = '';
  const over = _battleOver(d);
  const selected = _weapon(d.weaponId);
  document.getElementById('sim781-defend').disabled = over || (d.rulesVersion === 1 && selected.ammoMax != null && d.ammo[selected.id] <= 0);
  WEAPONS.forEach(w => {
    const btn = document.getElementById(`sim781-atk-${w.id}`);
    if (!btn) return;
    const outOfAmmo = w.ammoMax != null && d.ammo[w.id] <= 0;
    btn.disabled = over || outOfAmmo;
    btn.textContent = w.ammoMax != null
      ? t('battlesim781.btn.attack_ammo', { weapon: w.name, ammo: d.ammo[w.id] })
      : t('battlesim781.btn.attack', { weapon: w.name });
  });
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim781-history-summary');
  const listEl = document.getElementById('sim781-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim781.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim781.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim781.history.won') : t('battlesim781.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${t('battlesim781.history.you')} ${t('battlesim781.history.vs')} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim781-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}



function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim781-enemy-pick').innerHTML = _enemyOptions(d.enemyId);

  document.getElementById('sim781-player-life').value      = d.player.life;
  document.getElementById('sim781-player-physique').value  = d.player.physique;
  document.getElementById('sim781-player-shooting').value  = d.player.shooting;

  document.getElementById('sim781-enemy-dmg').value  = d.enemy.dmg;
  document.getElementById('sim781-enemy-life').value = d.enemy.life;
  document.getElementById('sim781-weapon-pick').value = d.weaponId;
  document.getElementById('sim781-ammo-pistol').value = d.ammo.pistol;
  document.getElementById('sim781-ammo-shotgun').value = d.ammo.shotgun;
  for (const key of ['averageDamage','riotArmour','section99Weapons','section20Pistol','openingFreeHit']) {
    const input = document.getElementById(`sim781-${key}`);
    input.checked = !!d[key];
    input.disabled = d.rulesVersion !== 1 || (key === 'openingFreeHit' && d.started);
  }

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim781() {
  const overlay = document.getElementById('sim781-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim781(); return; }
  _renderAll();
}

function openSim781() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim781-overlay').classList.add('active');
}

function closeSim781() {
  document.getElementById('sim781-overlay')?.classList.remove('active');
}

export function setSim781Visible(visible) {
  const btn = document.getElementById('sim781-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim781();
}

// ── Init ─────────────────────────────────────────────────────────────────



export function initSim781() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim781-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim781.ui.title')}</span>
        <button id="sim781-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim781.ui.you')}</div>
            ${_numField(t('battlesim781.ui.life'), 'sim781-player-life')}
            ${_numField(t('battlesim781.ui.physique'), 'sim781-player-physique')}
            ${_numField(t('battlesim781.ui.shooting'), 'sim781-player-shooting')}
            ${_numField(t('battlesim781.ui.pistol_ammo'), 'sim781-ammo-pistol')}
            ${_numField(t('battlesim781.ui.shotgun_ammo'), 'sim781-ammo-shotgun')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim781.ui.defensive_weapon')}</span>
              <select id="sim781-weapon-pick" class="inv-edit-input">${WEAPONS.map(w => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('')}</select>
            </div>
            ${['averageDamage','riotArmour','section99Weapons','section20Pistol','openingFreeHit'].map(key => `<label class="inv-edit-row"><span class="inv-edit-label">${t(`battlesim781.ui.${key}`)}</span><input type="checkbox" id="sim781-${key}"></label>`).join('')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim781.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim781.ui.pick')}</span>
              <select id="sim781-enemy-pick" class="inv-edit-input"></select>
            </div>
            ${_numField(t('battlesim781.ui.dmg'), 'sim781-enemy-dmg')}
            ${_numField(t('battlesim781.ui.life'), 'sim781-enemy-life')}
          </div>
          <div id="sim781-status" class="bsim-status"></div>
          <div class="inv-modal-ftr bsim-action-grid">
            ${WEAPONS.map(w => `<button id="sim781-atk-${w.id}" class="inv-add-btn bsim-action-primary">${t('battlesim781.btn.attack', { weapon: w.name })}</button>`).join('')}
            <button id="sim781-defend" class="inv-add-btn">${t('battlesim781.btn.defend')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim781-reset" class="inv-add-btn">${t('battlesim781.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim781-history-summary">${t('battlesim781.history.summary', { n: 0 })}</summary>
            <div id="sim781-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim781-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim781-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim781);
  document.getElementById('sim781-close').addEventListener('click', closeSim781);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim781(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim781-overlay'),
    open:  openSim781,
    close: closeSim781,
  });

  document.getElementById('sim781-enemy-pick').addEventListener('change', e => _pickEnemy(e.target.value));
  WEAPONS.forEach(w => {
    document.getElementById(`sim781-atk-${w.id}`).addEventListener('click', () => _attack(w.id));
  });
  document.getElementById('sim781-defend').addEventListener('click', _defend);
  document.getElementById('sim781-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim781-weapon-pick').addEventListener('change', e => {
    const d = _data(); if (!d) return;
    d.weaponId = e.target.value; saveState(); _renderStatus();
  });
  for (const key of ['averageDamage','riotArmour','section99Weapons','section20Pistol','openingFreeHit']) {
    document.getElementById(`sim781-${key}`).addEventListener('change', e => {
      const d = _data(); if (!d || d.rulesVersion !== 1) return;
      d[key] = e.target.checked; saveState();
    });
  }

  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d) return;
      const id    = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const val   = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
      input.value = val;
      if (id === 'sim781-player-life')     d.player.life = val;
      else if (id === 'sim781-player-physique') d.player.physique = val;
      else if (id === 'sim781-player-shooting') d.player.shooting = val;
      else if (id === 'sim781-enemy-dmg')       d.enemy.dmg = val;
      else if (id === 'sim781-enemy-life')      d.enemy.life = val;
      else if (id === 'sim781-ammo-pistol') d.ammo.pistol = val;
      else if (id === 'sim781-ammo-shotgun') d.ammo.shotgun = val;
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
      if (id === 'sim781-player-life')     d.player.life = val;
      else if (id === 'sim781-player-physique') d.player.physique = val;
      else if (id === 'sim781-player-shooting') d.player.shooting = val;
      else if (id === 'sim781-enemy-dmg')       d.enemy.dmg = val;
      else if (id === 'sim781-enemy-life')      d.enemy.life = val;
      else if (id === 'sim781-ammo-pistol') d.ammo.pistol = val;
      else if (id === 'sim781-ammo-shotgun') d.ammo.shotgun = val;
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

export { initSim781 as init, renderSim781 as render, setSim781Visible as setVisible };
