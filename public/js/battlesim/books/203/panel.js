import { POTIONS, MAX_PROVISIONS, PROVISIONS_HEAL, SIDE_WOUND_DMG } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, MAX_PROVISIONS, POTIONS, PROVISIONS_HEAL, SIDE_WOUND_DMG, SVG_SKULL, SVG_TROPHY, _appendLog, _data, _eatProvisions, _effectiveSkill, _enemyList, _enemyName, _enemyNameSafe, _firstRoundOverride, _loadEnemyList, _luckFloor, _notReady, _numField, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderItemsHtml, _renderLog, _renderStatus, _resetBattle, _resetEncounterKnobs, _roll1d6, _roll2d6, _runRound, _setupEnemyAutocomplete, _sideEnemyNameSafe, _skipLuck, _testLuck, _usePotion, apiFetch, closeSim203, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim203, openSim203, registerPanelShortcut, renderSim203, saveState, setSim203Visible, shortcutLabel, showAlert, t });
const { _data, _notReady, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _sideEnemyNameSafe, _luckFloor, _effectiveSkill, _resetEncounterKnobs, _firstRoundOverride, _runRound, _testLuck, _skipLuck, _resetBattle } = createCombat(simulatorContext);
const { _eatProvisions, _usePotion } = createEffects(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Island of the Lizard King, book 203)
// Fighting Fantasy: opposed 2d6 + SKILL; ties miss, normal wounds cost 2 STAMINA.
// Luck modifies a landed hit; narrative bonuses and unmodeled effects are entered manually.
// Round-1 precedence: Sog's helmet > Clumsiness roll > enemy automatic win > normal roll.
// The scan lacks chargen rules; standard FF defaults are assumed.
// Bone Charm floors LUCK at 7; weapon bonuses are exclusive.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Choose exactly one bottle (sec.9). Each bottle contains one measure, same
// single-use rule as books 201/202's potions.

























// Keep lifetime outcomes: admin totals require the full history.


// First-round override returns player, enemy, or null; precedence is defined above.




// Luck costs 1; Sama's Bone Charm floors remaining LUCK at 7 instead of 0.






// ── Provisions / Potions ────────────────────────────────────────────────────





// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim203-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim203.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim203.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = t('battlesim203.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim203-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim203-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim203-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim203-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
}

