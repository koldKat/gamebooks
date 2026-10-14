import { SIDE_WOUND_DMG, MAX_EXTRA_ATTACKERS } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, MAX_EXTRA_ATTACKERS, SIDE_WOUND_DMG, SVG_SKULL, SVG_TROPHY, _appendLog, _data, _emptySideEnemy, _enemyDefeated, _enemyList, _enemyName, _enemyNameSafe, _loadEnemyList, _notReady, _numField, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _renderStatus, _resetBattle, _resetEncounterKnobs, _roll1d6, _roll2d6, _runRound, _setupEnemyAutocomplete, _sideBlock, _sideEnemyNameSafe, _skipLuck, _testLuck, apiFetch, closeSim220, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim220, openSim220, registerPanelShortcut, renderSim220, saveState, setSim220Visible, shortcutLabel, showAlert, t });
const { _data, _notReady, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _emptySideEnemy, _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _sideEnemyNameSafe, _enemyDefeated, _resetEncounterKnobs, _runRound, _testLuck, _skipLuck, _resetBattle } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Creature of Havoc, book 220)
// Creature wounds cost 2 STAMINA; enemy wounds cost 1; attack doubles kill instantly.
// Luck modifies a landed hit; narrative bonuses and unmodeled effects are entered manually.
// No consumable pool; encounter-specific passives require manual adjustment.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;























// Keep lifetime outcomes: admin totals require the full history.


// ── Combat ───────────────────────────────────────────────────────────────────



// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome.
// Same Lucky/Unlucky table as every other FF sim in this app.






// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim220-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim220.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim220.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && _enemyDefeated(d))            el.innerHTML = t('battlesim220.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && _enemyDefeated(d));
  document.getElementById('sim220-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim220-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim220-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim220-history-summary');
  const listEl = document.getElementById('sim220-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim220.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim220.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim220.history.won') : t('battlesim220.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim220-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim220-player-skill').value      = d.player.skill;
  document.getElementById('sim220-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim220-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim220-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim220-player-luck').value       = d.player.luck;
  document.getElementById('sim220-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim220-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim220-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim220.btn.rolled') : t('battlesim220.btn.roll');

  document.getElementById('sim220-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim220-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim220-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim220-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim220-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim220-player-wounddmg').value  = d.player.playerWoundDamage;
  document.getElementById('sim220-enemy-threshold').value  = d.player.enemyDefeatThreshold;
  document.getElementById('sim220-enemy-firstwin').checked = d.player.enemyAutoWinFirstRound;

  document.getElementById('sim220-extra-count').value = d.extraAttackers;
  for (let i = 0; i < MAX_EXTRA_ATTACKERS; i++) {
    const side = d.sideEnemies[i] || _emptySideEnemy();
    const block = document.getElementById(`sim220-side${i}-block`);
    if (block) block.style.display = i < d.extraAttackers ? '' : 'none';
    const pickEl = document.getElementById(`sim220-side${i}-pick`);
    if (pickEl) pickEl.value = side.name;
    const skillEl = document.getElementById(`sim220-side${i}-skill`);
    if (skillEl) skillEl.value = side.skill;
    const maxEl = document.getElementById(`sim220-side${i}-staminamax`);
    if (maxEl) maxEl.value = side.staminaMax;
  }

  const pendingEl = document.getElementById('sim220-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim220() {
  const overlay = document.getElementById('sim220-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim220(); return; }
  _renderAll();
}

function openSim220() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim220-overlay').classList.add('active');
}

function closeSim220() {
  document.getElementById('sim220-overlay')?.classList.remove('active');
}

