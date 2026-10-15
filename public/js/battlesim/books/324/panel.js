import { HEALING_POTION_HEAL, COMBAT_TABLE } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, COMBAT_TABLE, HEALING_POTION_HEAL, SVG_SKULL, SVG_TROPHY, _appendLog, _checkBattleEnd, _data, _effectiveSkill, _enemyList, _enemyName, _enemyNameSafe, _loadEnemyList, _numField, _pick10, _pickRow, _ratioCol, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _resetBattle, _runRound, _setVal, _setupAutocomplete, _usePotion, apiFetch, closeSim324, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim324, openSim324, registerPanelShortcut, renderSim324, saveState, setSim324Visible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _effectiveSkill, _runRound, _checkBattleEnd, _resetBattle } = createCombat(simulatorContext);
const { _usePotion } = createEffects(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (The Chasm of Doom, Lone Wolf book 4, id 324)
// Combat Ratio is fixed on enemy selection; a 0-9 pick selects simultaneous table losses.
// 'K' means instant death. Skill bonuses and narrative effects are entered manually.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Rows: 1-9, then 0. Columns: Combat Ratio buckets -11..11, clamped at the extremes.
// Cells are [enemyLoss, playerLoss]; K means instant death.

 // 0-9, "0 counts as zero"

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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">CS:${e.attack ?? '?'} EN:${e.hp ?? '?'}</span></li>`
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
  _setVal('sim324-cs', d.combatSkill);
  _setVal('sim324-csmax', d.combatSkillInitial);
  _setVal('sim324-en', d.endurance);
  _setVal('sim324-enmax', d.enduranceInitial);
  _setVal('sim324-atkmod', d.attackModifier);
  _setVal('sim324-enemy-skill', d.enemy.skill);
  _setVal('sim324-enemy-en', d.enemy.endurance);
  _setVal('sim324-enemy-enmax', d.enemy.enduranceMax);
  _setVal('sim324-ratio', d.ratio);
  if (!skipEnemyPick) _setVal('sim324-enemy-pick', d.enemy.name);

  const potionBtn = document.getElementById('sim324-use-potion');
  potionBtn.disabled = !d.rolled || !d.hasHealingPotion || d.healingPotionUsed;
  potionBtn.textContent = d.healingPotionUsed ? t('battlesim324.btn.used') : t('battlesim324.btn.drink');

  const rollBtn = document.getElementById('sim324-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim324.btn.rolled') : t('battlesim324.btn.roll');

  const status = document.getElementById('sim324-status');
  if (!d.rolled) {
    status.textContent = t('battlesim324.status.not_ready');
  } else if (d.endurance <= 0) {
    status.textContent = t('battlesim324.status.fallen');
  } else if (d.enemy.endurance <= 0 && d.enemy.enduranceMax > 0) {
    status.textContent = t('battlesim324.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim324-round').disabled = !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim324-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim324-history-summary');
  const listEl = document.getElementById('sim324-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim324.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim324.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim324.history.won') : t('battlesim324.history.lost');
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

export function renderSim324() {
  const overlay = document.getElementById('sim324-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim324(); return; }
  _renderAll();
}

function openSim324() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim324-overlay').classList.add('active');
}

function closeSim324() {
  document.getElementById('sim324-overlay')?.classList.remove('active');
}

export function setSim324Visible(visible) {
  const btn = document.getElementById('sim324-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim324();
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initSim324() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim324-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim324.ui.title')}</span>
        <button id="sim324-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim324-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim324.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim324.ui.cs'), 'sim324-cs')}
            ${_numField(t('battlesim324.ui.cs_initial'), 'sim324-csmax')}
            ${_numField(t('battlesim324.ui.en'), 'sim324-en')}
            ${_numField(t('battlesim324.ui.en_initial'), 'sim324-enmax')}
            ${_numField(t('battlesim324.ui.atkmod'), 'sim324-atkmod')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim324.ui.potion')}</span>
              <button id="sim324-use-potion" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim324.btn.drink')}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim324.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim324-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim324-enemy-pick-dropdown">
                <ul id="sim324-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim324.ui.enemy_cs'), 'sim324-enemy-skill')}
            ${_numField(t('battlesim324.ui.enemy_en'), 'sim324-enemy-en')}
            ${_numField(t('battlesim324.ui.enemy_en_max'), 'sim324-enemy-enmax')}
            ${_numField(t('battlesim324.ui.ratio'), 'sim324-ratio', null, true)}
          </div>
          <div id="sim324-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim324-round" class="inv-add-btn bsim-action-primary">${t('battlesim324.btn.round')}</button>
            <button id="sim324-reset" class="inv-add-btn">${t('battlesim324.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim324-history-summary">${t('battlesim324.history.summary', { n: 0 })}</summary>
            <div id="sim324-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim324-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim324-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim324);
  document.getElementById('sim324-close').addEventListener('click', closeSim324);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim324(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim324-overlay'),
    open:  openSim324,
    close: closeSim324,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim324();
  });

  document.getElementById('sim324-round').addEventListener('click', _runRound);
  document.getElementById('sim324-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim324-use-potion').addEventListener('click', _usePotion);

  document.getElementById('sim324-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.combatSkillInitial = _pick10() + 10;
    d.enduranceInitial   = _pick10() + 20;
    d.combatSkill = d.combatSkillInitial;
    d.endurance   = d.enduranceInitial;
    d.rolled = true;
    d.ratio  = _effectiveSkill(d) - d.enemy.skill;
    _appendLog(d, t('battlesim324.log.rolled', { cs: d.combatSkillInitial, en: d.enduranceInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim324-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim324-enemy-pick', 'sim324-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name          = enemy.name;
    d.enemy.skill          = enemy.attack ?? 0;
    d.enemy.endurance      = enemy.hp ?? 0;
    d.enemy.enduranceMax   = enemy.hp ?? 0;
    d.roundsThisBattle     = 0;
    d.ratio                = _effectiveSkill(d) - d.enemy.skill;
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim324-cs': ['combatSkill'], 'sim324-csmax': ['combatSkillInitial'],
    'sim324-en': ['endurance'], 'sim324-enmax': ['enduranceInitial'],
    'sim324-atkmod': ['attackModifier'],
    'sim324-enemy-skill': ['enemy', 'skill'], 'sim324-enemy-en': ['enemy', 'endurance'], 'sim324-enemy-enmax': ['enemy', 'enduranceMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const allowNegative = id === 'sim324-atkmod';
      const val = allowNegative ? (parseInt(input.value, 10) || 0) : Math.max(0, parseInt(input.value, 10) || 0);
      if (path.length === 1) d[path[0]] = val;
      else d[path[0]][path[1]] = val;
      if (id === 'sim324-cs' || id === 'sim324-atkmod' || id === 'sim324-enemy-skill') d.ratio = _effectiveSkill(d) - d.enemy.skill;
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

export { initSim324 as init, renderSim324 as render, setSim324Visible as setVisible };
