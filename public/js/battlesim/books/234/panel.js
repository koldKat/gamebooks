import { MAX_PROVISIONS, PROVISIONS_HEAL, SIDE_WOUND_DMG, DRAIN_DMG } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, DRAIN_DMG, MAX_PROVISIONS, PROVISIONS_HEAL, SIDE_WOUND_DMG, SVG_SKULL, SVG_TROPHY, _allEnemiesDown, _appendLog, _data, _eatProvisions, _effectiveSkill, _enemyList, _enemyName, _enemyNameSafe, _loadEnemyList, _notReady, _numField, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderItemsHtml, _renderLog, _renderStatus, _resetBattle, _resetEncounterKnobs, _roll1d6, _roll2d6, _runRound, _setupEnemyAutocomplete, _sideEnemyNameSafe, _skipLuck, _testLuck, apiFetch, closeSim234, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim234, openSim234, registerPanelShortcut, renderSim234, saveState, setSim234Visible, shortcutLabel, showAlert, t });
const { _data, _notReady, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _sideEnemyNameSafe, _effectiveSkill, _resetEncounterKnobs, _allEnemiesDown, _runRound, _testLuck, _skipLuck, _resetBattle } = createCombat(simulatorContext);
const { _eatProvisions } = createEffects(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Vault of the Vampire, book 234)
// Fighting Fantasy: opposed 2d6 + SKILL; ties miss, normal wounds cost 2 STAMINA.
// Luck modifies a landed hit; narrative bonuses and unmodeled effects are entered manually.
// FAITH is a reference stat, not part of Attack Strength.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;



















// Nightstar: +1 SKILL vs any creature, +2 SKILL vs a Vampire specifically
// (sec 328).




// In a three-way fight, victory requires both the main and side enemy down
// (the wolf-pair/bear+ranger encounters end only when both are dead).




// ── Combat ───────────────────────────────────────────────────────────────────









// ── Provisions ───────────────────────────────────────────────────────────────



// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim234-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim234.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim234.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && _allEnemiesDown(d))          el.innerHTML = t('battlesim234.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && _allEnemiesDown(d));
  document.getElementById('sim234-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim234-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim234-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim234-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
}

