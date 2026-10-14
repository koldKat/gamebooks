import { HEALING_POTION_HEAL, COMBAT_TABLE, VICTORY_ROUTES, DEADLINES } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, COMBAT_TABLE, DEADLINES, HEALING_POTION_HEAL, SVG_SKULL, SVG_TROPHY, VICTORY_ROUTES, _appendLog, _captureFightEffects, _checkBattleEnd, _data, _effectiveSkill, _enemyList, _enemyName, _enemyNameSafe, _escapeRoute, _loadEnemyList, _numField, _pick10, _pickRow, _ratioCol, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _resetBattle, _runRound, _setVal, _setupAutocomplete, _stopFight, _usePotion, apiFetch, closeSim440, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim440, openSim440, registerPanelShortcut, renderSim440, saveState, setSim440Visible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _effectiveSkill, _stopFight, _escapeRoute, _runRound, _checkBattleEnd, _resetBattle } = createCombat(simulatorContext);
const { _usePotion } = createEffects(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Забраненият град / The Forbidden City, Bulgarian edition of Grey Star (World of
// Lone Wolf) book 2, id 440)
// Combat Ratio is fixed on enemy selection; a 0-9 pick selects simultaneous table losses.
// Saved fights retain their rules; printed effects are captured for future fights.

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
  _setVal('sim440-cs', d.combatSkill);
  _setVal('sim440-csmax', d.combatSkillInitial);
  _setVal('sim440-en', d.endurance);
  _setVal('sim440-enmax', d.enduranceInitial);
  _setVal('sim440-atkmod', d.attackModifier);
  _setVal('sim440-will', d.willpower ?? 0);
  _setVal('sim440-willmax', d.willpowerInitial ?? 0);
  _setVal('sim440-will-spend', d.nextWillSpend ?? 1);
  _setVal('sim440-weapon', d.nextWeapon || 'staff');
  document.getElementById('sim440-dagger').checked = d.nextDagger === true;
  document.getElementById('sim440-has-potion').checked = d.hasHealingPotion === true;
  _setVal('sim440-enemy-skill', d.enemy.skill);
  _setVal('sim440-enemy-en', d.enemy.endurance);
  _setVal('sim440-enemy-enmax', d.enemy.enduranceMax);
  _setVal('sim440-ratio', d.ratio);
  if (!skipEnemyPick) _setVal('sim440-enemy-pick', d.enemy.name);

  const potionBtn = document.getElementById('sim440-use-potion');
  potionBtn.disabled = !d.rolled || !d.hasHealingPotion || d.healingPotionUsed || (d.printedRules === 1 && d.endurance <= 0);
  potionBtn.textContent = d.healingPotionUsed ? t('battlesim440.btn.used') : t('battlesim440.btn.drink');

  const rollBtn = document.getElementById('sim440-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim440.btn.rolled') : t('battlesim440.btn.roll');

  const status = document.getElementById('sim440-status');
  if (!d.rolled) {
    status.textContent = t('battlesim440.status.not_ready');
  } else if (d.endurance <= 0) {
    status.textContent = t('battlesim440.status.fallen');
  } else if (d.combatEffects?.finished && d.combatEffects.routes.length) {
    status.textContent = t('battlesim440.log.continue', { sections: d.combatEffects.routes.join(' / ') });
  } else if (d.enemy.endurance <= 0 && d.enemy.enduranceMax > 0) {
    status.textContent = t('battlesim440.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim440-round').disabled = !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0 || d.combatEffects?.finished;
  const escapeBtn = document.getElementById('sim440-escape');
  escapeBtn.hidden = !_escapeRoute(d);
  escapeBtn.disabled = !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim440-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim440-history-summary');
  const listEl = document.getElementById('sim440-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim440.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim440.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim440.history.won') : t('battlesim440.history.lost');
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

export function renderSim440() {
  const overlay = document.getElementById('sim440-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim440(); return; }
  _renderAll();
}

function openSim440() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim440-overlay').classList.add('active');
}

function closeSim440() {
  document.getElementById('sim440-overlay')?.classList.remove('active');
}

export function setSim440Visible(visible) {
  const btn = document.getElementById('sim440-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim440();
}

// ── Init ──────────────────────────────────────────────────────────────────────



export function initSim440() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim440-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim440.ui.title')}</span>
        <button id="sim440-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim440-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim440.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim440.ui.cs'), 'sim440-cs')}
            ${_numField(t('battlesim440.ui.cs_initial'), 'sim440-csmax')}
            ${_numField(t('battlesim440.ui.en'), 'sim440-en')}
            ${_numField(t('battlesim440.ui.en_initial'), 'sim440-enmax')}
            ${_numField(t('battlesim440.ui.will'), 'sim440-will')}
            ${_numField(t('battlesim440.ui.will_initial'), 'sim440-willmax')}
            ${_numField(t('battlesim440.ui.atkmod'), 'sim440-atkmod')}
            <details class="bsim-history">
              <summary>${t('battlesim440.ui.next_fight')}</summary>
              <div class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim440.ui.weapon')}</span><select id="sim440-weapon" class="inv-edit-input">${['staff','other','none'].map(value => `<option value="${value}">${t('battlesim440.ui.' + value)}</option>`).join('')}</select></div>
              ${_numField(t('battlesim440.ui.will_spend'), 'sim440-will-spend')}
              <label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim440.ui.dagger')}</span><input type="checkbox" id="sim440-dagger"></label>
              <p class="bsim-history-empty">${t('battlesim440.ui.effects_note')}</p>
            </details>
            <label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim440.ui.has_potion')}</span><input type="checkbox" id="sim440-has-potion"></label>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim440.ui.potion')}</span>
              <button id="sim440-use-potion" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim440.btn.drink')}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim440.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim440-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim440-enemy-pick-dropdown">
                <ul id="sim440-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim440.ui.enemy_cs'), 'sim440-enemy-skill')}
            ${_numField(t('battlesim440.ui.enemy_en'), 'sim440-enemy-en')}
            ${_numField(t('battlesim440.ui.enemy_en_max'), 'sim440-enemy-enmax')}
            ${_numField(t('battlesim440.ui.ratio'), 'sim440-ratio', null, true)}
          </div>
          <div id="sim440-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim440-round" class="inv-add-btn bsim-action-primary">${t('battlesim440.btn.round')}</button>
            <button id="sim440-escape" class="inv-add-btn" hidden>${t('battlesim440.btn.escape')}</button>
            <button id="sim440-reset" class="inv-add-btn">${t('battlesim440.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim440-history-summary">${t('battlesim440.history.summary', { n: 0 })}</summary>
            <div id="sim440-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim440-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim440-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim440);
  document.getElementById('sim440-close').addEventListener('click', closeSim440);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim440(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim440-overlay'),
    open:  openSim440,
    close: closeSim440,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim440();
  });

  document.getElementById('sim440-round').addEventListener('click', _runRound);
  document.getElementById('sim440-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim440-use-potion').addEventListener('click', _usePotion);
  document.getElementById('sim440-escape').addEventListener('click', () => _runRound(true));
  document.getElementById('sim440-weapon').addEventListener('change', e => {
    const d = _data(); if (!d) return;
    d.nextWeapon = e.target.value; saveState();
  });
  for (const [id, key] of [['dagger','nextDagger'], ['has-potion','hasHealingPotion']]) document.getElementById('sim440-' + id).addEventListener('change', e => {
    const d = _data(); if (!d) return;
    d[key] = e.target.checked; saveState(); _renderInputs(true);
  });

  document.getElementById('sim440-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.combatSkillInitial = _pick10() + 10;
    if (d.printedRules === 1) {
      d.willpowerInitial = _pick10() + 20;
      d.willpower = d.willpowerInitial;
    }
    d.enduranceInitial   = _pick10() + 20;
    d.combatSkill = d.combatSkillInitial;
    d.endurance   = d.enduranceInitial;
    d.rolled = true;
    if (d.printedRules === 1 && d.combatEffects) _captureFightEffects(d);
    d.ratio  = _effectiveSkill(d) - d.enemy.skill;
    _appendLog(d, t(d.printedRules === 1 ? 'battlesim440.log.rolled_future' : 'battlesim440.log.rolled', { cs: d.combatSkillInitial, en: d.enduranceInitial, will: d.willpowerInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim440-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim440-enemy-pick', 'sim440-enemy-pick-dropdown', enemy => {
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
    'sim440-cs': ['combatSkill'], 'sim440-csmax': ['combatSkillInitial'],
    'sim440-en': ['endurance'], 'sim440-enmax': ['enduranceInitial'],
    'sim440-atkmod': ['attackModifier'],
    'sim440-will': ['willpower'], 'sim440-willmax': ['willpowerInitial'],
    'sim440-will-spend': ['nextWillSpend'],
    'sim440-enemy-skill': ['enemy', 'skill'], 'sim440-enemy-en': ['enemy', 'endurance'], 'sim440-enemy-enmax': ['enemy', 'enduranceMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const allowNegative = id === 'sim440-atkmod' || id === 'sim440-will';
      const number = id === 'sim440-en' || id === 'sim440-will' ? parseFloat(input.value) : parseInt(input.value, 10);
      const val = allowNegative ? (number || 0) : Math.max(0, number || 0);
      if (path.length === 1) d[path[0]] = val;
      else d[path[0]][path[1]] = val;
      if (id === 'sim440-cs' || id === 'sim440-atkmod' || id === 'sim440-enemy-skill' || id === 'sim440-will') d.ratio = _effectiveSkill(d) - d.enemy.skill;
      saveState();
      _renderInputs(true);
    });
  }
  overlay.querySelectorAll('.inv-qty-btn').forEach(btn2 => {
    btn2.addEventListener('click', () => {
      const input = document.getElementById(btn2.dataset.id);
      if (!input) return;
      const delta = parseInt(btn2.dataset.delta, 10);
      input.value = (parseFloat(input.value) || 0) + delta;
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

export { initSim440 as init, renderSim440 as render, setSim440Visible as setVisible };
