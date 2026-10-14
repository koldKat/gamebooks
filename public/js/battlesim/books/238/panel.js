import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, SVG_SKULL, SVG_TROPHY, _allDefeated, _appendLog, _data, _enemyList, _enemyName, _enemyNameSafe, _finishPairedRound, _loadEnemyList, _notReady, _numField, _paired, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _renderStatus, _resetBattle, _resetEncounterKnobs, _roll1d6, _roll2d6, _runPairedRound, _runRound, _secondName, _secondNameSafe, _setupEnemyAutocomplete, _skipLuck, _testLuck, apiFetch, closeSim238, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim238, openSim238, registerPanelShortcut, renderSim238, saveState, setSim238Visible, shortcutLabel, showAlert, t });
const { _data, _notReady, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _paired, _allDefeated, _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _secondName, _secondNameSafe, _resetEncounterKnobs, _finishPairedRound, _runPairedRound, _runRound, _testLuck, _skipLuck, _resetBattle } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Black Vein Prophecy, book 238)
// Fighting Fantasy: opposed 2d6 + SKILL; ties miss, normal wounds cost 2 STAMINA.
// Luck modifies a landed hit; narrative bonuses and unmodeled effects are entered manually.
// Only physical combat is simulated, not power-word duels.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;





















// ── Combat ───────────────────────────────────────────────────────────────────







// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome.






// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim238-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t(d.rolled && _paired(d) ? 'battlesim238.status.setup_pair' : 'battlesim238.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim238.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && _allDefeated(d))              el.innerHTML = t('battlesim238.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && _allDefeated(d));
  document.getElementById('sim238-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim238-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim238-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim238-history-summary');
  const listEl = document.getElementById('sim238-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim238.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim238.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim238.history.won') : t('battlesim238.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim238-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim238-player-skill').value      = d.player.skill;
  document.getElementById('sim238-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim238-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim238-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim238-player-luck').value       = d.player.luck;
  document.getElementById('sim238-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim238-player-atkmod').value     = d.player.attackModifier;
  document.getElementById('sim238-player-yourdmg').value    = d.player.yourDamage;
  document.getElementById('sim238-player-enemydmg').value   = d.player.enemyDamage;

  const rollBtn = document.getElementById('sim238-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim238.btn.rolled') : t('battlesim238.btn.roll');

  document.getElementById('sim238-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim238-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim238-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim238-enemy-staminamax').value = d.enemy.staminaMax;

  document.getElementById('sim238-second-toggle').checked = d.secondEnemy.active;
  document.getElementById('sim238-second-toggle').disabled = !!d.pairedCombat && !!d.pendingLuckQueue.length;
  document.getElementById('sim238-second-fields').style.display = d.secondEnemy.active ? '' : 'none';
  document.getElementById('sim238-second-name').value = d.secondEnemy.name;
  document.getElementById('sim238-second-name').disabled = !!d.pairedCombat && !!d.pendingLuckQueue.length;
  document.getElementById('sim238-second-skill').value = d.secondEnemy.skill;
  document.getElementById('sim238-paired-fields').style.display = d.pairedCombat ? '' : 'none';
  document.getElementById('sim238-second-stamina').value = d.secondEnemy.stamina ?? 0;
  document.getElementById('sim238-second-staminamax').value = d.secondEnemy.staminaMax ?? 0;
  const target = document.getElementById('sim238-target');
  target.value = d.secondEnemy.target || 'enemy';
  target.disabled = !!d.pendingLuckQueue.length;
  document.getElementById('sim238-target-first').textContent = _enemyName(d);
  document.getElementById('sim238-target-second').textContent = _secondName(d);
  document.getElementById('sim238-second-label').textContent = t(d.pairedCombat ? 'battlesim238.ui.second_tracked' : 'battlesim238.ui.second_name');
  document.getElementById('sim238-second-mode').textContent = t(d.pairedCombat ? 'battlesim238.ui.paired_toggle' : 'battlesim238.ui.second_toggle');

  const pendingEl = document.getElementById('sim238-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim238() {
  const overlay = document.getElementById('sim238-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim238(); return; }
  _renderAll();
}

function openSim238() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim238-overlay').classList.add('active');
}

function closeSim238() {
  document.getElementById('sim238-overlay')?.classList.remove('active');
}

