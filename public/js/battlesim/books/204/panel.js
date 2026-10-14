import { SCORE_LABELS, HEALING_POWDER_HEAL, SIDE_WOUND_DMG } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, HEALING_POWDER_HEAL, SCORE_LABELS, SIDE_WOUND_DMG, SVG_SKULL, SVG_TROPHY, _appendLog, _data, _effectiveSkill, _enemyFloor, _enemyList, _enemyName, _enemyNameSafe, _loadEnemyList, _notReady, _numField, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderItemsHtml, _renderLog, _renderStatus, _resetBattle, _resetEncounterKnobs, _roll2d6, _runRound, _setupEnemyAutocomplete, _sideEnemy2NameSafe, _sideEnemyNameSafe, _skipLuck, _testLuck, _useHealingPowder, _useMistressPotion, apiFetch, closeSim204, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim204, openSim204, registerPanelShortcut, renderSim204, saveState, setSim204Visible, shortcutLabel, showAlert, t });
const { _data, _notReady, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _roll2d6, _enemyName, _enemyNameSafe, _sideEnemyNameSafe, _sideEnemy2NameSafe, _effectiveSkill, _resetEncounterKnobs, _enemyFloor, _runRound, _testLuck, _skipLuck, _resetBattle } = createCombat(simulatorContext);
const { _useHealingPowder, _useMistressPotion } = createEffects(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Scorpion Swamp, book 204)
// Fighting Fantasy: opposed 2d6 + SKILL; ties miss, normal wounds cost 2 STAMINA.
// Luck modifies a landed hit; narrative bonuses and unmodeled effects are entered manually.
// Provisions have no source quantity/healing rule and are not modeled.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;






















// Keep lifetime outcomes: admin totals require the full history.


// ── Combat ───────────────────────────────────────────────────────────────────





// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome. Same
// Lucky/Unlucky table as every other FF sim in this app.






// ── Consumables ─────────────────────────────────────────────────────────────





// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim204-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  const floor = _enemyFloor(d);
  if (notReady)                                    el.innerHTML = t('battlesim204.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim204.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= floor)     el.innerHTML = t('battlesim204.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= floor);
  document.getElementById('sim204-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim204-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim204-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
}

