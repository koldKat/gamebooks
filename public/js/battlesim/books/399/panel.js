import { MODES, ENEMY_MODE, ENEMY_STATS, ENEMY_STOP_RULES } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, ENEMY_MODE, ENEMY_STATS, ENEMY_STOP_RULES, MODES, SVG_SKULL, SVG_TROPHY, _appendLog, _applyCritCheck, _applyEnemy, _applyEnemyDefeat, _applyPlayerFall, _attack, _attackSum, _battleOver, _belowStopRule, _captureStopRule, _data, _defenceSum, _emptySide, _enemyDefeated, _enemyList, _enemyName, _enemyNameSafe, _loadEnemyList, _modeSelect, _numField, _orderVal, _playerDefeated, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _renderSide, _resetBattle, _roll1d6, _setVal, _setupAutocomplete, _sideFields, _strike, apiFetch, closeSim399, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim399, openSim399, registerPanelShortcut, renderSim399, saveState, setSim399Visible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _battleOver, _recordOutcome } = createState(simulatorContext);
const { _captureStopRule, _applyEnemy, _emptySide, _roll1d6, _enemyName, _enemyNameSafe, _orderVal, _attackSum, _defenceSum, _applyCritCheck, _belowStopRule, _playerDefeated, _enemyDefeated, _applyEnemyDefeat, _applyPlayerFall, _strike, _attack, _resetBattle, _sideFields } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Роди се сянка, book 399, Хроники на Орм)
// Five combat modes can differ between player and enemy.
// Damage uses the attacker's mode formula for both sides, not the defender's own mode.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Autocomplete sets the enemy's combat mode without changing the player's independently chosen mode.

// ── Combat math ──────────────────────────────────────────────────────────

// Defence uses the ATTACKER's mode formula, applied to the DEFENDER's own stats.

// ── Enemy autocomplete (fed by book_enemies, seeded per book_id) ───────────

let _enemyList = null;
async function _loadEnemyList() {
  if (_enemyList) return _enemyList;
  try {
    const res = await apiFetch(`/api/books/${currentBookId}/enemies`);
    _enemyList = res.ok ? await res.json() : [];
  } catch (_) {
    _enemyList = [];
  }
  return _enemyList;
}

function _setupAutocomplete(inputId, dropdownId, onSelect) {
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  let matches   = [];
  let activeIdx = -1;

  function closeDropdown() {
    dropdown.classList.remove('open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function render(q) {
    const list = _enemyList || [];
    const ql = q.trim().toLowerCase();
    matches = ql ? list.filter(e => e.name.toLowerCase().includes(ql)) : list;
    if (!matches.length) { closeDropdown(); return; }
    dropdown.innerHTML = matches.map((e, i) =>
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim399.ui.endurance')}:${e.hp ?? '?'}</span></li>`
    ).join('');
    activeIdx = -1;
    dropdown.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
  }

  function select(enemy) {
    if (!enemy) return;
    input.value = enemy.name;
    onSelect(enemy);
    closeDropdown();
  }

  dropdown.addEventListener('mousedown', e => {
    const li = e.target.closest('li');
    if (!li) return;
    select(matches[+li.dataset.idx]);
    e.preventDefault();
  });

  input.addEventListener('focus', async () => { input.removeAttribute('readonly'); await _loadEnemyList(); render(input.value); });
  input.addEventListener('input', async () => { await _loadEnemyList(); render(input.value); });
  input.addEventListener('blur', () => setTimeout(closeDropdown, 150));
  input.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('li');
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); select(matches[activeIdx]); return; }
    else if (e.key === 'Escape') { closeDropdown(); return; }
    else return;
    items.forEach((li, i) => { li.classList.toggle('ac-active', i === activeIdx); li.setAttribute('aria-selected', String(i === activeIdx)); });
    if (activeIdx >= 0) input.setAttribute('aria-activedescendant', items[activeIdx].id);
    else input.removeAttribute('aria-activedescendant');
    items[activeIdx]?.scrollIntoView({ block: 'nearest' });
  });
}

// ── Render ───────────────────────────────────────────────────────────────

function _setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

function _renderSide(prefix, side, skipNamePick) {
  _setVal(`${prefix}-mode`, side.mode);
  _setVal(`${prefix}-speed`, side.speed);
  _setVal(`${prefix}-str`, side.str);
  _setVal(`${prefix}-acc`, side.acc);
  _setVal(`${prefix}-reflex`, side.reflex);
  _setVal(`${prefix}-resil`, side.resil);
  _setVal(`${prefix}-skill`, side.skill);
  _setVal(`${prefix}-power`, side.power);
  _setVal(`${prefix}-eqspeed`, side.eqspeed);
  _setVal(`${prefix}-weapon`, side.weapon);
  _setVal(`${prefix}-maneuver`, side.maneuver);
  _setVal(`${prefix}-endurance`, side.endurance);
  _setVal(`${prefix}-endurancemax`, side.enduranceInitial);
  _setVal(`${prefix}-endurancecrit`, side.enduranceCritical);
  if (!skipNamePick && prefix === 'sim399-enemy') _setVal('sim399-enemy-pick', side.name || '');
}

