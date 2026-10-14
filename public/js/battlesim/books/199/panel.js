import { SPELLS, MAGIK_DOSES } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, MAGIK_DOSES, SPELLS, SPELL_LABELS, SVG_SKULL, SVG_TROPHY, _appendLog, _castSpell, _data, _effectiveSkill, _enemyList, _enemyName, _enemyNameSafe, _loadEnemyList, _notReady, _numField, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderItemsHtml, _renderLog, _renderSpellsHtml, _renderStatus, _resetBattle, _roll1d6, _roll2d6, _runRound, _setupEnemyAutocomplete, _skipLuck, _testLuck, _useMagikPotion, apiFetch, closeSim199, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim199, openSim199, registerPanelShortcut, renderSim199, saveState, setSim199Visible, shortcutLabel, showAlert, t });
const { _data, _notReady, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _roll2d6, _roll1d6, _effectiveSkill, _enemyName, _enemyNameSafe, _runRound, _testLuck, _skipLuck, _resetBattle } = createCombat(simulatorContext);
const { _castSpell, _useMagikPotion } = createEffects(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (The Citadel of Chaos, book 199)
// Fighting Fantasy: opposed 2d6 + SKILL; ties miss, normal wounds cost 2 STAMINA.
// Luck modifies a landed hit; narrative bonuses and unmodeled effects are entered manually.
// MAGIC is a spell budget; restoration spells are automated, other spells only consume uses.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// restore spells refill by floor(Initial/2), capped at Initial; manual spells only consume/log uses.











// Stack Sun-Sword (+4 SKILL, sec 345) and enchanted sword (+2 Attack Strength, sec 353) bonuses.







// Keep lifetime outcomes: admin totals require the full history.


// ── Combat ───────────────────────────────────────────────────────────────────



// Luck costs 1: own hits become 4/1 damage; incoming hits become 1/3 damage (lucky/unlucky).






// ── Spells ───────────────────────────────────────────────────────────────────

const SPELL_LABELS = Object.fromEntries(SPELLS.map(([key, label]) => [key, label]));



// Potion of Magik (sec 235) has two doses, each permanently adding one spell cast.


// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim199-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  // Require staminaMax>0 to distinguish a defeated enemy from an empty slot.
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim199.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim199.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = t('battlesim199.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim199-round').disabled = over || !!d.pendingLuck;
  document.getElementById('sim199-luck-yes').disabled = notReady || !d.pendingLuck || d.player.luck <= 0;
  document.getElementById('sim199-luck-no').disabled  = notReady || !d.pendingLuck;
}