function _renderItemsHtml(d) {
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim204.ui.item_helmet_name')} <span class="bsim-tech-uses">(sec. 219)</span></div>
      <div class="bsim-tech-desc">${t('battlesim204.ui.item_helmet_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim204-item-helmet" class="inv-edit-check" ${d.player.hasRangerHelmet ? 'checked' : ''}> ${t('battlesim204.ui.have_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim204.ui.item_giftsword_name')} <span class="bsim-tech-uses">(sec. 241)</span></div>
      <div class="bsim-tech-desc">${t('battlesim204.ui.item_giftsword_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim204-item-giftsword" class="inv-edit-check" ${d.player.hasGiftSword ? 'checked' : ''}> ${t('battlesim204.ui.wielding_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim204.ui.item_jaggedsword_name')} <span class="bsim-tech-uses">(sec. 140/340)</span></div>
      <div class="bsim-tech-desc">${t('battlesim204.ui.item_jaggedsword_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim204-item-jaggedsword" class="inv-edit-check" ${d.player.hasJaggedSword ? 'checked' : ''}> ${t('battlesim204.ui.wielding_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim204.ui.item_powder_name')} <span class="bsim-tech-uses">(sec. 246/67)</span></div>
      <div class="bsim-tech-desc">${t('battlesim204.ui.item_powder_desc', { n: HEALING_POWDER_HEAL })}</div>
      <div class="bsim-tech-footer">
        <label class="inv-edit-check-label"><input type="checkbox" id="sim204-item-powder" class="inv-edit-check" ${d.player.hasHealingPowder ? 'checked' : ''}> ${t('battlesim204.ui.have_it')}</label>
        <button id="sim204-use-powder" class="inv-edit-done bsim-ae-roll-btn" type="button" ${(!d.player.hasHealingPowder || d.player.healingPowderUsed) ? 'disabled' : ''}>${d.player.healingPowderUsed ? t('battlesim204.btn.used') : t('battlesim204.btn.use')}</button>
      </div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim204.ui.item_mistress_name')} <span class="bsim-tech-uses">(sec. 164)</span></div>
      <div class="bsim-tech-desc">${t('battlesim204.ui.item_mistress_desc')}</div>
      <div class="bsim-tech-footer">
        <label class="inv-edit-check-label"><input type="checkbox" id="sim204-item-mistress" class="inv-edit-check" ${d.player.hasMistressPotion ? 'checked' : ''}> ${t('battlesim204.ui.have_it')}</label>
        <select id="sim204-mistress-score" class="inv-edit-input bsim-select" ${(!d.player.hasMistressPotion || d.player.mistressPotionUsed) ? 'disabled' : ''}>
          <option value="skill" ${d.player.mistressPotionScore === 'skill' ? 'selected' : ''}>${t('battlesim204.ui.skill')}</option>
          <option value="stamina" ${d.player.mistressPotionScore === 'stamina' ? 'selected' : ''}>${t('battlesim204.ui.stamina')}</option>
          <option value="luck" ${d.player.mistressPotionScore === 'luck' ? 'selected' : ''}>${t('battlesim204.ui.luck')}</option>
        </select>
        <button id="sim204-use-mistress" class="inv-edit-done bsim-ae-roll-btn" type="button" ${(!d.player.hasMistressPotion || d.player.mistressPotionUsed) ? 'disabled' : ''}>${d.player.mistressPotionUsed ? t('battlesim204.btn.used') : t('battlesim204.btn.drink')}</button>
      </div>
    </div>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim204-history-summary');
  const listEl = document.getElementById('sim204-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim204.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim204.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim204.history.won') : t('battlesim204.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim204-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim204-player-skill').value      = d.player.skill;
  document.getElementById('sim204-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim204-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim204-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim204-player-luck').value       = d.player.luck;
  document.getElementById('sim204-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim204-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim204-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim204.btn.rolled') : t('battlesim204.btn.roll');

  document.getElementById('sim204-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim204-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim204-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim204-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim204-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim204-enemy-winhits').value    = d.player.winAfterHits;
  document.getElementById('sim204-enemy-floor').value      = d.player.enemyStaminaFloor;

  document.getElementById('sim204-paired').checked = d.pairedFight;
  document.getElementById('sim204-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim204-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim204-side-staminamax').value = d.sideEnemy.staminaMax;
  document.getElementById('sim204-side-fields').style.display = d.pairedFight ? '' : 'none';

  document.getElementById('sim204-triple').checked = d.tripleFight;
  document.getElementById('sim204-triple-row').style.display = d.pairedFight ? '' : 'none';
  document.getElementById('sim204-side2-pick').value = d.sideEnemy2.name;
  document.getElementById('sim204-side2-skill').value = d.sideEnemy2.skill;
  document.getElementById('sim204-side2-staminamax').value = d.sideEnemy2.staminaMax;
  document.getElementById('sim204-side2-fields').style.display = (d.pairedFight && d.tripleFight) ? '' : 'none';

  document.getElementById('sim204-item-list').innerHTML = _renderItemsHtml(d);

  const pendingEl = document.getElementById('sim204-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim204() {
  const overlay = document.getElementById('sim204-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim204(); return; }
  _renderAll();
}

function openSim204() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim204-overlay').classList.add('active');
}

function closeSim204() {
  document.getElementById('sim204-overlay')?.classList.remove('active');
}

export function setSim204Visible(visible) {
  const btn = document.getElementById('sim204-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim204();
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



export function initSim204() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim204-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim204-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim204.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim204-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim204.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim204.ui.skill'), 'sim204-player-skill')}
            ${_numField(t('battlesim204.ui.skill_initial'), 'sim204-player-skillmax')}
            ${_numField(t('battlesim204.ui.stamina'), 'sim204-player-stamina')}
            ${_numField(t('battlesim204.ui.stamina_initial'), 'sim204-player-staminamax')}
            ${_numField(t('battlesim204.ui.luck'), 'sim204-player-luck')}
            ${_numField(t('battlesim204.ui.luck_initial'), 'sim204-player-luckmax')}
            ${_numField(t('battlesim204.ui.atkmod'), 'sim204-player-atkmod')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim204.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim204.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim204-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim204-enemy-pick-dropdown">
                <ul id="sim204-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim204.ui.skill'), 'sim204-enemy-skill')}
            ${_numField(t('battlesim204.ui.stamina'), 'sim204-enemy-stamina')}
            ${_numField(t('battlesim204.ui.stamina_max'), 'sim204-enemy-staminamax')}
            ${_numField(t('battlesim204.ui.wound_dmg'), 'sim204-enemy-wounddmg')}
            ${_numField(t('battlesim204.ui.win_after_hits'), 'sim204-enemy-winhits')}
            ${_numField(t('battlesim204.ui.stamina_floor'), 'sim204-enemy-floor')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim204-paired" class="inv-edit-check"> ${t('battlesim204.ui.paired_toggle')}</label>
            </div>
            <div id="sim204-side-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim204.ui.pick')}</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim204-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim204-side-pick-dropdown">
                  <ul id="sim204-side-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField(t('battlesim204.ui.skill'), 'sim204-side-skill')}
              ${_numField(t('battlesim204.ui.stamina_max'), 'sim204-side-staminamax')}
              <div id="sim204-triple-row" class="inv-edit-row" style="display:none">
                <label class="inv-edit-check-label"><input type="checkbox" id="sim204-triple" class="inv-edit-check"> ${t('battlesim204.ui.triple_toggle')}</label>
              </div>
              <div id="sim204-side2-fields" style="display:none">
                <div class="inv-edit-row">
                  <span class="inv-edit-label bsim-stat-label">${t('battlesim204.ui.pick')}</span>
                  <div class="autocomplete-wrap bsim-enemy-ac">
                    <input id="sim204-side2-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim204-side2-pick-dropdown">
                    <ul id="sim204-side2-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                  </div>
                </div>
                ${_numField(t('battlesim204.ui.skill'), 'sim204-side2-skill')}
                ${_numField(t('battlesim204.ui.stamina_max'), 'sim204-side2-staminamax')}
              </div>
            </div>
          </div>
          <div id="sim204-status" class="bsim-status"></div>
          <div id="sim204-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim204.btn.luck_prompt')}</span>
            <button id="sim204-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim204.btn.luck_yes')}</button>
            <button id="sim204-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim204.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim204-round" class="inv-add-btn bsim-action-primary">${t('battlesim204.btn.round')}</button>
            <button id="sim204-reset" class="inv-add-btn">${t('battlesim204.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>${t('battlesim204.ui.items')}</summary>
            <div id="sim204-item-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim204-history-summary">${t('battlesim204.history.summary', { n: 0 })}</summary>
            <div id="sim204-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim204-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim204-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim204);
  document.getElementById('sim204-close').addEventListener('click', closeSim204);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim204(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim204-overlay'),
    open:  openSim204,
    close: closeSim204,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim204();
  });

  document.getElementById('sim204-round').addEventListener('click', _runRound);
  document.getElementById('sim204-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim204-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim204-luck-no').addEventListener('click', _skipLuck);

  document.getElementById('sim204-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = 1 + Math.floor(Math.random() * 6) + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = 1 + Math.floor(Math.random() * 6) + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim204.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim204-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim204-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim204-side2-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy2.name = e.target.value;
    saveState();
  });

  document.getElementById('sim204-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    if (!d.pairedFight) d.tripleFight = false;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim204-triple').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.tripleFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim204-item-list').addEventListener('click', e => {
    if (e.target.id === 'sim204-use-powder') _useHealingPowder();
    else if (e.target.id === 'sim204-use-mistress') _useMistressPotion();
  });

  const ITEM_CHECKBOX_MAP = {
    'sim204-item-helmet':      'hasRangerHelmet',
    'sim204-item-giftsword':   'hasGiftSword',
    'sim204-item-jaggedsword': 'hasJaggedSword',
    'sim204-item-powder':      'hasHealingPowder',
    'sim204-item-mistress':    'hasMistressPotion',
  };
  document.getElementById('sim204-item-list').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    if (e.target.id === 'sim204-mistress-score') {
      d.player.mistressPotionScore = e.target.value;
      saveState();
      return;
    }
    const key = ITEM_CHECKBOX_MAP[e.target.id];
    if (!key) return;
    d.player[key] = e.target.checked;
    saveState();
    _renderInputs();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim204-player-skill':      ['player', 'skill'],
    'sim204-player-skillmax':   ['player', 'skillInitial'],
    'sim204-player-stamina':    ['player', 'stamina'],
    'sim204-player-staminamax': ['player', 'staminaInitial'],
    'sim204-player-luck':       ['player', 'luck'],
    'sim204-player-luckmax':    ['player', 'luckInitial'],
    'sim204-player-atkmod':     ['player', 'attackModifier'],
    'sim204-enemy-skill':       ['enemy', 'skill'],
    'sim204-enemy-stamina':        ['enemy', 'stamina'],
    'sim204-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim204-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim204-enemy-winhits':        ['player', 'winAfterHits'],
    'sim204-enemy-floor':          ['player', 'enemyStaminaFloor'],
    'sim204-side-skill':        ['sideEnemy', 'skill'],
    'sim204-side-staminamax':   ['sideEnemy', 'staminaMax'],
    'sim204-side2-skill':       ['sideEnemy2', 'skill'],
    'sim204-side2-staminamax':  ['sideEnemy2', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Allow negative attack modifiers; other fields stay non-negative.
    val = id === 'sim204-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim204-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim204-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim204-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim204-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim204-enemy-floor') val = Math.min(val, d.enemy.staminaMax || 9999);
    d[map[0]][map[1]] = val;
    if (id === 'sim204-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim204-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim204-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim204-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim204-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim204-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim204-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim204-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim204-enemy-pick', 'sim204-enemy-pick-dropdown', enemy => {
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
  _setupEnemyAutocomplete('sim204-side-pick', 'sim204-side-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy.staminaMax = enemy.hp;
    saveState();
    _renderAll();
  });
  _setupEnemyAutocomplete('sim204-side2-pick', 'sim204-side2-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy2.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy2.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy2.staminaMax = enemy.hp;
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

export { initSim204 as init, renderSim204 as render, setSim204Visible as setVisible };
