import { HEALING_POTION_HEAL, COMBAT_TABLE, ENCOUNTER_RULES } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, ENCOUNTER_RULES, COMBAT_TABLE, HEALING_POTION_HEAL, SVG_SKULL, SVG_TROPHY, _appendLog, _battleOver, _captureFightEffects, _checkBattleEnd, _data, _effectiveSkill, _enemyList, _enemyName, _enemyNameSafe, _escape, _escapeRoute, _loadEnemyList, _numField, _pick10, _pickRow, _psychic, _ratioCol, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _resetBattle, _rulesFor, _runRound, _setRoute, _setVal, _setupAutocomplete, _usePotion, apiFetch, closeSim436, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim436, openSim436, registerPanelShortcut, renderSim436, saveState, setSim436Visible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _recordOutcome, _battleOver } = createState(simulatorContext);
const { _rulesFor, _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _psychic, _effectiveSkill, _setRoute, _escapeRoute, _escape, _runRound, _checkBattleEnd, _resetBattle } = createCombat(simulatorContext);
const { _usePotion } = createEffects(simulatorContext);
// END SIMULATOR WIRING
// Jungle of Horrors: encounter rules are captured only for newly started fights.

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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">БУ:${e.attack ?? '?'} ТИ:${e.hp ?? '?'}</span></li>`
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
  _setVal('sim436-cs', d.combatSkill);
  _setVal('sim436-csmax', d.combatSkillInitial);
  _setVal('sim436-en', d.endurance);
  _setVal('sim436-enmax', d.enduranceInitial);
  _setVal('sim436-atkmod', d.attackModifier);
  _setVal('sim436-psychic', d.nextPsychic || 'none');
  for (const [id, key] of [['tracking','nextTracking'],['animal','nextAnimal'],['shield','nextShield'],['spirit','nextSpirit'],['curing','nextCuring'],['nexus','nextNexus'],['primate','nextPrimate'],['tutelary','nextTutelary']]) {
    const input = document.getElementById('sim436-' + id);
    if (input) input.checked = !!d[key];
  }
  _setVal('sim436-enemy-skill', d.enemy.skill);
  _setVal('sim436-enemy-en', d.enemy.endurance);
  _setVal('sim436-enemy-enmax', d.enemy.enduranceMax);
  _setVal('sim436-ratio', d.combatEffects?.captured ? _effectiveSkill(d) - d.enemy.skill : d.ratio);
  if (!skipEnemyPick || !!_rulesFor(d.combatEffects?.section).secondEnemy) _setVal('sim436-enemy-pick', d.enemy.name);

  const potionBtn = document.getElementById('sim436-use-potion');
  potionBtn.disabled = !d.rolled || !d.hasHealingPotion || d.healingPotionUsed;
  if (d.printedRules) potionBtn.disabled ||= d.endurance <= 0 || d.roundsThisBattle > 0 && !_battleOver(d);
  potionBtn.textContent = d.healingPotionUsed ? t('battlesim436.btn.used') : t('battlesim436.btn.drink');

  const rollBtn = document.getElementById('sim436-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim436.btn.rolled') : t('battlesim436.btn.roll');

  const status = document.getElementById('sim436-status');
  if (!d.rolled) {
    status.textContent = t('battlesim436.status.not_ready');
  } else if (d.endurance <= 0) {
    status.textContent = t('battlesim436.status.fallen');
  } else if (d.combatEffects?.finished) {
    status.textContent = t('battlesim436.log.continue', { section: d.combatEffects.route });
  } else if (d.enemy.endurance <= 0 && d.enemy.enduranceMax > 0) {
    status.textContent = t('battlesim436.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim436-round').disabled = _battleOver(d);
  const escapeBtn = document.getElementById('sim436-escape');
  if (escapeBtn) escapeBtn.disabled = _battleOver(d) || !_escapeRoute(d);
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim436-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim436-history-summary');
  const listEl = document.getElementById('sim436-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim436.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim436.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim436.history.won') : t('battlesim436.history.lost');
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

export function renderSim436() {
  const overlay = document.getElementById('sim436-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim436(); return; }
  _renderAll();
}

function openSim436() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim436-overlay').classList.add('active');
}

function closeSim436() {
  document.getElementById('sim436-overlay')?.classList.remove('active');
}

export function setSim436Visible(visible) {
  const btn = document.getElementById('sim436-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim436();
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initSim436() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim436-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim436.ui.title')}</span>
        <button id="sim436-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim436-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim436.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim436.ui.cs'), 'sim436-cs')}
            ${_numField(t('battlesim436.ui.cs_initial'), 'sim436-csmax')}
            ${_numField(t('battlesim436.ui.en'), 'sim436-en')}
            ${_numField(t('battlesim436.ui.en_initial'), 'sim436-enmax')}
            ${_numField(t('battlesim436.ui.atkmod'), 'sim436-atkmod')}
            <details class="bsim-history">
              <summary>${t('battlesim436.ui.next_fight')}</summary>
              <p class="bsim-history-empty">${t('battlesim436.ui.effects_hint')}</p>
              <div class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim436.ui.psychic')}</span><select id="sim436-psychic" class="inv-edit-input"><option value="none">${t('battlesim436.ui.none')}</option><option value="blast">${t('battlesim436.ui.blast')}</option><option value="surge">${t('battlesim436.ui.surge')}</option></select></div>
              ${['tracking','animal','shield','spirit','curing','nexus','primate','tutelary'].map(id => `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim436.ui.' + id)}</span><input type="checkbox" id="sim436-${id}"></label>`).join('')}
            </details>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim436.ui.potion')}</span>
              <button id="sim436-use-potion" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim436.btn.drink')}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim436.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim436-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim436-enemy-pick-dropdown">
                <ul id="sim436-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim436.ui.enemy_cs'), 'sim436-enemy-skill')}
            ${_numField(t('battlesim436.ui.enemy_en'), 'sim436-enemy-en')}
            ${_numField(t('battlesim436.ui.enemy_en_max'), 'sim436-enemy-enmax')}
            ${_numField(t('battlesim436.ui.ratio'), 'sim436-ratio', null, true)}
          </div>
          <div id="sim436-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim436-round" class="inv-add-btn bsim-action-primary">${t('battlesim436.btn.round')}</button>
            <button id="sim436-escape" class="inv-add-btn">${t('battlesim436.btn.escape')}</button>
            <button id="sim436-reset" class="inv-add-btn">${t('battlesim436.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim436-history-summary">${t('battlesim436.history.summary', { n: 0 })}</summary>
            <div id="sim436-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim436-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim436-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim436);
  document.getElementById('sim436-close').addEventListener('click', closeSim436);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim436(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim436-overlay'),
    open:  openSim436,
    close: closeSim436,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim436();
  });

  document.getElementById('sim436-round').addEventListener('click', _runRound);
  document.getElementById('sim436-escape').addEventListener('click', _escape);
  document.getElementById('sim436-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim436-use-potion').addEventListener('click', _usePotion);
  document.getElementById('sim436-psychic').addEventListener('change', event => {
    const d = _data();
    if (!d) return;
    d.nextPsychic = ['none','blast','surge'].includes(event.target.value) ? event.target.value : 'none';
    saveState();
  });
  for (const [id, key] of [['tracking','nextTracking'],['animal','nextAnimal'],['shield','nextShield'],['spirit','nextSpirit'],['curing','nextCuring'],['nexus','nextNexus'],['primate','nextPrimate'],['tutelary','nextTutelary']]) {
    document.getElementById('sim436-' + id).addEventListener('change', event => {
      const d = _data();
      if (!d) return;
      d[key] = event.target.checked;
      saveState();
    });
  }

  document.getElementById('sim436-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.combatSkillInitial = _pick10() + 10;
    d.enduranceInitial   = _pick10() + 20;
    d.combatSkill = d.combatSkillInitial;
    d.endurance   = d.enduranceInitial;
    d.rolled = true;
    d.ratio  = _effectiveSkill(d) - d.enemy.skill;
    _appendLog(d, t('battlesim436.log.rolled', { cs: d.combatSkillInitial, en: d.enduranceInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim436-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim436-enemy-pick', 'sim436-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name          = enemy.name;
    d.enemy.skill          = enemy.attack ?? 0;
    d.enemy.endurance      = enemy.hp ?? 0;
    d.enemy.enduranceMax   = enemy.hp ?? 0;
    d.roundsThisBattle     = 0;
    _captureFightEffects(d);
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim436-cs': ['combatSkill'], 'sim436-csmax': ['combatSkillInitial'],
    'sim436-en': ['endurance'], 'sim436-enmax': ['enduranceInitial'],
    'sim436-atkmod': ['attackModifier'],
    'sim436-enemy-skill': ['enemy', 'skill'], 'sim436-enemy-en': ['enemy', 'endurance'], 'sim436-enemy-enmax': ['enemy', 'enduranceMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const allowNegative = id === 'sim436-atkmod';
      const parse = d.printedRules && id === 'sim436-en' ? parseFloat : value => parseInt(value, 10);
      const val = allowNegative ? (parse(input.value) || 0) : Math.max(0, parse(input.value) || 0);
      if (path.length === 1) d[path[0]] = val;
      else d[path[0]][path[1]] = val;
      if (id === 'sim436-cs' || id === 'sim436-atkmod' || id === 'sim436-enemy-skill') d.ratio = _effectiveSkill(d) - d.enemy.skill;
      saveState();
      _renderInputs(true);
    });
  }
  overlay.querySelectorAll('.inv-qty-btn').forEach(btn2 => {
    btn2.addEventListener('click', () => {
      const input = document.getElementById(btn2.dataset.id);
      if (!input) return;
      const delta = parseInt(btn2.dataset.delta, 10);
      const d = _data();
      const value = d?.printedRules && btn2.dataset.id === 'sim436-en' ? parseFloat(input.value) : parseInt(input.value, 10);
      input.value = (value || 0) + delta;
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

export { initSim436 as init, renderSim436 as render, setSim436Visible as setVisible };
