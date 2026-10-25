import { DAMAGE_CAP, tetivaEncounter } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, DAMAGE_CAP, SVG_SKULL, SVG_TROPHY, _appendLog, _battleOver, _data, _enemyList, _enemyName, _enemyNameSafe, _loadEnemyList, _numField, _playerLost, _playerWon, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _renderStatus, _resetBattle, _resetEncounterKnobs, _roll2d6, _runRound, _setupEnemyAutocomplete, apiFetch, closeSim753, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim753, openSim753, registerPanelShortcut, renderSim753, saveState, setSim753Visible, shortcutLabel, showAlert, t, tetivaEncounter, tetivaRound });
const { _data, _appendLog, _battleOver, _recordOutcome } = createState(simulatorContext);
const { _roll2d6, _enemyName, _enemyNameSafe, _playerWon, _playerLost, _resetEncounterKnobs, _runRound, _resetBattle } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Вълшебната тетива, book 753)
// Player hits are counted against a target; enemy damage accumulates toward the troll's limit.
// Encounter-specific exceptions are manual; this is not symmetric damage combat.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { tetivaRound } from "../.././engines/tetiva.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Keep lifetime outcomes: admin totals require the full history.

// ── Combat ───────────────────────────────────────────────────────────────────

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim753-status');
  if (!d || !el) return;
  const hasEnemy = d.enemy.hitsNeeded > 0;
  if (_playerLost(d))                el.innerHTML = t('battlesim753.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && _playerWon(d)) el.innerHTML = t('battlesim753.status.victory', { trophy: SVG_TROPHY });
  else                                el.innerHTML = '';
  document.getElementById('sim753-round').disabled = _battleOver(d);
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim753-history-summary');
  const listEl = document.getElementById('sim753-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim753.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim753.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim753.history.won') : t('battlesim753.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">ПОРАЖЕНИЯ ${h.playerDamage}/${h.damageCap} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim753-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim753-player-attack').value  = d.player.attack;
  document.getElementById('sim753-player-defense').value = d.player.defense;
  document.getElementById('sim753-player-damage').value  = d.player.damage;
  document.getElementById('sim753-player-speed').value = d.player.speed || 0;
  document.getElementById('sim753-printed-effects').hidden = d.printedRules !== 1;
  document.getElementById('sim753-enemy-first').checked = d.combatEffects?.enemyFirst === true;
  document.getElementById('sim753-initiative-speed').checked = d.combatEffects?.initiativeBySpeed === true;
  document.getElementById('sim753-variable-defense').checked = d.combatEffects?.variableDefense === true;

  document.getElementById('sim753-enemy-pick').value   = d.enemy.name;
  document.getElementById('sim753-enemy-attack').value  = d.enemy.attack;
  document.getElementById('sim753-enemy-defense').value = d.enemy.defense;
  document.getElementById('sim753-enemy-hitsneeded').value = d.enemy.hitsNeeded;
  document.getElementById('sim753-enemy-hitslanded').value = d.enemy.hitsLanded;
  document.getElementById('sim753-enemy-strikes').value    = d.enemy.strikesPerRound;
  document.getElementById('sim753-kobaldi').checked = d.kobaldiMode;
  document.getElementById('sim753-enemy-strikes-row').style.display = d.kobaldiMode ? 'none' : '';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim753() {
  const overlay = document.getElementById('sim753-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim753(); return; }
  _renderAll();
}

function openSim753() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim753-overlay').classList.add('active');
}

function closeSim753() {
  document.getElementById('sim753-overlay')?.classList.remove('active');
}

export function setSim753Visible(visible) {
  const btn = document.getElementById('sim753-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim753();
}

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

function _setupEnemyAutocomplete(inputId, dropdownId, onSelect) {
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">АТАКА:${e.attack ?? '?'} ЗАЩИТА:${e.defense ?? '?'} УДАРИ:${e.hp ?? '?'}</span></li>`
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

// ── Init ──────────────────────────────────────────────────────────────────────

export function initSim753() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim753-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim753.ui.title')}</span>
        <button id="sim753-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim753.ui.you')}</div>
            ${_numField(t('battlesim753.ui.attack'), 'sim753-player-attack')}
            ${_numField(t('battlesim753.ui.defense'), 'sim753-player-defense')}
            ${_numField(t('battlesim753.ui.damage'), 'sim753-player-damage')}
            ${_numField(t('battlesim753.ui.speed'), 'sim753-player-speed')}
            <div id="sim753-printed-effects">
              <label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim753.ui.enemy_first')}</span><input id="sim753-enemy-first" type="checkbox"></label>
              <label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim753.ui.initiative_speed')}</span><input id="sim753-initiative-speed" type="checkbox"></label>
              <label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim753.ui.variable_defense')}</span><input id="sim753-variable-defense" type="checkbox"></label>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim753.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim753.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim753-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim753-enemy-pick-dropdown">
                <ul id="sim753-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim753.ui.attack'), 'sim753-enemy-attack')}
            ${_numField(t('battlesim753.ui.defense'), 'sim753-enemy-defense')}
            ${_numField(t('battlesim753.ui.hits_needed'), 'sim753-enemy-hitsneeded')}
            ${_numField(t('battlesim753.ui.hits_landed'), 'sim753-enemy-hitslanded')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim753.ui.kobaldi_mode')}</span>
              <input id="sim753-kobaldi" type="checkbox">
            </div>
            <div id="sim753-enemy-strikes-row">
              ${_numField(t('battlesim753.ui.strikes_per_round'), 'sim753-enemy-strikes')}
            </div>
          </div>
          <div id="sim753-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim753-round" class="inv-add-btn bsim-action-primary">${t('battlesim753.btn.round')}</button>
            <button id="sim753-reset" class="inv-add-btn">${t('battlesim753.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim753-history-summary">${t('battlesim753.history.summary', { n: 0 })}</summary>
            <div id="sim753-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim753-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim753-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim753);
  document.getElementById('sim753-close').addEventListener('click', closeSim753);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim753(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim753-overlay'),
    open:  openSim753,
    close: closeSim753,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim753();
  });

  document.getElementById('sim753-round').addEventListener('click', _runRound);
  document.getElementById('sim753-reset').addEventListener('click', _resetBattle);
  for (const [id, key] of [['enemy-first','enemyFirst'],['initiative-speed','initiativeBySpeed'],['variable-defense','variableDefense']]) {
    document.getElementById(`sim753-${id}`).addEventListener('change', e => {
      const d = _data();
      if (!d || d.printedRules !== 1) return;
      d.combatEffects[key] = e.target.checked;
      saveState();
    });
  }

  document.getElementById('sim753-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim753-kobaldi').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.kobaldiMode = e.target.checked;
    saveState();
    _renderInputs();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim753-player-attack':     ['player', 'attack'],
    'sim753-player-defense':    ['player', 'defense'],
    'sim753-player-damage':     ['player', 'damage'],
    'sim753-player-speed':      ['player', 'speed'],
    'sim753-enemy-attack':      ['enemy', 'attack'],
    'sim753-enemy-defense':     ['enemy', 'defense'],
    'sim753-enemy-hitsneeded':  ['enemy', 'hitsNeeded'],
    'sim753-enemy-hitslanded':  ['enemy', 'hitsLanded'],
    'sim753-enemy-strikes':     ['enemy', 'strikesPerRound'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = Math.max(0, val);
    if (id === 'sim753-player-damage') val = Math.min(val, DAMAGE_CAP);
    if (id === 'sim753-enemy-hitslanded') val = Math.min(val, d.enemy.hitsNeeded || val);
    d[map[0]][map[1]] = val;
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim753-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim753-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const next = Math.max(0, Number(input.value) || 0) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim753-enemy-pick', 'sim753-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name = enemy.name;
    _resetEncounterKnobs(d);
    if (enemy.attack != null)  d.enemy.attack = enemy.attack;
    if (enemy.defense != null) d.enemy.defense = enemy.defense;
    if (enemy.hp != null)      d.enemy.hitsNeeded = enemy.hp;
    if (enemy.pb != null)      d.enemy.strikesPerRound = enemy.pb;
    d.enemy.hitsLanded = 0;
    d.player.damage = 0;
    d.roundsThisBattle = 0;
    d.printedRules = 1;
    d.encounterSection = Number(enemy.name.match(/§(\d+)/)?.[1]) || 0;
    d.combatEffects = tetivaEncounter(d.encounterSection);
    delete d.initiativeEnemyFirst;
    d.kobaldiMode = d.combatEffects.kobaldi;
    saveState();
    _renderAll();
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

export { initSim753 as init, renderSim753 as render, setSim753Visible as setVisible };