export function setSim220Visible(visible) {
  const btn = document.getElementById('sim220-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim220();
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





export function initSim220() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim220-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim220-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim220.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim220-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim220.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim220.ui.skill'), 'sim220-player-skill')}
            ${_numField(t('battlesim220.ui.skill_initial'), 'sim220-player-skillmax')}
            ${_numField(t('battlesim220.ui.stamina'), 'sim220-player-stamina')}
            ${_numField(t('battlesim220.ui.stamina_initial'), 'sim220-player-staminamax')}
            ${_numField(t('battlesim220.ui.luck'), 'sim220-player-luck')}
            ${_numField(t('battlesim220.ui.luck_initial'), 'sim220-player-luckmax')}
            ${_numField(t('battlesim220.ui.atkmod'), 'sim220-player-atkmod')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim220.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim220.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim220-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim220-enemy-pick-dropdown">
                <ul id="sim220-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim220.ui.skill'), 'sim220-enemy-skill')}
            ${_numField(t('battlesim220.ui.stamina'), 'sim220-enemy-stamina')}
            ${_numField(t('battlesim220.ui.stamina_max'), 'sim220-enemy-staminamax')}
            ${_numField(t('battlesim220.ui.wound_dmg'), 'sim220-enemy-wounddmg')}
            ${_numField(t('battlesim220.ui.player_wound_dmg'), 'sim220-player-wounddmg')}
            ${_numField(t('battlesim220.ui.defeat_threshold'), 'sim220-enemy-threshold')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim220-enemy-firstwin" class="inv-edit-check"> ${t('battlesim220.ui.enemy_firstwin_toggle')}</label>
            </div>
            ${_numField(t('battlesim220.ui.extra_attackers'), 'sim220-extra-count')}
            ${_sideBlock(0)}
            ${_sideBlock(1)}
            ${_sideBlock(2)}
          </div>
          <div id="sim220-status" class="bsim-status"></div>
          <div id="sim220-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim220.btn.luck_prompt')}</span>
            <button id="sim220-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim220.btn.luck_yes')}</button>
            <button id="sim220-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim220.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim220-round" class="inv-add-btn bsim-action-primary">${t('battlesim220.btn.round')}</button>
            <button id="sim220-reset" class="inv-add-btn">${t('battlesim220.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim220-history-summary">${t('battlesim220.history.summary', { n: 0 })}</summary>
            <div id="sim220-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim220-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim220-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim220);
  document.getElementById('sim220-close').addEventListener('click', closeSim220);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim220(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim220-overlay'),
    open:  openSim220,
    close: closeSim220,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim220();
  });

  document.getElementById('sim220-round').addEventListener('click', _runRound);
  document.getElementById('sim220-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim220-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim220-luck-no').addEventListener('click', _skipLuck);

  document.getElementById('sim220-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim220.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim220-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  for (let i = 0; i < MAX_EXTRA_ATTACKERS; i++) {
    document.getElementById(`sim220-side${i}-pick`).addEventListener('input', e => {
      const d = _data();
      if (!d) return;
      d.sideEnemies[i].name = e.target.value;
      saveState();
    });
  }

  document.getElementById('sim220-enemy-firstwin').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.enemyAutoWinFirstRound = e.target.checked;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim220-player-skill':      ['player', 'skill'],
    'sim220-player-skillmax':   ['player', 'skillInitial'],
    'sim220-player-stamina':    ['player', 'stamina'],
    'sim220-player-staminamax': ['player', 'staminaInitial'],
    'sim220-player-luck':       ['player', 'luck'],
    'sim220-player-luckmax':    ['player', 'luckInitial'],
    'sim220-player-atkmod':     ['player', 'attackModifier'],
    'sim220-enemy-skill':       ['enemy', 'skill'],
    'sim220-enemy-stamina':        ['enemy', 'stamina'],
    'sim220-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim220-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim220-player-wounddmg':      ['player', 'playerWoundDamage'],
    'sim220-enemy-threshold':      ['player', 'enemyDefeatThreshold'],
    'sim220-extra-count':          ['root', 'extraAttackers'],
    'sim220-side0-skill':       ['side0', 'skill'],
    'sim220-side0-staminamax':  ['side0', 'staminaMax'],
    'sim220-side1-skill':       ['side1', 'skill'],
    'sim220-side1-staminamax':  ['side1', 'staminaMax'],
    'sim220-side2-skill':       ['side2', 'skill'],
    'sim220-side2-staminamax':  ['side2', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Allow negative attack modifiers; other fields stay non-negative.
    val = id === 'sim220-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim220-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim220-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim220-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim220-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim220-enemy-threshold') val = Math.min(val, Math.max(0, d.enemy.staminaMax - 1));
    if (id === 'sim220-extra-count') val = Math.min(val, MAX_EXTRA_ATTACKERS);
    if (map[0] === 'root') {
      d[map[1]] = val;
    } else if (map[0].startsWith('side')) {
      const idx = Number(map[0].slice(4));
      d.sideEnemies[idx][map[1]] = val;
    } else {
      d[map[0]][map[1]] = val;
    }
    if (id === 'sim220-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim220-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim220-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim220-enemy-staminamax') {
      d.enemy.stamina = Math.min(d.enemy.stamina, val);
      d.player.enemyDefeatThreshold = Math.min(d.player.enemyDefeatThreshold, Math.max(0, val - 1));
    }
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim220-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim220-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim220-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim220-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim220-enemy-pick', 'sim220-enemy-pick-dropdown', enemy => {
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
  for (let i = 0; i < MAX_EXTRA_ATTACKERS; i++) {
    _setupEnemyAutocomplete(`sim220-side${i}-pick`, `sim220-side${i}-pick-dropdown`, enemy => {
      const d = _data();
      if (!d) return;
      d.sideEnemies[i].name = enemy.name;
      if (enemy.attack != null) d.sideEnemies[i].skill = enemy.attack;
      if (enemy.hp != null)     d.sideEnemies[i].staminaMax = enemy.hp;
      saveState();
      _renderAll();
    });
  }
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

function _sideBlock(i) {

  return `
    <div id="sim220-side${i}-block" style="display:none">
      <div class="inv-edit-row">
        <span class="inv-edit-label bsim-stat-label">${t('battlesim220.ui.extra_attacker', { n: i + 1 })}</span>
        <div class="autocomplete-wrap bsim-enemy-ac">
          <input id="sim220-side${i}-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim220-side${i}-pick-dropdown">
          <ul id="sim220-side${i}-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
        </div>
      </div>
      ${_numField(t('battlesim220.ui.skill'), `sim220-side${i}-skill`)}
      ${_numField(t('battlesim220.ui.stamina_max'), `sim220-side${i}-staminamax`)}
    </div>`;
}

export { initSim220 as init, renderSim220 as render, setSim220Visible as setVisible };
