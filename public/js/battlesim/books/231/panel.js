import { POTIONS, MAX_PROVISIONS, PROVISIONS_HEAL, SIDE_WOUND_DMG } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, MAX_PROVISIONS, POTIONS, PROVISIONS_HEAL, SIDE_WOUND_DMG, SVG_SKULL, SVG_TROPHY, _appendLog, _data, _eatProvisions, _effectiveSkill, _enemyList, _enemyName, _enemyNameSafe, _loadEnemyList, _notReady, _numField, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderItemsHtml, _renderLog, _renderStatus, _resetBattle, _resetEncounterKnobs, _roll1d6, _roll2d6, _roll2d6Detailed, _runRound, _setupEnemyAutocomplete, _sideEnemyNameSafe, _skipLuck, _testLuck, _threshold, _usePotion, apiFetch, closeSim231, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim231, openSim231, registerPanelShortcut, renderSim231, saveState, setSim231Visible, shortcutLabel, showAlert, t });
const { _data, _notReady, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _roll1d6, _roll2d6Detailed, _roll2d6, _enemyName, _enemyNameSafe, _sideEnemyNameSafe, _effectiveSkill, _threshold, _resetEncounterKnobs, _runRound, _testLuck, _skipLuck, _resetBattle } = createCombat(simulatorContext);
const { _eatProvisions, _usePotion } = createEffects(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Daggers of Darkness, book 231)
// Fighting Fantasy: opposed 2d6 + SKILL; ties miss, normal wounds cost 2 STAMINA.
// Luck modifies a landed hit; narrative bonuses and unmodeled effects are entered manually.
// Darkness, Necromancer level, and other encounter overrides reset per enemy.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Choose exactly one bottle (sec.9's front-matter intro). Each bottle
// contains one measure, same single-use rule as books 201/202/203's potions.

// Necromancer mode replaces base SKILL; darkness subtracts 2 unless Darkfight is held.

// Keep lifetime outcomes: admin totals require the full history.

// ── Combat ───────────────────────────────────────────────────────────────────

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome.

