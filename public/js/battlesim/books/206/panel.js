import { FIRESPRITE_LUCKY_DMG, FIRESPRITE_UNLUCKY_DMG, FIRESPRITE_BASELINE_DMG, GHOUL_PARALYSIS_THRESHOLD } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, FIRESPRITE_BASELINE_DMG, FIRESPRITE_LUCKY_DMG, FIRESPRITE_UNLUCKY_DMG, GHOUL_PARALYSIS_THRESHOLD, SVG_SKULL, SVG_TROPHY, _appendLog, _checkGhoulParalysis, _data, _effectiveSkill, _enemyFloor, _enemyList, _enemyName, _enemyNameSafe, _krisBonus, _loadEnemyList, _notReady, _numField, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderItemsHtml, _renderLog, _renderStatus, _resetBattle, _resetEncounterKnobs, _roll1d6, _roll2d6, _runRound, _setupEnemyAutocomplete, _skipLuck, _testLuck, apiFetch, closeSim206, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim206, openSim206, registerPanelShortcut, renderSim206, saveState, setSim206Visible, shortcutLabel, showAlert, t });
const { _data, _notReady, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _krisBonus, _effectiveSkill, _resetEncounterKnobs, _enemyFloor, _runRound, _checkGhoulParalysis, _testLuck, _skipLuck, _resetBattle } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (House of Hell, book 206)
// Fighting Fantasy: opposed 2d6 + SKILL; ties miss, normal wounds cost 2 STAMINA.
// Luck modifies a landed hit; narrative bonuses and unmodeled effects are entered manually.
// Start unarmed at Initial SKILL-3; weapon bonuses stay uncapped despite source ambiguity.
// FEAR is tracked separately; encounter modifiers reset with enemy selection.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;


















// Kris Knife: +3 against Drumer/Franklins, +6 against the Hell Demon, otherwise 0; do not cap it.






// Keep lifetime outcomes: admin totals require the full history.


// ── Combat ───────────────────────────────────────────────────────────────────





// The Ghoul's fourth wound causes immediate paralysis/death; return true to avoid recording loss twice.


// Use standard Luck adjustments except for the Fire Sprite's replacement-damage event.






// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim206-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  const floor = _enemyFloor(d);
  const frightened = d.player.fearMax > 0 && d.player.fear >= d.player.fearMax;
  if (notReady)                                    el.innerHTML = t('battlesim206.status.not_ready');
  else if (frightened)                             el.innerHTML = t('battlesim206.status.frightened', { skull: SVG_SKULL });
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim206.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= floor)     el.innerHTML = t('battlesim206.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || frightened || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= floor);
  document.getElementById('sim206-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim206-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim206-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim206-history-summary');
  const listEl = document.getElementById('sim206-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim206.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim206.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim206.history.won') : t('battlesim206.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim206-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderItemsHtml(d) {
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim206.ui.item_branch_name')} <span class="bsim-tech-uses">(sec. 50)</span></div>
      <div class="bsim-tech-desc">${t('battlesim206.ui.item_branch_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim206-item-branch" class="inv-edit-check" ${d.player.hasWoodenBranch ? 'checked' : ''}> ${t('battlesim206.ui.wielding_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim206.ui.item_letteropener_name')} <span class="bsim-tech-uses">(sec. 81)</span></div>
      <div class="bsim-tech-desc">${t('battlesim206.ui.item_letteropener_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim206-item-letteropener" class="inv-edit-check" ${d.player.hasLetterOpener ? 'checked' : ''}> ${t('battlesim206.ui.wielding_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim206.ui.item_meatknife_name')} <span class="bsim-tech-uses">(sec. 83)</span></div>
      <div class="bsim-tech-desc">${t('battlesim206.ui.item_meatknife_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim206-item-meatknife" class="inv-edit-check" ${d.player.hasMeatKnife ? 'checked' : ''}> ${t('battlesim206.ui.wielding_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim206.ui.item_dagger_name')} <span class="bsim-tech-uses">(sec. 192)</span></div>
      <div class="bsim-tech-desc">${t('battlesim206.ui.item_dagger_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim206-item-dagger" class="inv-edit-check" ${d.player.hasSilverDagger ? 'checked' : ''}> ${t('battlesim206.ui.wielding_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim206.ui.item_kris_name')} <span class="bsim-tech-uses">(sec. 35)</span></div>
      <div class="bsim-tech-desc">${t('battlesim206.ui.item_kris_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim206-item-kris" class="inv-edit-check" ${d.player.hasKrisKnife ? 'checked' : ''}> ${t('battlesim206.ui.wielding_it')}</label></div>
    </div>`;
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim206-player-skill').value        = d.player.skill;
  document.getElementById('sim206-player-skillstarting').value = d.player.skillStarting;
  document.getElementById('sim206-player-skillmax').value     = d.player.skillInitial;
  document.getElementById('sim206-player-stamina').value      = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim206-player-staminamax').value   = d.player.staminaInitial;
  document.getElementById('sim206-player-luck').value         = d.player.luck;
  document.getElementById('sim206-player-luckmax').value      = d.player.luckInitial;
  document.getElementById('sim206-player-fear').value         = d.player.fear;
  document.getElementById('sim206-player-fearmax').value      = d.player.fearMax;
  document.getElementById('sim206-player-atkmod').value       = d.player.attackModifier;

  const rollBtn = document.getElementById('sim206-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim206.btn.rolled') : t('battlesim206.btn.roll');

  document.getElementById('sim206-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim206-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim206-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim206-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim206-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim206-enemy-winhits').value    = d.player.winAfterHits;
  document.getElementById('sim206-enemy-floor').value      = d.player.enemyStaminaFloor;
  document.getElementById('sim206-enemy-firesprite').checked = d.player.fireSpriteWound;
  document.getElementById('sim206-enemy-ghoul').checked     = d.player.ghoulWoundCounter;
  document.getElementById('sim206-ghoul-count').textContent = d.player.ghoulWoundCounter ? t('battlesim206.ui.ghoul_count', { n: d.player.woundEventsThisFight, max: GHOUL_PARALYSIS_THRESHOLD }) : '';

  document.getElementById('sim206-item-list').innerHTML = _renderItemsHtml(d);

  const pendingEl = document.getElementById('sim206-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim206() {
  const overlay = document.getElementById('sim206-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim206(); return; }
  _renderAll();
}

function openSim206() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim206-overlay').classList.add('active');
}

function closeSim206() {
  document.getElementById('sim206-overlay')?.classList.remove('active');
}

export function setSim206Visible(visible) {
  const btn = document.getElementById('sim206-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim206();
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



export function initSim206() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim206-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim206-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim206.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim206-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim206.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim206.ui.skill'), 'sim206-player-skill')}
            ${_numField(t('battlesim206.ui.skill_starting'), 'sim206-player-skillstarting')}
            ${_numField(t('battlesim206.ui.skill_initial'), 'sim206-player-skillmax')}
            ${_numField(t('battlesim206.ui.stamina'), 'sim206-player-stamina')}
            ${_numField(t('battlesim206.ui.stamina_initial'), 'sim206-player-staminamax')}
            ${_numField(t('battlesim206.ui.luck'), 'sim206-player-luck')}
            ${_numField(t('battlesim206.ui.luck_initial'), 'sim206-player-luckmax')}
            ${_numField(t('battlesim206.ui.fear'), 'sim206-player-fear')}
            ${_numField(t('battlesim206.ui.fear_max'), 'sim206-player-fearmax')}
            ${_numField(t('battlesim206.ui.atkmod'), 'sim206-player-atkmod')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim206.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim206.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim206-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim206-enemy-pick-dropdown">
                <ul id="sim206-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim206.ui.skill'), 'sim206-enemy-skill')}
            ${_numField(t('battlesim206.ui.stamina'), 'sim206-enemy-stamina')}
            ${_numField(t('battlesim206.ui.stamina_max'), 'sim206-enemy-staminamax')}
            ${_numField(t('battlesim206.ui.wound_dmg'), 'sim206-enemy-wounddmg')}
            ${_numField(t('battlesim206.ui.win_after_hits'), 'sim206-enemy-winhits')}
            ${_numField(t('battlesim206.ui.stamina_floor'), 'sim206-enemy-floor')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim206-enemy-firesprite" class="inv-edit-check"> ${t('battlesim206.ui.firesprite_toggle', { baseline: FIRESPRITE_BASELINE_DMG, lucky: FIRESPRITE_LUCKY_DMG, unlucky: FIRESPRITE_UNLUCKY_DMG })}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim206-enemy-ghoul" class="inv-edit-check"> ${t('battlesim206.ui.ghoul_toggle', { n: GHOUL_PARALYSIS_THRESHOLD })} <span id="sim206-ghoul-count" class="bsim-ae-display"></span></label>
            </div>
          </div>
          <div id="sim206-status" class="bsim-status"></div>
          <div id="sim206-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim206.btn.luck_prompt')}</span>
            <button id="sim206-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim206.btn.luck_yes')}</button>
            <button id="sim206-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim206.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim206-round" class="inv-add-btn bsim-action-primary">${t('battlesim206.btn.round')}</button>
            <button id="sim206-reset" class="inv-add-btn">${t('battlesim206.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>${t('battlesim206.ui.items')}</summary>
            <div id="sim206-item-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim206-history-summary">${t('battlesim206.history.summary', { n: 0 })}</summary>
            <div id="sim206-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim206-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim206-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim206);
  document.getElementById('sim206-close').addEventListener('click', closeSim206);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim206(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim206-overlay'),
    open:  openSim206,
    close: closeSim206,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim206();
  });

  document.getElementById('sim206-round').addEventListener('click', _runRound);
  document.getElementById('sim206-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim206-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim206-luck-no').addEventListener('click', _skipLuck);

  document.getElementById('sim206-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.skillStarting  = d.player.skillInitial - 3;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.fearMax        = _roll1d6() + 6;
    d.player.skill   = d.player.skillStarting;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.player.fear    = 0;
    d.rolled = true;
    _appendLog(d, t('battlesim206.log.rolled', { skill: d.player.skillInitial, starting: d.player.skillStarting, stamina: d.player.staminaInitial, luck: d.player.luckInitial, fearMax: d.player.fearMax }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim206-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim206-enemy-firesprite').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.fireSpriteWound = e.target.checked;
    saveState();
  });
  document.getElementById('sim206-enemy-ghoul').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.ghoulWoundCounter = e.target.checked;
    if (!e.target.checked) d.player.woundEventsThisFight = 0;
    saveState();
    _renderInputs();
  });

  const ITEM_CHECKBOX_MAP = {
    'sim206-item-branch':       'hasWoodenBranch',
    'sim206-item-letteropener': 'hasLetterOpener',
    'sim206-item-meatknife':    'hasMeatKnife',
    'sim206-item-dagger':       'hasSilverDagger',
    'sim206-item-kris':         'hasKrisKnife',
  };
  document.getElementById('sim206-item-list').addEventListener('change', e => {
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
    'sim206-player-skill':         ['player', 'skill'],
    'sim206-player-skillstarting': ['player', 'skillStarting'],
    'sim206-player-skillmax':      ['player', 'skillInitial'],
    'sim206-player-stamina':       ['player', 'stamina'],
    'sim206-player-staminamax':    ['player', 'staminaInitial'],
    'sim206-player-luck':          ['player', 'luck'],
    'sim206-player-luckmax':       ['player', 'luckInitial'],
    'sim206-player-fear':          ['player', 'fear'],
    'sim206-player-fearmax':       ['player', 'fearMax'],
    'sim206-player-atkmod':        ['player', 'attackModifier'],
    'sim206-enemy-skill':          ['enemy', 'skill'],
    'sim206-enemy-stamina':        ['enemy', 'stamina'],
    'sim206-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim206-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim206-enemy-winhits':        ['player', 'winAfterHits'],
    'sim206-enemy-floor':          ['player', 'enemyStaminaFloor'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Allow negative attack modifiers; other fields stay non-negative.
    val = id === 'sim206-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim206-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim206-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim206-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim206-player-fear') val = Math.min(val, d.player.fearMax || 9999);
    if (id === 'sim206-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim206-enemy-floor') val = Math.min(val, d.enemy.staminaMax || 9999);
    d[map[0]][map[1]] = val;
    if (id === 'sim206-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim206-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim206-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim206-player-fearmax') d.player.fear = Math.min(d.player.fear, val);
    if (id === 'sim206-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim206-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim206-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim206-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim206-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim206-enemy-pick', 'sim206-enemy-pick-dropdown', enemy => {
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

export { initSim206 as init, renderSim206 as render, setSim206Visible as setVisible };
