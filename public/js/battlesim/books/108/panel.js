import { WEAPON_TIER, COMBAT_TABLE } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, COMBAT_TABLE, SVG_SKULL, SVG_TROPHY, WEAPON_TIER, _appendLog, _chanceRow, _checkBattleEnd, _data, _effectiveSkill, _enemyList, _enemyName, _enemyNameSafe, _levelCol, _loadEnemyList, _numField, _pick10, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _resetBattle, _runRound, _setVal, _setupAutocomplete, apiFetch, closeSim108, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim108, openSim108, registerPanelShortcut, renderSim108, saveState, setSim108Visible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _levelCol, _chanceRow, _pick10, _enemyName, _enemyNameSafe, _effectiveSkill, _runRound, _checkBattleEnd, _resetBattle } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Ледените пирати / The Ice Pirates, book 108)
// Skill difference selects one of seven columns; a 1-10 pick selects one of three rows.
// Table entries apply losses to both sides, including instant death.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Ниво на атака columns: +5/+6, +3/+4, +1/+2, 0, -1/-2, -3/-4, -5/-6
// Шанс rows: 1-3, 4-8, 9-10. Cell = [playerLoss, enemyLoss] ('dead' sentinel).

 // random-number table, 1-10

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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${e.attack ?? '?'}/${e.hp ?? '?'}</span></li>`
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
  _setVal('sim108-skill-rk', d.skills.rk);
  _setVal('sim108-skill-kinj', d.skills.kinj);
  _setVal('sim108-skill-mech', d.skills.mech);
  _setVal('sim108-life', d.life);
  _setVal('sim108-lifemax', d.lifeInitial);
  _setVal('sim108-enemy-skill', d.enemy.skill);
  _setVal('sim108-enemy-life', d.enemy.life);
  _setVal('sim108-enemy-lifemax', d.enemy.lifeMax);
  const weaponSel = document.getElementById('sim108-weapon');
  if (weaponSel) weaponSel.value = d.weapon;
  if (!skipEnemyPick) _setVal('sim108-enemy-pick', d.enemy.name);

  const status = document.getElementById('sim108-status');
  if (d.life <= 0) {
    status.textContent = t('battlesim108.status.fallen');
  } else if (d.enemy.life <= 0 && d.enemy.lifeMax > 0) {
    status.textContent = t('battlesim108.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim108-round').disabled = d.life <= 0 || d.enemy.life <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim108-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim108-history-summary');
  const listEl = document.getElementById('sim108-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim108.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim108.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim108.history.won') : t('battlesim108.history.lost');
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

export function renderSim108() {
  const overlay = document.getElementById('sim108-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim108(); return; }
  _renderAll();
}

function openSim108() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim108-overlay').classList.add('active');
}

function closeSim108() {
  document.getElementById('sim108-overlay')?.classList.remove('active');
}

export function setSim108Visible(visible) {
  const btn = document.getElementById('sim108-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim108();
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initSim108() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim108-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim108.ui.title')}</span>
        <button id="sim108-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            ${_numField(t('battlesim108.ui.skill_rk'), 'sim108-skill-rk')}
            ${_numField(t('battlesim108.ui.skill_kinj'), 'sim108-skill-kinj')}
            ${_numField(t('battlesim108.ui.skill_mech'), 'sim108-skill-mech')}
            ${_numField(t('battlesim108.ui.life'), 'sim108-life')}
            ${_numField(t('battlesim108.ui.life_initial'), 'sim108-lifemax')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim108.ui.weapon')}</span>
              <select id="sim108-weapon" class="inv-edit-input">
                <option value="rk">${t('battlesim108.ui.weapon_rk')}</option>
                <option value="kinj">${t('battlesim108.ui.weapon_kinj')}</option>
                <option value="mech">${t('battlesim108.ui.weapon_mech')}</option>
              </select>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim108.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim108-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim108-enemy-pick-dropdown">
                <ul id="sim108-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim108.ui.enemy_skill'), 'sim108-enemy-skill')}
            ${_numField(t('battlesim108.ui.enemy_life'), 'sim108-enemy-life')}
            ${_numField(t('battlesim108.ui.enemy_life_max'), 'sim108-enemy-lifemax')}
          </div>
          <div id="sim108-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim108-round" class="inv-add-btn bsim-action-primary">${t('battlesim108.btn.round')}</button>
            <button id="sim108-reset" class="inv-add-btn">${t('battlesim108.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim108-history-summary">${t('battlesim108.history.summary', { n: 0 })}</summary>
            <div id="sim108-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim108-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim108-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim108);
  document.getElementById('sim108-close').addEventListener('click', closeSim108);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim108(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim108-overlay'),
    open:  openSim108,
    close: closeSim108,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim108();
  });

  document.getElementById('sim108-round').addEventListener('click', _runRound);
  document.getElementById('sim108-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim108-weapon').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.weapon = e.target.value;
    saveState();
  });

  document.getElementById('sim108-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim108-enemy-pick', 'sim108-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name          = enemy.name;
    d.enemy.skill          = enemy.attack ?? 0;
    d.enemy.tier           = enemy.defense ?? 2;
    d.enemy.life           = enemy.hp ?? 0;
    d.enemy.lifeMax        = enemy.hp ?? 0;
    d.roundsThisBattle     = 0;
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim108-skill-rk': ['skills', 'rk'], 'sim108-skill-kinj': ['skills', 'kinj'], 'sim108-skill-mech': ['skills', 'mech'],
    'sim108-life': ['life'], 'sim108-lifemax': ['lifeInitial'],
    'sim108-enemy-skill': ['enemy', 'skill'], 'sim108-enemy-life': ['enemy', 'life'], 'sim108-enemy-lifemax': ['enemy', 'lifeMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = parseInt(input.value, 10) || 0;
      if (path.length === 1) d[path[0]] = val;
      else d[path[0]][path[1]] = val;
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

function _numField(label, id, width) {

  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <div class="inv-qty-wrap">
        <button class="inv-qty-btn" data-id="${id}" data-delta="-1">−</button>
        <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric"${width ? ` style="width:${width}"` : ''}>
        <button class="inv-qty-btn" data-id="${id}" data-delta="1">+</button>
      </div>
    </div>`;
}

export { initSim108 as init, renderSim108 as render, setSim108Visible as setVisible };