function _renderInputs(skipEnemyPick) {
  const d = _data();
  if (!d) return;
  _renderSide('sim399-player', d.player, true);
  _renderSide('sim399-enemy', d.enemy, skipEnemyPick);

  const over = _battleOver(d);
  document.getElementById('sim399-attack').disabled = over;

  const status = document.getElementById('sim399-status');
  if (_playerDefeated(d)) status.innerHTML = t(d.player.endurance > 0 ? 'battlesim399.status.stopped_loss' : 'battlesim399.status.fallen', { skull: SVG_SKULL, n: d.stopBelowEndurance });
  else if (_enemyDefeated(d)) status.innerHTML = t('battlesim399.status.victory', { trophy: SVG_TROPHY });
  else status.innerHTML = '';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim399-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim399-history-summary');
  const listEl = document.getElementById('sim399-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim399.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim399.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim399.history.won') : t('battlesim399.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim399.ui.endurance')} ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim399() {
  const overlay = document.getElementById('sim399-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim399(); return; }
  _renderAll();
}

function openSim399() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim399-overlay').classList.add('active');
}

function closeSim399() {
  document.getElementById('sim399-overlay')?.classList.remove('active');
}

export function setSim399Visible(visible) {
  const btn = document.getElementById('sim399-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim399();
}

// ── Init ──────────────────────────────────────────────────────────────────

export function initSim399() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim399-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim399.ui.title')}</span>
        <button id="sim399-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim399.ui.you')}</div>
            ${_sideFields('sim399-player')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim399.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim399.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim399-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim399-enemy-pick-dropdown">
                <ul id="sim399-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_sideFields('sim399-enemy')}
          </div>
          <div id="sim399-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim399-attack" class="inv-add-btn bsim-action-primary">${t('battlesim399.btn.attack')}</button>
            <button id="sim399-reset" class="inv-add-btn">${t('battlesim399.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim399-history-summary">${t('battlesim399.history.summary', { n: 0 })}</summary>
            <div id="sim399-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim399-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim399-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim399);
  document.getElementById('sim399-close').addEventListener('click', closeSim399);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim399(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim399-overlay'),
    open:  openSim399,
    close: closeSim399,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim399();
  });

  document.getElementById('sim399-attack').addEventListener('click', _attack);
  document.getElementById('sim399-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim399-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim399-enemy-pick', 'sim399-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    _applyEnemy(d, enemy);
    saveState();
    _renderAll();
  });

  const fieldMap = {};
  for (const prefix of ['sim399-player', 'sim399-enemy']) {
    const side = prefix === 'sim399-player' ? 'player' : 'enemy';
    fieldMap[`${prefix}-speed`] = [side, 'speed'];
    fieldMap[`${prefix}-str`] = [side, 'str'];
    fieldMap[`${prefix}-acc`] = [side, 'acc'];
    fieldMap[`${prefix}-reflex`] = [side, 'reflex'];
    fieldMap[`${prefix}-resil`] = [side, 'resil'];
    fieldMap[`${prefix}-skill`] = [side, 'skill'];
    fieldMap[`${prefix}-power`] = [side, 'power'];
    fieldMap[`${prefix}-eqspeed`] = [side, 'eqspeed'];
    fieldMap[`${prefix}-weapon`] = [side, 'weapon'];
    fieldMap[`${prefix}-maneuver`] = [side, 'maneuver'];
    fieldMap[`${prefix}-endurance`] = [side, 'endurance'];
    fieldMap[`${prefix}-endurancemax`] = [side, 'enduranceInitial'];
    fieldMap[`${prefix}-endurancecrit`] = [side, 'enduranceCritical'];
  }
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = parseInt(input.value, 10) || 0;
      d[path[0]][path[1]] = Math.max(0, val);
      saveState();
      _renderInputs(true);
    });
  }
  for (const prefix of ['sim399-player', 'sim399-enemy']) {
    const side = prefix === 'sim399-player' ? 'player' : 'enemy';
    document.getElementById(`${prefix}-mode`).addEventListener('change', e => {
      const d = _data();
      if (!d) return;
      d[side].mode = e.target.value;
      saveState();
    });
  }
  overlay.querySelectorAll('.inv-qty-btn').forEach(btn2 => {
    btn2.addEventListener('click', () => {
      const input = document.getElementById(btn2.dataset.id);
      if (!input) return;
      const delta = parseInt(btn2.dataset.delta, 10);
      input.value = (parseInt(input.value, 10) || 0) + delta;
      input.dispatchEvent(new Event('change'));
    });
  });
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

function _modeSelect(prefix) {

  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${t('battlesim399.ui.mode')}</span>
      <select id="${prefix}-mode" class="inv-edit-input">
        <option value="unarmed">${t('battlesim399.ui.mode_unarmed')}</option>
        <option value="melee">${t('battlesim399.ui.mode_melee')}</option>
        <option value="gunfight">${t('battlesim399.ui.mode_gunfight')}</option>
        <option value="cyber">${t('battlesim399.ui.mode_cyber')}</option>
        <option value="vehicle">${t('battlesim399.ui.mode_vehicle')}</option>
      </select>
    </div>`;
}

export { initSim399 as init, renderSim399 as render, setSim399Visible as setVisible };
