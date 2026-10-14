import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, SVG_SKULL, SVG_TROPHY, _appendLog, _checkBattleEnd, _data, _enemyList, _enemyName, _enemyNameSafe, _loadEnemyList, _numField, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _resetBattle, _roll1d6, _runRound, _setVal, _setupAutocomplete, _strike, apiFetch, closeSim80, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim80, openSim80, registerPanelShortcut, renderSim80, saveState, setSim80Visible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _roll1d6, _enemyName, _enemyNameSafe, _strike, _runRound, _checkBattleEnd, _resetBattle } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Бойците на Орм / The Fighters of Orm, book 80)
// Initiative is 1d6 + interactive status; a gap of 3+ grants two opening strikes.
// Damage is max(0, offensive status + 1d6 - defensive status).
// Initiative ties default to player-first because the source leaves them unspecified.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;




















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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">Ж:${e.hp ?? '?'} О:${e.attack ?? '?'} Д:${e.defense ?? '?'} И:${e.pb ?? '?'}</span></li>`
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
  _setVal('sim80-off', d.offensive);
  _setVal('sim80-def', d.defensive);
  _setVal('sim80-int', d.interactive);
  _setVal('sim80-life', d.life);
  _setVal('sim80-lifemax', d.lifeInitial);
  _setVal('sim80-enemy-off', d.enemy.offensive);
  _setVal('sim80-enemy-def', d.enemy.defensive);
  _setVal('sim80-enemy-int', d.enemy.interactive);
  _setVal('sim80-enemy-life', d.enemy.life);
  _setVal('sim80-enemy-lifemax', d.enemy.lifeMax);
  if (!skipEnemyPick) _setVal('sim80-enemy-pick', d.enemy.name);

  const status = document.getElementById('sim80-status');
  if (d.life <= 0) {
    status.textContent = t('battlesim80.status.fallen');
  } else if (d.enemy.life <= 0 && d.enemy.lifeMax > 0) {
    status.textContent = t('battlesim80.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim80-round').disabled = d.life <= 0 || d.enemy.life <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim80-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim80-history-summary');
  const listEl = document.getElementById('sim80-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim80.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim80.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim80.history.won') : t('battlesim80.history.lost');
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

export function renderSim80() {
  const overlay = document.getElementById('sim80-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim80(); return; }
  _renderAll();
}

function openSim80() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim80-overlay').classList.add('active');
}

function closeSim80() {
  document.getElementById('sim80-overlay')?.classList.remove('active');
}

export function setSim80Visible(visible) {
  const btn = document.getElementById('sim80-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim80();
}

// ── Init ──────────────────────────────────────────────────────────────────────



export function initSim80() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim80-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim80.ui.title')}</span>
        <button id="sim80-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            ${_numField(t('battlesim80.ui.off'), 'sim80-off')}
            ${_numField(t('battlesim80.ui.def'), 'sim80-def')}
            ${_numField(t('battlesim80.ui.int'), 'sim80-int')}
            ${_numField(t('battlesim80.ui.life'), 'sim80-life')}
            ${_numField(t('battlesim80.ui.life_initial'), 'sim80-lifemax')}
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim80.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim80-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim80-enemy-pick-dropdown">
                <ul id="sim80-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim80.ui.enemy_off'), 'sim80-enemy-off')}
            ${_numField(t('battlesim80.ui.enemy_def'), 'sim80-enemy-def')}
            ${_numField(t('battlesim80.ui.enemy_int'), 'sim80-enemy-int')}
            ${_numField(t('battlesim80.ui.enemy_life'), 'sim80-enemy-life')}
            ${_numField(t('battlesim80.ui.enemy_life_max'), 'sim80-enemy-lifemax')}
          </div>
          <div id="sim80-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim80-round" class="inv-add-btn bsim-action-primary">${t('battlesim80.btn.round')}</button>
            <button id="sim80-reset" class="inv-add-btn">${t('battlesim80.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim80-history-summary">${t('battlesim80.history.summary', { n: 0 })}</summary>
            <div id="sim80-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim80-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim80-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim80);
  document.getElementById('sim80-close').addEventListener('click', closeSim80);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim80(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim80-overlay'),
    open:  openSim80,
    close: closeSim80,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim80();
  });

  document.getElementById('sim80-round').addEventListener('click', _runRound);
  document.getElementById('sim80-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim80-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim80-enemy-pick', 'sim80-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name         = enemy.name;
    d.enemy.offensive     = enemy.attack ?? 0;
    d.enemy.defensive     = enemy.defense ?? 0;
    d.enemy.interactive   = enemy.pb ?? 0;
    d.enemy.life          = enemy.hp ?? 0;
    d.enemy.lifeMax       = enemy.hp ?? 0;
    d.roundsThisBattle    = 0;
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim80-off': ['offensive'], 'sim80-def': ['defensive'], 'sim80-int': ['interactive'],
    'sim80-life': ['life'], 'sim80-lifemax': ['lifeInitial'],
    'sim80-enemy-off': ['enemy', 'offensive'], 'sim80-enemy-def': ['enemy', 'defensive'], 'sim80-enemy-int': ['enemy', 'interactive'],
    'sim80-enemy-life': ['enemy', 'life'], 'sim80-enemy-lifemax': ['enemy', 'lifeMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = Math.max(0, parseInt(input.value, 10) || 0);
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

export { initSim80 as init, renderSim80 as render, setSim80Visible as setVisible };
