import { MAX_PROVISIONS, PROVISIONS_HEAL, SIDE_WOUND_DMG, MAX_TABASHA_USES } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, MAX_PROVISIONS, MAX_TABASHA_USES, PROVISIONS_HEAL, SIDE_WOUND_DMG, SVG_SKULL, SVG_TROPHY, _appendLog, _callTabasha, _data, _eatProvisions, _enemyList, _enemyName, _enemyNameSafe, _firstRoundOverride, _loadEnemyList, _notReady, _numField, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _renderStatus, _resetBattle, _resetEncounterKnobs, _roll1d6, _roll2d6, _runRound, _setupEnemyAutocomplete, _sideEnemyNameSafe, _skipLuck, _testLuck, apiFetch, closeSim226, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim226, openSim226, registerPanelShortcut, renderSim226, saveState, setSim226Visible, shortcutLabel, showAlert, t });
const { _data, _notReady, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _sideEnemyNameSafe, _resetEncounterKnobs, _firstRoundOverride, _runRound, _testLuck, _skipLuck, _resetBattle, _callTabasha } = createCombat(simulatorContext);
const { _eatProvisions } = createEffects(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Chasms of Malice, book 226)
// Fighting Fantasy: opposed 2d6 + SKILL; ties miss, normal wounds cost 2 STAMINA.
// Luck modifies a landed hit; narrative bonuses and unmodeled effects are entered manually.
// Tabasha's chosen companion role is fixed for the adventure.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Uncapped (not trimmed to a rolling window) - the admin dashboard aggregates
// battle counts app-wide from this array, so per-user history needs to be a
// true lifetime total.

// ── Combat ───────────────────────────────────────────────────────────────────

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome.