export function setSim238Visible(visible) {
  const btn = document.getElementById('sim238-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim238();
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

function _setupEnemyAutocomplete(inputId, dropdownId, onSelect, enabled = () => true) {
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
    if (!enabled()) { closeDropdown(); return; }
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
    if (!enemy || !enabled()) return;
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



export function initSim238() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim238-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim238-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim238.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim238-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim238.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim238.ui.skill'), 'sim238-player-skill')}
            ${_numField(t('battlesim238.ui.skill_initial'), 'sim238-player-skillmax')}
            ${_numField(t('battlesim238.ui.stamina'), 'sim238-player-stamina')}
            ${_numField(t('battlesim238.ui.stamina_initial'), 'sim238-player-staminamax')}
            ${_numField(t('battlesim238.ui.luck'), 'sim238-player-luck')}
            ${_numField(t('battlesim238.ui.luck_initial'), 'sim238-player-luckmax')}
            ${_numField(t('battlesim238.ui.atkmod'), 'sim238-player-atkmod', true)}
            ${_numField(t('battlesim238.ui.yourdmg'), 'sim238-player-yourdmg')}
            ${_numField(t('battlesim238.ui.enemydmg'), 'sim238-player-enemydmg')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim238.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim238.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim238-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim238-enemy-pick-dropdown">
                <ul id="sim238-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim238.ui.skill'), 'sim238-enemy-skill')}
            ${_numField(t('battlesim238.ui.stamina'), 'sim238-enemy-stamina')}
            ${_numField(t('battlesim238.ui.stamina_max'), 'sim238-enemy-staminamax')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim238-second-toggle" class="inv-edit-check"> <span id="sim238-second-mode">${t('battlesim238.ui.second_toggle')}</span></label>
            </div>
            <div id="sim238-second-fields" style="display:none">
              <div class="inv-edit-row">
                <span id="sim238-second-label" class="inv-edit-label bsim-stat-label">${t('battlesim238.ui.second_name')}</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim238-second-name" class="inv-edit-input" type="text" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim238-second-dropdown">
                  <ul id="sim238-second-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField(t('battlesim238.ui.skill'), 'sim238-second-skill')}
              <div id="sim238-paired-fields">
                ${_numField(t('battlesim238.ui.stamina'), 'sim238-second-stamina')}
                ${_numField(t('battlesim238.ui.stamina_max'), 'sim238-second-staminamax')}
                <div class="inv-edit-row">
                  <span class="inv-edit-label bsim-stat-label">${t('battlesim238.ui.target')}</span>
                  <select id="sim238-target" class="inv-edit-input">
                    <option id="sim238-target-first" value="enemy">${t('battlesim238.ui.enemy')}</option>
                    <option id="sim238-target-second" value="secondEnemy">${t('battlesim238.ui.second_default')}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div id="sim238-status" class="bsim-status"></div>
          <div id="sim238-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim238.btn.luck_prompt')}</span>
            <button id="sim238-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim238.btn.luck_yes')}</button>
            <button id="sim238-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim238.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim238-round" class="inv-add-btn bsim-action-primary">${t('battlesim238.btn.round')}</button>
            <button id="sim238-reset" class="inv-add-btn">${t('battlesim238.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim238-history-summary">${t('battlesim238.history.summary', { n: 0 })}</summary>
            <div id="sim238-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim238-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim238-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim238);
  document.getElementById('sim238-close').addEventListener('click', closeSim238);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim238(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim238-overlay'),
    open:  openSim238,
    close: closeSim238,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim238();
  });

  document.getElementById('sim238-round').addEventListener('click', _runRound);
  document.getElementById('sim238-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim238-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim238-luck-no').addEventListener('click', _skipLuck);

  document.getElementById('sim238-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 4;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim238.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim238-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim238-second-toggle').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    if (d.pairedCombat && d.pendingLuckQueue.length) { _renderInputs(); return; }
    d.secondEnemy.active = e.target.checked;
    if (!d.secondEnemy.active) {
      d.secondEnemy.name = '';
      d.secondEnemy.skill = 0;
      if (d.pairedCombat) { d.secondEnemy.stamina = 0; d.secondEnemy.staminaMax = 0; d.secondEnemy.target = 'enemy'; }
    }
    saveState();
    _renderInputs();
  });

  document.getElementById('sim238-second-name').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.secondEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim238-target').addEventListener('change', e => {
    const d = _data();
    if (!d || !_paired(d) || d.pendingLuckQueue.length) { if (d) _renderInputs(); return; }
    d.secondEnemy.target = e.target.value === 'secondEnemy' ? 'secondEnemy' : 'enemy';
    saveState();
  });

  _setupEnemyAutocomplete('sim238-second-name', 'sim238-second-dropdown', enemy => {
    const d = _data();
    if (!d || !d.pairedCombat || d.pendingLuckQueue.length) return;
    d.secondEnemy.name = enemy.name;
    if (enemy.attack != null) d.secondEnemy.skill = enemy.attack;
    if (enemy.hp != null) { d.secondEnemy.stamina = enemy.hp; d.secondEnemy.staminaMax = enemy.hp; }
    saveState();
    _renderAll();
  }, () => { const d = _data(); return !!d?.pairedCombat && !d.pendingLuckQueue.length; });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim238-player-skill':      ['player', 'skill'],
    'sim238-player-skillmax':   ['player', 'skillInitial'],
    'sim238-player-stamina':    ['player', 'stamina'],
    'sim238-player-staminamax': ['player', 'staminaInitial'],
    'sim238-player-luck':       ['player', 'luck'],
    'sim238-player-luckmax':    ['player', 'luckInitial'],
    'sim238-player-atkmod':     ['player', 'attackModifier'],
    'sim238-player-yourdmg':    ['player', 'yourDamage'],
    'sim238-player-enemydmg':   ['player', 'enemyDamage'],
    'sim238-enemy-skill':       ['enemy', 'skill'],
    'sim238-enemy-stamina':     ['enemy', 'stamina'],
    'sim238-enemy-staminamax':  ['enemy', 'staminaMax'],
    'sim238-second-skill':      ['secondEnemy', 'skill'],
    'sim238-second-stamina':    ['secondEnemy', 'stamina'],
    'sim238-second-staminamax': ['secondEnemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = id === 'sim238-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim238-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim238-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim238-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim238-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim238-second-stamina') val = Math.min(val, d.secondEnemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim238-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim238-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim238-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim238-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    if (id === 'sim238-second-staminamax') d.secondEnemy.stamina = Math.min(d.secondEnemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim238-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim238-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim238-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim238-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim238-enemy-pick', 'sim238-enemy-pick-dropdown', enemy => {
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
}

function _numField(label, id, allowNegative) {

  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <div class="inv-qty-wrap">
        <button class="inv-qty-btn" data-id="${id}" data-delta="-1">−</button>
        <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="${allowNegative ? 'text' : 'numeric'}">
        <button class="inv-qty-btn" data-id="${id}" data-delta="1">+</button>
      </div>
    </div>`;
}

export { initSim238 as init, renderSim238 as render, setSim238Visible as setVisible };
