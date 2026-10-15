import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, SVG_SKULL, SVG_TROPHY, _appendLog, _checkBattleEnd, _data, _enemyList, _enemyName, _enemyNameSafe, _firstBloodLimit, _loadEnemyList, _numField, _playerAtaka, _playerZashtita, _ready, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _resetBattle, _roll, _runRound, _setVal, _setupAutocomplete, apiFetch, closeSim716, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim716, openSim716, registerPanelShortcut, renderSim716, saveState, setSim716Visible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _roll, _playerAtaka, _playerZashtita, _enemyName, _enemyNameSafe, _ready, _firstBloodLimit, _runRound, _checkBattleEnd, _resetBattle } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Арена 3, book 716)
// Episode 50's simplified attack/defense system, not every episode's bespoke formula.
// Resolve both sides within one round as a convenience; endurance-10 fights are non-lethal.
// The asymmetric final boss is outside this model.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// First-blood fights (initial enemy endurance 10) restore half the player's lost points after either outcome.

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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">А:${e.attack ?? '?'} З:${e.defense ?? '?'} ПБ:${e.pb ?? '?'} ИЗ:${e.hp ?? '?'}</span></li>`
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

// ── Render ───────────────────────────────────────────────────────────────────

function _setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

function _renderInputs(skipEnemyPick) {
  const d = _data();
  if (!d) return;
  _setVal('sim716-p-sila', d.player.sila);
  _setVal('sim716-p-barzina', d.player.barzina);
  _setVal('sim716-p-lovkost', d.player.lovkost);
  _setVal('sim716-p-reflekt', d.player.reflekt);
  _setVal('sim716-p-bm', d.player.bm);
  _setVal('sim716-p-izdr', d.player.izdr);
  _setVal('sim716-p-izdrmax', d.player.izdrMax);
  const atakaSel = document.getElementById('sim716-p-atakastat');
  if (atakaSel) atakaSel.value = d.player.atakaStat;
  document.getElementById('sim716-p-ataka').textContent = String(_playerAtaka(d));
  document.getElementById('sim716-p-zashtita').textContent = String(_playerZashtita(d));

  if (!skipEnemyPick) _setVal('sim716-enemy-pick', d.enemy.name);
  _setVal('sim716-enemy-ataka', d.enemy.ataka);
  _setVal('sim716-enemy-zashtita', d.enemy.zashtita);
  _setVal('sim716-enemy-bm', d.enemy.bm);
  _setVal('sim716-enemy-izdr', d.enemy.izdr);
  _setVal('sim716-enemy-izdrmax', d.enemy.izdrMax);
  const nlChk = document.getElementById('sim716-enemy-nonlethal');
  if (nlChk) nlChk.checked = !!d.enemy.nonlethal;

  const status = document.getElementById('sim716-status');
  if (d.battleOutcome === 'loss' || d.player.izdr <= 0) {
    status.textContent = t('battlesim716.status.fallen');
  } else if (d.battleOutcome === 'win' || d.enemy.izdr <= 0) {
    status.textContent = t('battlesim716.status.defeated', { enemy: _enemyName(d) });
  } else if (!_ready(d)) {
    status.textContent = t('battlesim716.status.not_ready');
  } else {
    status.textContent = '';
  }
  document.getElementById('sim716-round').disabled = !_ready(d) || d.player.izdr <= 0 || d.enemy.izdr <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim716-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim716-history-summary');
  const listEl = document.getElementById('sim716-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim716.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim716.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim716.history.won') : t('battlesim716.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim716() {
  const overlay = document.getElementById('sim716-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim716(); return; }
  _renderAll();
}

function openSim716() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim716-overlay').classList.add('active');
}

function closeSim716() {
  document.getElementById('sim716-overlay')?.classList.remove('active');
}

export function setSim716Visible(visible) {
  const btn = document.getElementById('sim716-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim716();
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initSim716() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim716-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim716.ui.title')}</span>
        <button id="sim716-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim716.ui.player')}</span></div>
            ${_numField(t('battlesim716.ui.sila'), 'sim716-p-sila')}
            ${_numField(t('battlesim716.ui.barzina'), 'sim716-p-barzina')}
            ${_numField(t('battlesim716.ui.lovkost'), 'sim716-p-lovkost')}
            ${_numField(t('battlesim716.ui.reflekt'), 'sim716-p-reflekt')}
            ${_numField(t('battlesim716.ui.bm'), 'sim716-p-bm')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim716.ui.ataka_stat')}</span>
              <select id="sim716-p-atakastat" class="bsim-select">
                <option value="barzina">${t('battlesim716.ui.ataka_stat_barzina')}</option>
                <option value="lovkost">${t('battlesim716.ui.ataka_stat_lovkost')}</option>
              </select>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim716.ui.ataka')}</span>
              <span id="sim716-p-ataka"></span>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim716.ui.zashtita')}</span>
              <span id="sim716-p-zashtita"></span>
            </div>
            ${_numField(t('battlesim716.ui.izdr'), 'sim716-p-izdr')}
            ${_numField(t('battlesim716.ui.izdrmax'), 'sim716-p-izdrmax')}
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim716.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim716-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim716-enemy-pick-dropdown">
                <ul id="sim716-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim716.ui.enemy_ataka'), 'sim716-enemy-ataka')}
            ${_numField(t('battlesim716.ui.enemy_zashtita'), 'sim716-enemy-zashtita')}
            ${_numField(t('battlesim716.ui.enemy_bm'), 'sim716-enemy-bm')}
            ${_numField(t('battlesim716.ui.enemy_izdr'), 'sim716-enemy-izdr')}
            ${_numField(t('battlesim716.ui.enemy_izdrmax'), 'sim716-enemy-izdrmax')}
            <div class="inv-edit-row">
              <label class="inv-edit-label bsim-stat-label"><input type="checkbox" id="sim716-enemy-nonlethal"> ${t('battlesim716.ui.nonlethal')}</label>
            </div>
          </div>
          <div id="sim716-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim716-round" class="inv-add-btn bsim-action-primary">${t('battlesim716.btn.round')}</button>
            <button id="sim716-reset" class="inv-add-btn">${t('battlesim716.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim716-history-summary">${t('battlesim716.history.summary', { n: 0 })}</summary>
            <div id="sim716-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim716-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim716-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim716);
  document.getElementById('sim716-close').addEventListener('click', closeSim716);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim716(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim716-overlay'),
    open:  openSim716,
    close: closeSim716,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim716();
  });

  document.getElementById('sim716-round').addEventListener('click', _runRound);
  document.getElementById('sim716-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim716-p-atakastat').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.atakaStat = e.target.value === 'lovkost' ? 'lovkost' : 'barzina';
    saveState();
    _renderInputs(true);
  });

  document.getElementById('sim716-enemy-nonlethal').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.enemy.nonlethal = e.target.checked;
    saveState();
  });

  document.getElementById('sim716-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim716-enemy-pick', 'sim716-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name       = enemy.name;
    d.enemy.ataka      = enemy.attack ?? 0;
    d.enemy.zashtita   = enemy.defense ?? 0;
    d.enemy.bm         = enemy.pb ?? 1;
    d.enemy.izdr       = enemy.hp ?? 10;
    d.enemy.izdrMax    = enemy.hp ?? 10;
    d.enemy.nonlethal  = (enemy.hp ?? 10) <= 10;
    if (enemy.name === 'Бързака') {
      d.enemy.ataka = Math.max(0, d.enemy.ataka - d.player.barzina);
      d.enemy.zashtita = Math.max(0, d.enemy.zashtita - d.player.reflekt);
    }
    d.roundsThisBattle = 0;
    d.combatRulesVersion = 2;
    d.battleOutcome = null;
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim716-p-sila': ['player', 'sila'], 'sim716-p-barzina': ['player', 'barzina'],
    'sim716-p-lovkost': ['player', 'lovkost'], 'sim716-p-reflekt': ['player', 'reflekt'],
    'sim716-p-bm': ['player', 'bm'], 'sim716-p-izdr': ['player', 'izdr'], 'sim716-p-izdrmax': ['player', 'izdrMax'],
    'sim716-enemy-ataka': ['enemy', 'ataka'], 'sim716-enemy-zashtita': ['enemy', 'zashtita'],
    'sim716-enemy-bm': ['enemy', 'bm'], 'sim716-enemy-izdr': ['enemy', 'izdr'], 'sim716-enemy-izdrmax': ['enemy', 'izdrMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = Math.max(0, parseInt(input.value, 10) || 0);
      d[path[0]][path[1]] = val;
      saveState();
      _renderInputs(true);
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

function _numField(label, id, width, readonly) {

  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <div class="inv-qty-wrap">
        ${readonly ? '' : `<button class="inv-qty-btn" data-id="${id}" data-delta="-1">−</button>`}
        <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric"${readonly ? ' readonly' : ''}${width ? ` style="width:${width}"` : ''}>
        ${readonly ? '' : `<button class="inv-qty-btn" data-id="${id}" data-delta="1">+</button>`}
      </div>
    </div>`;
}

export { initSim716 as init, renderSim716 as render, setSim716Visible as setVisible };