// ── Provisions / Tabasha ────────────────────────────────────────────────────

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim226-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim226.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim226.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = t('battlesim226.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim226-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim226-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim226-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim226-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
  document.getElementById('sim226-tabasha-call').disabled =
    notReady || d.player.tabashaUsesLeft <= 0 ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim226-history-summary');
  const listEl = document.getElementById('sim226-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim226.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim226.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim226.history.won') : t('battlesim226.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim226-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim226-player-skill').value      = d.player.skill;
  document.getElementById('sim226-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim226-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim226-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim226-player-luck').value       = d.player.luck;
  document.getElementById('sim226-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim226-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim226-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim226.btn.rolled') : t('battlesim226.btn.roll');

  const tabashaSel = document.getElementById('sim226-tabasha-stat');
  tabashaSel.value = d.player.tabashaStat;
  tabashaSel.disabled = d.rolled;
  document.getElementById('sim226-tabasha-uses').textContent = t('battlesim226.ui.uses_left', { n: d.player.tabashaUsesLeft });

  document.getElementById('sim226-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim226-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim226-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim226-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim226-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim226-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim226-enemy-winhits').value    = d.player.winAfterHits;
  document.getElementById('sim226-enemy-firstwin').checked = d.player.enemyAutoWinFirstRound;

  document.getElementById('sim226-paired').checked = d.pairedFight;
  document.getElementById('sim226-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim226-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim226-side-staminamax').value = d.sideEnemy.staminaMax;
  document.getElementById('sim226-side-fields').style.display = d.pairedFight ? '' : 'none';

  const pendingEl = document.getElementById('sim226-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim226() {
  const overlay = document.getElementById('sim226-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim226(); return; }
  _renderAll();
}

function openSim226() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim226-overlay').classList.add('active');
}

function closeSim226() {
  document.getElementById('sim226-overlay')?.classList.remove('active');
}

export function setSim226Visible(visible) {
  const btn = document.getElementById('sim226-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim226();
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">SKILL:${e.attack ?? '?'} STAMINA:${e.hp ?? '?'}</span></li>`
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

export function initSim226() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim226-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim226-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim226.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim226-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim226.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim226.ui.skill'), 'sim226-player-skill')}
            ${_numField(t('battlesim226.ui.skill_initial'), 'sim226-player-skillmax')}
            ${_numField(t('battlesim226.ui.stamina'), 'sim226-player-stamina')}
            ${_numField(t('battlesim226.ui.stamina_initial'), 'sim226-player-staminamax')}
            ${_numField(t('battlesim226.ui.luck'), 'sim226-player-luck')}
            ${_numField(t('battlesim226.ui.luck_initial'), 'sim226-player-luckmax')}
            ${_numField(t('battlesim226.ui.atkmod'), 'sim226-player-atkmod')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim226.ui.tabasha_stat')}</span>
              <select id="sim226-tabasha-stat" class="inv-edit-input bsim-select">
                <option value="skill">${escapeHtml(t('battlesim226.ui.skill'))}</option>
                <option value="luck">${escapeHtml(t('battlesim226.ui.luck'))}</option>
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span id="sim226-tabasha-uses" class="bsim-ae-display"></span>
              <button id="sim226-tabasha-call" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim226.btn.tabasha_call')}</button>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim226.ui.provisions')}</span>
              <span id="sim226-provisions-left" class="bsim-ae-display"></span>
              <button id="sim226-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim226.btn.provisions_eat', { n: PROVISIONS_HEAL })}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim226.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim226.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim226-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim226-enemy-pick-dropdown">
                <ul id="sim226-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim226.ui.skill'), 'sim226-enemy-skill')}
            ${_numField(t('battlesim226.ui.stamina'), 'sim226-enemy-stamina')}
            ${_numField(t('battlesim226.ui.stamina_max'), 'sim226-enemy-staminamax')}
            ${_numField(t('battlesim226.ui.wound_dmg'), 'sim226-enemy-wounddmg')}
            ${_numField(t('battlesim226.ui.win_after_hits'), 'sim226-enemy-winhits')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim226-enemy-firstwin" class="inv-edit-check"> ${t('battlesim226.ui.enemy_firstwin_toggle')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim226-paired" class="inv-edit-check"> ${t('battlesim226.ui.paired_toggle')}</label>
            </div>
            <div id="sim226-side-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim226.ui.pick')}</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim226-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim226-side-pick-dropdown">
                  <ul id="sim226-side-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField(t('battlesim226.ui.skill'), 'sim226-side-skill')}
              ${_numField(t('battlesim226.ui.stamina_max'), 'sim226-side-staminamax')}
            </div>
          </div>
          <div id="sim226-status" class="bsim-status"></div>
          <div id="sim226-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim226.btn.luck_prompt')}</span>
            <button id="sim226-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim226.btn.luck_yes')}</button>
            <button id="sim226-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim226.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim226-round" class="inv-add-btn bsim-action-primary">${t('battlesim226.btn.round')}</button>
            <button id="sim226-reset" class="inv-add-btn">${t('battlesim226.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim226-history-summary">${t('battlesim226.history.summary', { n: 0 })}</summary>
            <div id="sim226-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim226-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim226-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim226);
  document.getElementById('sim226-close').addEventListener('click', closeSim226);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim226(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim226-overlay'),
    open:  openSim226,
    close: closeSim226,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim226();
  });

  document.getElementById('sim226-round').addEventListener('click', _runRound);
  document.getElementById('sim226-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim226-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim226-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim226-provisions').addEventListener('click', _eatProvisions);
  document.getElementById('sim226-tabasha-call').addEventListener('click', _callTabasha);

  document.getElementById('sim226-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim226.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim226-tabasha-stat').addEventListener('change', e => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.tabashaStat = e.target.value;
    saveState();
  });

  document.getElementById('sim226-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim226-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim226-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim226-enemy-firstwin').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.enemyAutoWinFirstRound = e.target.checked;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim226-player-skill':      ['player', 'skill'],
    'sim226-player-skillmax':   ['player', 'skillInitial'],
    'sim226-player-stamina':    ['player', 'stamina'],
    'sim226-player-staminamax': ['player', 'staminaInitial'],
    'sim226-player-luck':       ['player', 'luck'],
    'sim226-player-luckmax':    ['player', 'luckInitial'],
    'sim226-player-atkmod':     ['player', 'attackModifier'],
    'sim226-enemy-skill':       ['enemy', 'skill'],
    'sim226-enemy-stamina':        ['enemy', 'stamina'],
    'sim226-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim226-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim226-enemy-winhits':        ['player', 'winAfterHits'],
    'sim226-side-skill':        ['sideEnemy', 'skill'],
    'sim226-side-staminamax':   ['sideEnemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Attack modifier is the one field allowed to go negative - every other
    // field stays clamped to 0 or above.
    val = id === 'sim226-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim226-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim226-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim226-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim226-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim226-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim226-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim226-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim226-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim226-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim226-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim226-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim226-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim226-enemy-pick', 'sim226-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.skill = enemy.attack;
    if (enemy.hp != null)     { d.enemy.stamina = enemy.hp; d.enemy.staminaMax = enemy.hp; }
    d.roundsThisBattle = 0;
    d.pendingLuckQueue = [];
    _resetEncounterKnobs(d);
    saveState();
    _renderAll();
  });
  _setupEnemyAutocomplete('sim226-side-pick', 'sim226-side-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy.staminaMax = enemy.hp;
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

export { initSim226 as init, renderSim226 as render, setSim226Visible as setVisible };
