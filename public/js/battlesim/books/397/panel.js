import { CLASS_PRESETS, PRINTED_ENEMY_ARMOUR } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, CLASS_PRESETS, PRINTED_ENEMY_ARMOUR, SVG_SKULL, SVG_TROPHY, _appendLog, _applyClassPreset, _applyEnemyDefeat, _applyPlayerFall, _attack, _battleOver, _data, _defend, _emptyEnemy, _enemyList, _enemyName, _enemyNameSafe, _enemyStrike, _loadEnemyList, _numField, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _resetBattle, _roll1d6, _roll2d6, _roll3d6, _rollNd6, _selectEnemy, _setVal, _setupAutocomplete, apiFetch, closeSim397, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim397, openSim397, registerPanelShortcut, renderSim397, saveState, setSim397Visible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _battleOver, _recordOutcome } = createState(simulatorContext);
const { _selectEnemy, _emptyEnemy, _roll1d6, _roll2d6, _roll3d6, _rollNd6, _enemyName, _enemyNameSafe, _applyEnemyDefeat, _applyPlayerFall, _enemyStrike, _attack, _defend, _resetBattle, _applyClassPreset } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Пътят на съдбата / Doomwalk, book 397, Blood Sword book 4 by Dave Morris &
// Oliver Johnson)
// Solo Blood Sword: attack hits on 2d6 <= Fighting Prowess; armour reduces rolled damage.
// Defending skips the player's attack and makes the enemy roll 3d6 to hit.
// Psychic/team combat and encounter-specific attacks are not simulated; adjust manually.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Rank 16 (solo Adventurer) starting stats per class, from the book's own
// character tables - autocomplete-style convenience defaults only.


// Armour is not stored in the roster's defense field (that is damage bonus).






















// ── Combat ───────────────────────────────────────────────────────────────────















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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim397.ui.endurance')}:${e.hp ?? '?'}</span></li>`
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
  const p = d.player, e = d.enemy;

  _setVal('sim397-player-fp', p.fp);
  _setVal('sim397-player-endurance', p.endurance);
  _setVal('sim397-player-endurancemax', p.enduranceInitial);
  _setVal('sim397-player-dmgdice', p.dmgDice);
  _setVal('sim397-player-dmgbonus', p.dmgBonus);
  _setVal('sim397-player-armor', p.armor);

  if (!skipEnemyPick) _setVal('sim397-enemy-pick', e.name);
  _setVal('sim397-enemy-fp', e.fp);
  _setVal('sim397-enemy-endurance', e.endurance);
  _setVal('sim397-enemy-endurancemax', e.enduranceMax);
  _setVal('sim397-enemy-dmgdice', e.dmgDice);
  _setVal('sim397-enemy-dmgbonus', e.dmgBonus);
  _setVal('sim397-enemy-armor', e.armor);

  const over = _battleOver(d);
  document.getElementById('sim397-attack').disabled = over;
  document.getElementById('sim397-defend').disabled = over;

  const status = document.getElementById('sim397-status');
  if (p.endurance <= 0) status.innerHTML = t('battlesim397.status.fallen', { skull: SVG_SKULL });
  else if (e.enduranceMax > 0 && e.endurance <= 0) status.innerHTML = t('battlesim397.status.victory', { trophy: SVG_TROPHY });
  else status.innerHTML = '';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim397-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim397-history-summary');
  const listEl = document.getElementById('sim397-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim397.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim397.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim397.history.won') : t('battlesim397.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim397.ui.endurance')} ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim397() {
  const overlay = document.getElementById('sim397-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim397(); return; }
  _renderAll();
}

function openSim397() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim397-overlay').classList.add('active');
}

function closeSim397() {
  document.getElementById('sim397-overlay')?.classList.remove('active');
}