function _renderItemsHtml(d) {
  const notReady = _notReady(d);
  const magikLeft = MAGIK_DOSES - d.player.magikUsed;
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim199.ui.item_sunsword_name')} <span class="bsim-tech-uses">(sec. 345)</span></div>
      <div class="bsim-tech-desc">${t('battlesim199.ui.item_sunsword_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim199-item-sunsword" class="inv-edit-check" ${d.player.hasSunSword ? 'checked' : ''}> ${t('battlesim199.ui.have_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim199.ui.item_enchantedsword_name')} <span class="bsim-tech-uses">(sec. 353)</span></div>
      <div class="bsim-tech-desc">${t('battlesim199.ui.item_enchantedsword_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim199-item-enchantedsword" class="inv-edit-check" ${d.player.hasEnchantedSword ? 'checked' : ''}> ${t('battlesim199.ui.have_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim199.ui.item_magik_name')} <span class="bsim-tech-uses">(sec. 235)</span></div>
      <div class="bsim-tech-desc">${t('battlesim199.ui.item_magik_desc', { n: MAGIK_DOSES })}</div>
      <div class="bsim-tech-footer">
        <label class="inv-edit-check-label"><input type="checkbox" id="sim199-item-magik-have" class="inv-edit-check" ${d.player.magikHave ? 'checked' : ''}> ${t('battlesim199.ui.have_it')}</label>
        <span class="bsim-tech-uses${(notReady || !d.player.magikHave || magikLeft <= 0) ? ' bsim-tech-row--depleted' : ''}">${t('battlesim199.ui.left', { n: Math.max(0, magikLeft) })}</span>
        <button class="inv-edit-done bsim-tech-btn${(notReady || !d.player.magikHave || magikLeft <= 0) ? ' bsim-tech-row--depleted' : ''}" id="sim199-item-magik-use" ${(notReady || !d.player.magikHave || magikLeft <= 0) ? 'disabled' : ''}>${magikLeft <= 0 ? t('battlesim199.btn.used') : t('battlesim199.btn.drink')}</button>
      </div>
    </div>`;
}

function _renderSpellsHtml(d) {
  const notReady = _notReady(d);
  return SPELLS.map(([key, label]) => {
    const s = d.player.spells[key];
    const left = Math.max(0, s.have - s.used);
    const depleted = left <= 0 || d.player.magic <= 0;
    return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${escapeHtml(t(label))}</div>
      <div class="bsim-tech-footer">
        <div class="inv-qty-wrap">
          <button class="inv-qty-btn" data-id="sim199-spell-${key}-have" data-delta="-1">−</button>
          <input id="sim199-spell-${key}-have" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
          <button class="inv-qty-btn" data-id="sim199-spell-${key}-have" data-delta="1">+</button>
        </div>
        <span class="bsim-tech-uses${depleted ? ' bsim-tech-row--depleted' : ''}">${t('battlesim199.ui.left', { n: left })}</span>
        <button class="inv-edit-done bsim-tech-btn${depleted ? ' bsim-tech-row--depleted' : ''}" data-cast="${key}" ${(notReady || depleted) ? 'disabled' : ''}>${t('battlesim199.btn.cast')}</button>
      </div>
    </div>`;
  }).join('');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim199-history-summary');
  const listEl = document.getElementById('sim199-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim199.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim199.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim199.history.won') : t('battlesim199.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim199-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim199-player-skill').value      = d.player.skill;
  document.getElementById('sim199-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim199-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim199-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim199-player-luck').value       = d.player.luck;
  document.getElementById('sim199-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim199-player-magic').value      = d.player.magic;
  document.getElementById('sim199-player-magicmax').value   = d.player.magicInitial;

  const rollBtn = document.getElementById('sim199-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim199.btn.rolled') : t('battlesim199.btn.roll');

  document.getElementById('sim199-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim199-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim199-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim199-enemy-staminamax').value = d.enemy.staminaMax;

  document.getElementById('sim199-item-list').innerHTML = _renderItemsHtml(d);
  document.getElementById('sim199-spell-list').innerHTML = _renderSpellsHtml(d);
  for (const [key] of SPELLS) {
    const el = document.getElementById(`sim199-spell-${key}-have`);
    if (el) el.value = d.player.spells[key].have;
  }
  const allocated = SPELLS.reduce((sum, [key]) => sum + d.player.spells[key].have, 0);
  const hintEl = document.getElementById('sim199-spell-hint');
  if (hintEl) {
    hintEl.textContent = d.rolled
      ? t('battlesim199.ui.spell_hint_rolled', { allocated, max: d.player.magicInitial })
      : t('battlesim199.ui.spell_hint_not_rolled');
  }

  const pendingEl = document.getElementById('sim199-luck-prompt');
  pendingEl.style.display = d.pendingLuck ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim199() {
  const overlay = document.getElementById('sim199-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim199(); return; }
  _renderAll();
}

function openSim199() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim199-overlay').classList.add('active');
}

function closeSim199() {
  document.getElementById('sim199-overlay')?.classList.remove('active');
}

export function setSim199Visible(visible) {
  const btn = document.getElementById('sim199-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim199();
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

function _setupEnemyAutocomplete() {
  const input    = document.getElementById('sim199-enemy-pick');
  const dropdown = document.getElementById('sim199-enemy-pick-dropdown');
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
      `<li role="option" id="sim199-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">SKILL:${e.attack ?? '?'} STAMINA:${e.hp ?? '?'}</span></li>`
    ).join('');
    activeIdx = -1;
    dropdown.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
  }

  function select(enemy) {
    const d = _data();
    if (!d || !enemy) return;
    input.value = enemy.name;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.skill = enemy.attack;
    if (enemy.hp != null)     { d.enemy.stamina = enemy.hp; d.enemy.staminaMax = enemy.hp; }
    d.roundsThisBattle = 0;
    d.pendingLuck = null;
    closeDropdown();
    saveState();
    _renderAll();
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



export function initSim199() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim199-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim199-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim199.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim199-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim199.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim199.ui.skill'), 'sim199-player-skill')}
            ${_numField(t('battlesim199.ui.skill_initial'), 'sim199-player-skillmax')}
            ${_numField(t('battlesim199.ui.stamina'), 'sim199-player-stamina')}
            ${_numField(t('battlesim199.ui.stamina_initial'), 'sim199-player-staminamax')}
            ${_numField(t('battlesim199.ui.luck'), 'sim199-player-luck')}
            ${_numField(t('battlesim199.ui.luck_initial'), 'sim199-player-luckmax')}
            ${_numField(t('battlesim199.ui.magic'), 'sim199-player-magic')}
            ${_numField(t('battlesim199.ui.magic_initial'), 'sim199-player-magicmax')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim199.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim199.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim199-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim199-enemy-pick-dropdown">
                <ul id="sim199-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim199.ui.skill'), 'sim199-enemy-skill')}
            ${_numField(t('battlesim199.ui.stamina'), 'sim199-enemy-stamina')}
            ${_numField(t('battlesim199.ui.stamina_max'), 'sim199-enemy-staminamax')}
          </div>
          <div id="sim199-status" class="bsim-status"></div>
          <div id="sim199-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim199.btn.luck_prompt')}</span>
            <button id="sim199-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim199.btn.luck_yes')}</button>
            <button id="sim199-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim199.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim199-round" class="inv-add-btn bsim-action-primary">${t('battlesim199.btn.round')}</button>
            <button id="sim199-reset" class="inv-add-btn">${t('battlesim199.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary>${t('battlesim199.ui.items')}</summary>
            <div id="sim199-item-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history" open>
            <summary>${t('battlesim199.ui.spells')}</summary>
            <div id="sim199-spell-hint" class="bsim-tech-desc"></div>
            <div id="sim199-spell-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim199-history-summary">${t('battlesim199.history.summary', { n: 0 })}</summary>
            <div id="sim199-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim199-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim199-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim199);
  document.getElementById('sim199-close').addEventListener('click', closeSim199);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim199(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim199-overlay'),
    open:  openSim199,
    close: closeSim199,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim199();
  });

  document.getElementById('sim199-round').addEventListener('click', _runRound);
  document.getElementById('sim199-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim199-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim199-luck-no').addEventListener('click', _skipLuck);

  document.getElementById('sim199-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.magicInitial   = _roll2d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.player.magic   = d.player.magicInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim199.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial, magic: d.player.magicInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim199-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim199-spell-list').addEventListener('click', e => {
    const key = e.target.dataset.cast;
    if (key) _castSpell(key);
  });

  document.getElementById('sim199-item-list').addEventListener('click', e => {
    if (e.target.id === 'sim199-item-magik-use') _useMagikPotion();
  });
  document.getElementById('sim199-item-list').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    const map = { 'sim199-item-sunsword': 'hasSunSword', 'sim199-item-enchantedsword': 'hasEnchantedSword', 'sim199-item-magik-have': 'magikHave' };
    const key = map[e.target.id];
    if (!key) return;
    d.player[key] = e.target.checked;
    saveState();
    _renderInputs();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim199-player-skill':      ['player', 'skill'],
    'sim199-player-skillmax':   ['player', 'skillInitial'],
    'sim199-player-stamina':    ['player', 'stamina'],
    'sim199-player-staminamax': ['player', 'staminaInitial'],
    'sim199-player-luck':       ['player', 'luck'],
    'sim199-player-luckmax':    ['player', 'luckInitial'],
    'sim199-player-magic':      ['player', 'magic'],
    'sim199-player-magicmax':   ['player', 'magicInitial'],
    'sim199-enemy-skill':       ['enemy', 'skill'],
    'sim199-enemy-stamina':        ['enemy', 'stamina'],
    'sim199-enemy-staminamax':     ['enemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (map) {
      val = Math.max(0, val);
      if (id === 'sim199-player-skill') val = Math.min(val, d.player.skillInitial);
      if (id === 'sim199-player-stamina') val = Math.min(val, d.player.staminaInitial);
      if (id === 'sim199-player-luck') val = Math.min(val, d.player.luckInitial);
      if (id === 'sim199-player-magic') val = Math.min(val, d.player.magicInitial);
      if (id === 'sim199-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
      d[map[0]][map[1]] = val;
      if (id === 'sim199-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
      if (id === 'sim199-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
      if (id === 'sim199-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
      if (id === 'sim199-player-magicmax') d.player.magic = Math.min(d.player.magic, val);
      if (id === 'sim199-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
      saveState();
      _renderInputs();
      return;
    }
    const m = id.match(/^sim199-spell-(.+)-have$/);
    if (m && SPELL_LABELS[m[1]]) {
      const s = d.player.spells[m[1]];
      s.have = Math.max(s.used, Math.max(0, val));
      saveState();
      _renderInputs();
    }
  }
  overlay.addEventListener('input', e => {
    const input = e.target;
    if (!input.classList?.contains('inv-qty-input') || !input.id.startsWith('sim199-')) return;
    const raw = String(input.value).replace(/[^0-9]/g, '');
    if (raw !== input.value) input.value = raw;
    _applyField(input.id, Number(raw) || 0);
  });
  overlay.addEventListener('click', e => {
    const btnEl = e.target.closest('.inv-qty-btn');
    if (!btnEl || !btnEl.dataset.id?.startsWith('sim199-')) return;
    const input = document.getElementById(btnEl.dataset.id);
    if (!input) return;
    const next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
    _applyField(btnEl.dataset.id, next);
  });

  _setupEnemyAutocomplete();
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

export { initSim199 as init, renderSim199 as render, setSim199Visible as setVisible };