function _renderItemsHtml(d) {
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim203.ui.item_helmet_name')} <span class="bsim-tech-uses">(sec. 5)</span></div>
      <div class="bsim-tech-desc">${t('battlesim203.ui.item_helmet_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim203-item-helmet" class="inv-edit-check" ${d.player.hasSogsHelmet ? 'checked' : ''}> ${t('battlesim203.ui.have_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim203.ui.item_charm_name')} <span class="bsim-tech-uses">(sec. 323)</span></div>
      <div class="bsim-tech-desc">${t('battlesim203.ui.item_charm_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim203-item-charm" class="inv-edit-check" ${d.player.hasBoneCharm ? 'checked' : ''}> ${t('battlesim203.ui.have_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim203.ui.item_clumsy_name')} <span class="bsim-tech-uses">(sec. 311)</span></div>
      <div class="bsim-tech-desc">${t('battlesim203.ui.item_clumsy_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim203-item-clumsy" class="inv-edit-check" ${d.player.hasClumsinessCurse ? 'checked' : ''}> ${t('battlesim203.ui.cursed')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim203.ui.item_ring_name')} <span class="bsim-tech-uses">(sec. 297)</span></div>
      <div class="bsim-tech-desc">${t('battlesim203.ui.item_ring_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim203-item-ring" class="inv-edit-check" ${d.player.hasRingOfConfusion ? 'checked' : ''}> ${t('battlesim203.ui.wearing_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim203.ui.item_firesword_name')} <span class="bsim-tech-uses">(sec. 275)</span></div>
      <div class="bsim-tech-desc">${t('battlesim203.ui.item_firesword_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim203-item-firesword" class="inv-edit-check" ${d.player.hasFireSword ? 'checked' : ''}> ${t('battlesim203.ui.wielding_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim203.ui.item_magicsword_name')} <span class="bsim-tech-uses">(sec. 392)</span></div>
      <div class="bsim-tech-desc">${t('battlesim203.ui.item_magicsword_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim203-item-magicsword" class="inv-edit-check" ${d.player.hasMagicSword ? 'checked' : ''}> ${t('battlesim203.ui.wielding_it')}</label></div>
    </div>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim203-history-summary');
  const listEl = document.getElementById('sim203-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim203.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim203.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim203.history.won') : t('battlesim203.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim203-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim203-player-skill').value      = d.player.skill;
  document.getElementById('sim203-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim203-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim203-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim203-player-luck').value       = d.player.luck;
  document.getElementById('sim203-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim203-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim203-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim203.btn.rolled') : t('battlesim203.btn.roll');

  const potionSel = document.getElementById('sim203-potion');
  potionSel.value = d.player.potionKey;
  potionSel.disabled = d.rolled;
  document.getElementById('sim203-potion-uses').textContent = t('battlesim203.ui.uses_left', { n: d.player.potionUsesLeft });
  document.getElementById('sim203-potion-use').disabled =
    _notReady(d) || d.player.potionUsesLeft <= 0 ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);

  document.getElementById('sim203-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim203-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim203-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim203-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim203-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim203-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim203-enemy-winhits').value    = d.player.winAfterHits;
  document.getElementById('sim203-enemy-firstwin').checked = d.player.enemyAutoWinFirstRound;

  document.getElementById('sim203-paired').checked = d.pairedFight;
  document.getElementById('sim203-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim203-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim203-side-staminamax').value = d.sideEnemy.staminaMax;
  document.getElementById('sim203-side-fields').style.display = d.pairedFight ? '' : 'none';

  document.getElementById('sim203-item-list').innerHTML = _renderItemsHtml(d);

  const pendingEl = document.getElementById('sim203-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim203() {
  const overlay = document.getElementById('sim203-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim203(); return; }
  _renderAll();
}

function openSim203() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim203-overlay').classList.add('active');
}

function closeSim203() {
  document.getElementById('sim203-overlay')?.classList.remove('active');
}

export function setSim203Visible(visible) {
  const btn = document.getElementById('sim203-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim203();
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



export function initSim203() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim203-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim203-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim203.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim203-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim203.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim203.ui.skill'), 'sim203-player-skill')}
            ${_numField(t('battlesim203.ui.skill_initial'), 'sim203-player-skillmax')}
            ${_numField(t('battlesim203.ui.stamina'), 'sim203-player-stamina')}
            ${_numField(t('battlesim203.ui.stamina_initial'), 'sim203-player-staminamax')}
            ${_numField(t('battlesim203.ui.luck'), 'sim203-player-luck')}
            ${_numField(t('battlesim203.ui.luck_initial'), 'sim203-player-luckmax')}
            ${_numField(t('battlesim203.ui.atkmod'), 'sim203-player-atkmod')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim203.ui.potion')}</span>
              <select id="sim203-potion" class="inv-edit-input bsim-select">
                ${POTIONS.map(p => `<option value="${p[0]}">${escapeHtml(t(p[1]))}</option>`).join('')}
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span id="sim203-potion-uses" class="bsim-ae-display"></span>
              <button id="sim203-potion-use" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim203.btn.drink')}</button>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim203.ui.provisions')}</span>
              <span id="sim203-provisions-left" class="bsim-ae-display"></span>
              <button id="sim203-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim203.btn.provisions_eat', { n: PROVISIONS_HEAL })}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim203.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim203.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim203-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim203-enemy-pick-dropdown">
                <ul id="sim203-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim203.ui.skill'), 'sim203-enemy-skill')}
            ${_numField(t('battlesim203.ui.stamina'), 'sim203-enemy-stamina')}
            ${_numField(t('battlesim203.ui.stamina_max'), 'sim203-enemy-staminamax')}
            ${_numField(t('battlesim203.ui.wound_dmg'), 'sim203-enemy-wounddmg')}
            ${_numField(t('battlesim203.ui.win_after_hits'), 'sim203-enemy-winhits')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim203-enemy-firstwin" class="inv-edit-check"> ${t('battlesim203.ui.enemy_firstwin_toggle')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim203-paired" class="inv-edit-check"> ${t('battlesim203.ui.paired_toggle')}</label>
            </div>
            <div id="sim203-side-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim203.ui.pick')}</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim203-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim203-side-pick-dropdown">
                  <ul id="sim203-side-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField(t('battlesim203.ui.skill'), 'sim203-side-skill')}
              ${_numField(t('battlesim203.ui.stamina_max'), 'sim203-side-staminamax')}
            </div>
          </div>
          <div id="sim203-status" class="bsim-status"></div>
          <div id="sim203-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim203.btn.luck_prompt')}</span>
            <button id="sim203-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim203.btn.luck_yes')}</button>
            <button id="sim203-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim203.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim203-round" class="inv-add-btn bsim-action-primary">${t('battlesim203.btn.round')}</button>
            <button id="sim203-reset" class="inv-add-btn">${t('battlesim203.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>${t('battlesim203.ui.items')}</summary>
            <div id="sim203-item-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim203-history-summary">${t('battlesim203.history.summary', { n: 0 })}</summary>
            <div id="sim203-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim203-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim203-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim203);
  document.getElementById('sim203-close').addEventListener('click', closeSim203);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim203(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim203-overlay'),
    open:  openSim203,
    close: closeSim203,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim203();
  });

  document.getElementById('sim203-round').addEventListener('click', _runRound);
  document.getElementById('sim203-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim203-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim203-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim203-provisions').addEventListener('click', _eatProvisions);
  document.getElementById('sim203-potion-use').addEventListener('click', _usePotion);

  document.getElementById('sim203-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim203.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim203-potion').addEventListener('change', e => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.potionKey = e.target.value;
    saveState();
  });

  document.getElementById('sim203-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim203-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim203-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim203-enemy-firstwin').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.enemyAutoWinFirstRound = e.target.checked;
    saveState();
  });

  const ITEM_CHECKBOX_MAP = {
    'sim203-item-helmet':     'hasSogsHelmet',
    'sim203-item-charm':      'hasBoneCharm',
    'sim203-item-clumsy':     'hasClumsinessCurse',
    'sim203-item-ring':       'hasRingOfConfusion',
    'sim203-item-firesword':  'hasFireSword',
    'sim203-item-magicsword': 'hasMagicSword',
  };
  document.getElementById('sim203-item-list').addEventListener('change', e => {
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
    'sim203-player-skill':      ['player', 'skill'],
    'sim203-player-skillmax':   ['player', 'skillInitial'],
    'sim203-player-stamina':    ['player', 'stamina'],
    'sim203-player-staminamax': ['player', 'staminaInitial'],
    'sim203-player-luck':       ['player', 'luck'],
    'sim203-player-luckmax':    ['player', 'luckInitial'],
    'sim203-player-atkmod':     ['player', 'attackModifier'],
    'sim203-enemy-skill':       ['enemy', 'skill'],
    'sim203-enemy-stamina':        ['enemy', 'stamina'],
    'sim203-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim203-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim203-enemy-winhits':        ['player', 'winAfterHits'],
    'sim203-side-skill':        ['sideEnemy', 'skill'],
    'sim203-side-staminamax':   ['sideEnemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Only attack modifiers may be negative; LUCK bottoms at 7 with Sama's charm, otherwise 0.
    val = id === 'sim203-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim203-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim203-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim203-player-luck') val = Math.max(_luckFloor(d), Math.min(val, d.player.luckInitial));
    if (id === 'sim203-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim203-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim203-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim203-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim203-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim203-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim203-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim203-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim203-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim203-enemy-pick', 'sim203-enemy-pick-dropdown', enemy => {
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
  _setupEnemyAutocomplete('sim203-side-pick', 'sim203-side-pick-dropdown', enemy => {
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

export { initSim203 as init, renderSim203 as render, setSim203Visible as setVisible };