// ── Provisions / Potions ────────────────────────────────────────────────────

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim231-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  const threshold = _threshold(d);
  if (notReady)                                       el.innerHTML = t('battlesim231.status.not_ready');
  else if (d.player.stamina <= threshold)              el.innerHTML = t('battlesim231.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= threshold)    el.innerHTML = t('battlesim231.status.victory', { trophy: SVG_TROPHY });
  else                                                  el.innerHTML = '';
  const over = notReady || d.player.stamina <= threshold || (hasEnemy && d.enemy.stamina <= threshold);
  document.getElementById('sim231-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim231-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim231-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim231-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > threshold && d.enemy.stamina > threshold);
}

function _renderItemsHtml(d) {
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim231.ui.item_darkfight_name')} <span class="bsim-tech-uses">(sec. 218)</span></div>
      <div class="bsim-tech-desc">${t('battlesim231.ui.item_darkfight_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim231-item-darkfight" class="inv-edit-check" ${d.player.hasDarkfight ? 'checked' : ''}> ${t('battlesim231.ui.have_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim231.ui.item_necro_name')} <span class="bsim-tech-uses">(sec. 266)</span></div>
      <div class="bsim-tech-desc">${t('battlesim231.ui.item_necro_desc')}</div>
      <div class="bsim-tech-footer">${_numField(t('battlesim231.ui.item_necro_field'), 'sim231-item-necro')}</div>
    </div>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim231-history-summary');
  const listEl = document.getElementById('sim231-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim231.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim231.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim231.history.won') : t('battlesim231.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim231-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim231-player-skill').value      = d.player.skill;
  document.getElementById('sim231-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim231-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim231-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim231-player-luck').value       = d.player.luck;
  document.getElementById('sim231-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim231-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim231-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim231.btn.rolled') : t('battlesim231.btn.roll');

  const potionSel = document.getElementById('sim231-potion');
  potionSel.value = d.player.potionKey;
  potionSel.disabled = d.rolled;
  document.getElementById('sim231-potion-uses').textContent = t('battlesim231.ui.uses_left', { n: d.player.potionUsesLeft });
  document.getElementById('sim231-potion-use').disabled =
    _notReady(d) || d.player.potionUsesLeft <= 0 ||
    (d.roundsThisBattle > 0 && d.player.stamina > _threshold(d) && d.enemy.stamina > _threshold(d));

  document.getElementById('sim231-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim231-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim231-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim231-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim231-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim231-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim231-enemy-winhits').value    = d.player.winAfterHits;
  document.getElementById('sim231-enemy-firstwin').checked = d.player.enemyAutoWinFirstRound;
  document.getElementById('sim231-enemy-drawthreshold').value = d.player.drawThreshold;
  document.getElementById('sim231-enemy-darkness').checked = d.player.darknessFight;
  document.getElementById('sim231-enemy-necro').checked = d.player.useNecromancerLevel;
  document.getElementById('sim231-enemy-double1').checked = d.player.doubleOneDrowns;

  document.getElementById('sim231-paired').checked = d.pairedFight;
  document.getElementById('sim231-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim231-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim231-side-staminamax').value = d.sideEnemy.staminaMax;
  document.getElementById('sim231-side-fields').style.display = d.pairedFight ? '' : 'none';

  document.getElementById('sim231-item-list').innerHTML = _renderItemsHtml(d);
  const necroField = document.getElementById('sim231-item-necro');
  if (necroField) necroField.value = d.player.necromancerLevel;

  const pendingEl = document.getElementById('sim231-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim231() {
  const overlay = document.getElementById('sim231-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim231(); return; }
  _renderAll();
}

function openSim231() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim231-overlay').classList.add('active');
}

function closeSim231() {
  document.getElementById('sim231-overlay')?.classList.remove('active');
}

export function setSim231Visible(visible) {
  const btn = document.getElementById('sim231-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim231();
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

export function initSim231() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim231-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim231-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim231.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim231-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim231.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim231.ui.skill'), 'sim231-player-skill')}
            ${_numField(t('battlesim231.ui.skill_initial'), 'sim231-player-skillmax')}
            ${_numField(t('battlesim231.ui.stamina'), 'sim231-player-stamina')}
            ${_numField(t('battlesim231.ui.stamina_initial'), 'sim231-player-staminamax')}
            ${_numField(t('battlesim231.ui.luck'), 'sim231-player-luck')}
            ${_numField(t('battlesim231.ui.luck_initial'), 'sim231-player-luckmax')}
            ${_numField(t('battlesim231.ui.atkmod'), 'sim231-player-atkmod')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim231.ui.potion')}</span>
              <select id="sim231-potion" class="inv-edit-input bsim-select">
                ${POTIONS.map(p => `<option value="${p[0]}">${escapeHtml(t(p[1]))}</option>`).join('')}
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span id="sim231-potion-uses" class="bsim-ae-display"></span>
              <button id="sim231-potion-use" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim231.btn.drink')}</button>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim231.ui.provisions')}</span>
              <span id="sim231-provisions-left" class="bsim-ae-display"></span>
              <button id="sim231-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim231.btn.provisions_eat', { n: PROVISIONS_HEAL })}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim231.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim231.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim231-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim231-enemy-pick-dropdown">
                <ul id="sim231-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim231.ui.skill'), 'sim231-enemy-skill')}
            ${_numField(t('battlesim231.ui.stamina'), 'sim231-enemy-stamina')}
            ${_numField(t('battlesim231.ui.stamina_max'), 'sim231-enemy-staminamax')}
            ${_numField(t('battlesim231.ui.wound_dmg'), 'sim231-enemy-wounddmg')}
            ${_numField(t('battlesim231.ui.win_after_hits'), 'sim231-enemy-winhits')}
            ${_numField(t('battlesim231.ui.draw_threshold'), 'sim231-enemy-drawthreshold')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim231-enemy-firstwin" class="inv-edit-check"> ${t('battlesim231.ui.enemy_firstwin_toggle')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim231-enemy-darkness" class="inv-edit-check"> ${t('battlesim231.ui.darkness_toggle')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim231-enemy-necro" class="inv-edit-check"> ${t('battlesim231.ui.necro_toggle')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim231-enemy-double1" class="inv-edit-check"> ${t('battlesim231.ui.double1_toggle')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim231-paired" class="inv-edit-check"> ${t('battlesim231.ui.paired_toggle')}</label>
            </div>
            <div id="sim231-side-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim231.ui.pick')}</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim231-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim231-side-pick-dropdown">
                  <ul id="sim231-side-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField(t('battlesim231.ui.skill'), 'sim231-side-skill')}
              ${_numField(t('battlesim231.ui.stamina_max'), 'sim231-side-staminamax')}
            </div>
          </div>
          <details class="bsim-history" open>
            <summary>${t('battlesim231.ui.items')}</summary>
            <div id="sim231-item-list" class="bsim-tech-list"></div>
          </details>
          <div id="sim231-status" class="bsim-status"></div>
          <div id="sim231-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim231.btn.luck_prompt')}</span>
            <button id="sim231-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim231.btn.luck_yes')}</button>
            <button id="sim231-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim231.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim231-round" class="inv-add-btn bsim-action-primary">${t('battlesim231.btn.round')}</button>
            <button id="sim231-reset" class="inv-add-btn">${t('battlesim231.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim231-history-summary">${t('battlesim231.history.summary', { n: 0 })}</summary>
            <div id="sim231-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim231-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim231-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim231);
  document.getElementById('sim231-close').addEventListener('click', closeSim231);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim231(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim231-overlay'),
    open:  openSim231,
    close: closeSim231,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim231();
  });

  document.getElementById('sim231-round').addEventListener('click', _runRound);
  document.getElementById('sim231-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim231-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim231-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim231-provisions').addEventListener('click', _eatProvisions);
  document.getElementById('sim231-potion-use').addEventListener('click', _usePotion);

  document.getElementById('sim231-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim231.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim231-potion').addEventListener('change', e => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.potionKey = e.target.value;
    saveState();
  });

  document.getElementById('sim231-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim231-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim231-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim231-enemy-firstwin').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.enemyAutoWinFirstRound = e.target.checked;
    saveState();
  });
  document.getElementById('sim231-enemy-darkness').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.darknessFight = e.target.checked;
    saveState();
  });
  document.getElementById('sim231-enemy-necro').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.useNecromancerLevel = e.target.checked;
    saveState();
  });
  document.getElementById('sim231-enemy-double1').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.doubleOneDrowns = e.target.checked;
    saveState();
  });

  const ITEM_CHECKBOX_MAP = {
    'sim231-item-darkfight': 'hasDarkfight',
  };
  document.getElementById('sim231-item-list').addEventListener('change', e => {
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
    'sim231-player-skill':      ['player', 'skill'],
    'sim231-player-skillmax':   ['player', 'skillInitial'],
    'sim231-player-stamina':    ['player', 'stamina'],
    'sim231-player-staminamax': ['player', 'staminaInitial'],
    'sim231-player-luck':       ['player', 'luck'],
    'sim231-player-luckmax':    ['player', 'luckInitial'],
    'sim231-player-atkmod':     ['player', 'attackModifier'],
    'sim231-enemy-skill':       ['enemy', 'skill'],
    'sim231-enemy-stamina':        ['enemy', 'stamina'],
    'sim231-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim231-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim231-enemy-winhits':        ['player', 'winAfterHits'],
    'sim231-enemy-drawthreshold':  ['player', 'drawThreshold'],
    'sim231-item-necro':           ['player', 'necromancerLevel'],
    'sim231-side-skill':        ['sideEnemy', 'skill'],
    'sim231-side-staminamax':   ['sideEnemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Allow negative attack modifiers; other fields stay non-negative.
    val = id === 'sim231-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim231-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim231-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim231-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim231-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim231-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim231-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim231-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim231-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  // Item fields are rebuilt by rendering, so bind numeric controls on the overlay.
  overlay.addEventListener('input', e => {
    const input = e.target;
    if (!input.matches('.inv-qty-input') || !FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim231-player-atkmod';
    const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
    if (raw !== input.value) input.value = raw;
    _applyField(input.id, Number(raw) || 0);
  });
  overlay.addEventListener('click', e => {
    const btnEl = e.target.closest('.inv-qty-btn');
    if (!btnEl || !FIELD_MAP[btnEl.dataset.id]) return;
    const input = document.getElementById(btnEl.dataset.id);
    if (!input) return;
    const allowNegative = btnEl.dataset.id === 'sim231-player-atkmod';
    const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
    _applyField(btnEl.dataset.id, next);
  });

  _setupEnemyAutocomplete('sim231-enemy-pick', 'sim231-enemy-pick-dropdown', enemy => {
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
  _setupEnemyAutocomplete('sim231-side-pick', 'sim231-side-pick-dropdown', enemy => {
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

export { initSim231 as init, renderSim231 as render, setSim231Visible as setVisible };