export function setSim397Visible(visible) {
  const btn = document.getElementById('sim397-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim397();
}

// ── Init ──────────────────────────────────────────────────────────────────────



export function initSim397() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim397-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim397.ui.title')}</span>
        <button id="sim397-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim397.ui.you')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim397.ui.class')}</span>
              <select id="sim397-class-pick" class="inv-edit-input">
                <option value="">${t('battlesim397.ui.class_pick')}</option>
                <option value="warrior">${t('battlesim397.ui.class_warrior')}</option>
                <option value="trickster">${t('battlesim397.ui.class_trickster')}</option>
                <option value="mystic">${t('battlesim397.ui.class_mystic')}</option>
                <option value="sorcerer">${t('battlesim397.ui.class_sorcerer')}</option>
              </select>
            </div>
            ${_numField(t('battlesim397.ui.fp'), 'sim397-player-fp')}
            ${_numField(t('battlesim397.ui.endurance'), 'sim397-player-endurance')}
            ${_numField(t('battlesim397.ui.endurance_initial'), 'sim397-player-endurancemax')}
            ${_numField(t('battlesim397.ui.dmg_dice'), 'sim397-player-dmgdice')}
            ${_numField(t('battlesim397.ui.dmg_bonus'), 'sim397-player-dmgbonus')}
            ${_numField(t('battlesim397.ui.armor'), 'sim397-player-armor')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim397.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim397.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim397-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim397-enemy-pick-dropdown">
                <ul id="sim397-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim397.ui.fp'), 'sim397-enemy-fp')}
            ${_numField(t('battlesim397.ui.endurance'), 'sim397-enemy-endurance')}
            ${_numField(t('battlesim397.ui.endurance_max'), 'sim397-enemy-endurancemax')}
            ${_numField(t('battlesim397.ui.dmg_dice'), 'sim397-enemy-dmgdice')}
            ${_numField(t('battlesim397.ui.dmg_bonus'), 'sim397-enemy-dmgbonus')}
            ${_numField(t('battlesim397.ui.armor'), 'sim397-enemy-armor')}
          </div>
          <div id="sim397-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim397-attack" class="inv-add-btn bsim-action-primary">${t('battlesim397.btn.attack')}</button>
            <button id="sim397-defend" class="inv-add-btn">${t('battlesim397.btn.defend')}</button>
            <button id="sim397-reset" class="inv-add-btn">${t('battlesim397.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim397-history-summary">${t('battlesim397.history.summary', { n: 0 })}</summary>
            <div id="sim397-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim397-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim397-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim397);
  document.getElementById('sim397-close').addEventListener('click', closeSim397);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim397(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim397-overlay'),
    open:  openSim397,
    close: closeSim397,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim397();
  });

  document.getElementById('sim397-attack').addEventListener('click', _attack);
  document.getElementById('sim397-defend').addEventListener('click', _defend);
  document.getElementById('sim397-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim397-class-pick').addEventListener('change', e => {
    if (e.target.value) _applyClassPreset(e.target.value);
  });

  document.getElementById('sim397-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim397-enemy-pick', 'sim397-enemy-pick-dropdown', _selectEnemy);

  const fieldMap = {
    'sim397-player-fp': ['player', 'fp'], 'sim397-player-endurance': ['player', 'endurance'],
    'sim397-player-endurancemax': ['player', 'enduranceInitial'], 'sim397-player-dmgdice': ['player', 'dmgDice'],
    'sim397-player-dmgbonus': ['player', 'dmgBonus'], 'sim397-player-armor': ['player', 'armor'],
    'sim397-enemy-fp': ['enemy', 'fp'], 'sim397-enemy-endurance': ['enemy', 'endurance'],
    'sim397-enemy-endurancemax': ['enemy', 'enduranceMax'], 'sim397-enemy-dmgdice': ['enemy', 'dmgDice'],
    'sim397-enemy-dmgbonus': ['enemy', 'dmgBonus'], 'sim397-enemy-armor': ['enemy', 'armor'],
  };
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

export { initSim397 as init, renderSim397 as render, setSim397Visible as setVisible };