function _renderItemsHtml(d) {
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim234.ui.item_nightstar_name')} <span class="bsim-tech-uses">(sec. 328)</span></div>
      <div class="bsim-tech-desc">${t('battlesim234.ui.item_nightstar_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim234-item-nightstar" class="inv-edit-check" ${d.player.hasNightstar ? 'checked' : ''}> ${t('battlesim234.ui.have_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim234.ui.item_vsvampire_name')}</div>
      <div class="bsim-tech-desc">${t('battlesim234.ui.item_vsvampire_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim234-item-vsvampire" class="inv-edit-check" ${d.player.vsVampire ? 'checked' : ''}> ${t('battlesim234.ui.this_fight')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim234.ui.item_drain_name')}</div>
      <div class="bsim-tech-desc">${t('battlesim234.ui.item_drain_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim234-item-drain" class="inv-edit-check" ${d.player.drainEffect ? 'checked' : ''}> ${t('battlesim234.ui.this_fight')}</label></div>
    </div>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim234-history-summary');
  const listEl = document.getElementById('sim234-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim234.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim234.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim234.history.won') : t('battlesim234.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim234-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim234-player-skill').value      = d.player.skill;
  document.getElementById('sim234-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim234-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim234-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim234-player-luck').value       = d.player.luck;
  document.getElementById('sim234-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim234-player-faith').value      = d.player.faith;
  document.getElementById('sim234-player-faithmax').value   = d.player.faithInitial;
  document.getElementById('sim234-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim234-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim234.btn.rolled') : t('battlesim234.btn.roll');

  document.getElementById('sim234-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim234-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim234-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim234-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim234-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim234-enemy-wounddmg').value   = d.player.enemyWoundDamage;

  document.getElementById('sim234-paired').checked = d.pairedFight;
  document.getElementById('sim234-randomtarget').checked = d.randomTarget;
  document.getElementById('sim234-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim234-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim234-side-stamina').value = Math.min(d.sideEnemy.stamina, d.sideEnemy.staminaMax);
  document.getElementById('sim234-side-staminamax').value = d.sideEnemy.staminaMax;
  document.getElementById('sim234-side-fields').style.display = d.pairedFight ? '' : 'none';

  document.getElementById('sim234-item-list').innerHTML = _renderItemsHtml(d);

  const pendingEl = document.getElementById('sim234-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim234() {
  const overlay = document.getElementById('sim234-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim234(); return; }
  _renderAll();
}

function openSim234() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim234-overlay').classList.add('active');
}

function closeSim234() {
  document.getElementById('sim234-overlay')?.classList.remove('active');
}

export function setSim234Visible(visible) {
  const btn = document.getElementById('sim234-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim234();
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



export function initSim234() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim234-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim234-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim234.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim234-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim234.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim234.ui.skill'), 'sim234-player-skill')}
            ${_numField(t('battlesim234.ui.skill_initial'), 'sim234-player-skillmax')}
            ${_numField(t('battlesim234.ui.stamina'), 'sim234-player-stamina')}
            ${_numField(t('battlesim234.ui.stamina_initial'), 'sim234-player-staminamax')}
            ${_numField(t('battlesim234.ui.luck'), 'sim234-player-luck')}
            ${_numField(t('battlesim234.ui.luck_initial'), 'sim234-player-luckmax')}
            ${_numField(t('battlesim234.ui.faith'), 'sim234-player-faith')}
            ${_numField(t('battlesim234.ui.faith_initial'), 'sim234-player-faithmax')}
            ${_numField(t('battlesim234.ui.atkmod'), 'sim234-player-atkmod')}
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim234.ui.provisions')}</span>
              <span id="sim234-provisions-left" class="bsim-ae-display"></span>
              <button id="sim234-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim234.btn.provisions_eat', { n: PROVISIONS_HEAL })}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim234.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim234.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim234-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim234-enemy-pick-dropdown">
                <ul id="sim234-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim234.ui.skill'), 'sim234-enemy-skill')}
            ${_numField(t('battlesim234.ui.stamina'), 'sim234-enemy-stamina')}
            ${_numField(t('battlesim234.ui.stamina_max'), 'sim234-enemy-staminamax')}
            ${_numField(t('battlesim234.ui.wound_dmg'), 'sim234-enemy-wounddmg')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim234-paired" class="inv-edit-check"> ${t('battlesim234.ui.paired_toggle')}</label>
            </div>
            <div id="sim234-side-fields" style="display:none">
              <div class="inv-edit-row">
                <label class="inv-edit-check-label"><input type="checkbox" id="sim234-randomtarget" class="inv-edit-check"> ${t('battlesim234.ui.randomtarget_toggle')}</label>
              </div>
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim234.ui.pick')}</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim234-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim234-side-pick-dropdown">
                  <ul id="sim234-side-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField(t('battlesim234.ui.skill'), 'sim234-side-skill')}
              ${_numField(t('battlesim234.ui.stamina'), 'sim234-side-stamina')}
              ${_numField(t('battlesim234.ui.stamina_max'), 'sim234-side-staminamax')}
            </div>
          </div>
          <div id="sim234-status" class="bsim-status"></div>
          <div id="sim234-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim234.btn.luck_prompt')}</span>
            <button id="sim234-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim234.btn.luck_yes')}</button>
            <button id="sim234-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim234.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim234-round" class="inv-add-btn bsim-action-primary">${t('battlesim234.btn.round')}</button>
            <button id="sim234-reset" class="inv-add-btn">${t('battlesim234.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>${t('battlesim234.ui.items')}</summary>
            <div id="sim234-item-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim234-history-summary">${t('battlesim234.history.summary', { n: 0 })}</summary>
            <div id="sim234-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim234-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim234-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim234);
  document.getElementById('sim234-close').addEventListener('click', closeSim234);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim234(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim234-overlay'),
    open:  openSim234,
    close: closeSim234,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim234();
  });

  document.getElementById('sim234-round').addEventListener('click', _runRound);
  document.getElementById('sim234-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim234-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim234-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim234-provisions').addEventListener('click', _eatProvisions);

  document.getElementById('sim234-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.faithInitial   = _roll1d6() + 3;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.player.faith   = d.player.faithInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim234.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial, faith: d.player.faithInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim234-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim234-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim234-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim234-randomtarget').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.randomTarget = e.target.checked;
    saveState();
  });

  const ITEM_CHECKBOX_MAP = {
    'sim234-item-nightstar': 'hasNightstar',
    'sim234-item-vsvampire': 'vsVampire',
    'sim234-item-drain':     'drainEffect',
  };
  document.getElementById('sim234-item-list').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    const key = ITEM_CHECKBOX_MAP[e.target.id];
    if (!key) return;
    d.player[key] = e.target.checked;
    saveState();
    _renderInputs();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim234-player-skill':      ['player', 'skill'],
    'sim234-player-skillmax':   ['player', 'skillInitial'],
    'sim234-player-stamina':    ['player', 'stamina'],
    'sim234-player-staminamax': ['player', 'staminaInitial'],
    'sim234-player-luck':       ['player', 'luck'],
    'sim234-player-luckmax':    ['player', 'luckInitial'],
    'sim234-player-faith':      ['player', 'faith'],
    'sim234-player-faithmax':   ['player', 'faithInitial'],
    'sim234-player-atkmod':     ['player', 'attackModifier'],
    'sim234-enemy-skill':       ['enemy', 'skill'],
    'sim234-enemy-stamina':        ['enemy', 'stamina'],
    'sim234-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim234-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim234-side-skill':        ['sideEnemy', 'skill'],
    'sim234-side-stamina':         ['sideEnemy', 'stamina'],
    'sim234-side-staminamax':      ['sideEnemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = id === 'sim234-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim234-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim234-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim234-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim234-player-faith') val = Math.min(val, d.player.faithInitial);
    if (id === 'sim234-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim234-side-stamina') val = Math.min(val, d.sideEnemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim234-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim234-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim234-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim234-player-faithmax') d.player.faith = Math.min(d.player.faith, val);
    if (id === 'sim234-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    if (id === 'sim234-side-staminamax') d.sideEnemy.stamina = Math.min(d.sideEnemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim234-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim234-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim234-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim234-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim234-enemy-pick', 'sim234-enemy-pick-dropdown', enemy => {
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
  _setupEnemyAutocomplete('sim234-side-pick', 'sim234-side-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy.skill = enemy.attack;
    if (enemy.hp != null)     { d.sideEnemy.stamina = enemy.hp; d.sideEnemy.staminaMax = enemy.hp; }
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

export { initSim234 as init, renderSim234 as render, setSim234Visible as setVisible };
