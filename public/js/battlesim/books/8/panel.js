import { AXE_DICE_BONUS, POTION_HEAL_BONUS } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, AXE_DICE_BONUS, POTION_HEAL_BONUS, SVG_SKULL, SVG_TARGET, SVG_TROPHY, _appendLog, _calcDmg, _closeSim8, _data, _diceHtml, _dieHtml, _dmgHtml, _enemyList, _enemyName, _fireBow, _loadEnemyList, _openSim8, _recordOutcome, _renderHistory, _renderInputs, _renderLog, _resetBattle, _rollDice, _runRound, _setupEnemyAutocomplete, _statField, _updateItemBtns, _updateStatus, _usePotion, apiFetch, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initBattleSim8, registerPanelShortcut, renderSim8, saveState, setSim8Visible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _rollDice, _calcDmg, _diceHtml, _enemyName, _runRound, _fireBow, _resetBattle } = createCombat(simulatorContext);
const { _usePotion } = createEffects(simulatorContext);
// END SIMULATOR WIRING
// ── Симулатор на битки - Пламъкът на Андалусия: Зарево над Кордоба (кн. 8) ──
// State stored in pt.sim8. Rules: roll N dice (N=Умение); 4-5→1 щ., 6→2 щ.
// Адрин напада пръв; при foeFirst - врагът напада преди него.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;
const SVG_TARGET = `<svg class="sim-icon sim-icon-target" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="6"  fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2"  fill="currentColor"/></svg>`;




















// Keep lifetime outcomes: admin totals require the full history.


function _renderLog() {
  const el = document.getElementById('s8-log');
  const d  = _data();
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('s8-history-summary');
  const listEl = document.getElementById('s8-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim8.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim8.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim8.history.won') : t('battlesim8.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">Ж ${h.playerLife}/${h.playerLifeMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _updateItemBtns() {
  const d = _data();
  const bowBtn = document.getElementById('s8-bow-fire');
  const potBtn = document.getElementById('s8-potion-use');
  if (!d) { if (bowBtn) bowBtn.style.display = 'none'; if (potBtn) potBtn.style.display = 'none'; return; }

  const alive   = d.player.life > 0 && d.enemy.life > 0;
  const preRound = d.round === 1;

  if (bowBtn) {
    const canFire = alive && preRound && !d.bowFired && d.items?.bow && (d.items?.arrows > 0);
    bowBtn.style.display = canFire ? '' : 'none';
    if (canFire) bowBtn.textContent = t('battlesim8.btn.bow_fire_count', { n: d.items.arrows });
  }
  if (potBtn) {
    const inBattle = d.round > 1 && d.player.life > 0 && d.enemy.life > 0;
    const canUse = !inBattle && d.player.life > 0 && d.items?.potion && d.player.life < d.player.lifeMax;
    potBtn.style.display = canUse ? '' : 'none';
  }
}

function _updateStatus() {
  const d  = _data();
  const el = document.getElementById('s8-status');
  if (!d || !el) return;
  if (d.player.life <= 0)     el.innerHTML = `${SVG_SKULL} ${t('battlesim8.status.fallen')}`;
  else if (d.enemy.life <= 0) el.innerHTML = `${SVG_TROPHY} ${t('battlesim8.status.victory')}`;
  else                        el.innerHTML = '';
  document.getElementById('s8-round').disabled = d.player.life <= 0 || d.enemy.life <= 0;
}

function _renderInputs() {
  const d = _data();
  if (!d) return;
  document.getElementById('s8-player-skill').value      = d.player.skill;
  document.getElementById('s8-player-life').value       = Math.min(d.player.life, d.player.lifeMax);
  document.getElementById('s8-player-lifemax').value    = d.player.lifeMax;
  document.getElementById('s8-enemy-pick').value        = d.enemy.name;
  document.getElementById('s8-enemy-skill').value       = d.enemy.skill;
  document.getElementById('s8-enemy-life').value        = Math.min(d.enemy.life, d.enemy.lifeMax);
  document.getElementById('s8-enemy-lifemax').value     = d.enemy.lifeMax;
  document.getElementById('s8-enemy-foe-first').checked = d.enemy.foeFirst;

  const items = d.items || {};
  const bowCb  = document.getElementById('s8-item-bow');
  const cmCb   = document.getElementById('s8-item-chainmail');
  const axeCb  = document.getElementById('s8-item-axe');
  const potCb  = document.getElementById('s8-item-potion');
  const arrInp = document.getElementById('s8-arrows');
  if (bowCb)  bowCb.checked  = !!items.bow;
  if (cmCb)   cmCb.checked   = !!items.chainmail;
  if (axeCb)  axeCb.checked  = !!items.axe;
  if (potCb)  potCb.checked  = !!items.potion;
  if (arrInp) arrInp.value   = items.arrows ?? 0;

  const sixCb = document.getElementById('s8-six-wins');
  if (sixCb) sixCb.checked = !!d.sixWins;

  _updateStatus();
  _updateItemBtns();
}









// ── Enemy autocomplete ───────────────────────────────────────────────────────
let _enemyList = null;
async function _loadEnemyList() {
  if (_enemyList) return _enemyList;
  try {
    const res = await apiFetch(`/api/books/${currentBookId}/enemies`);
    _enemyList = res.ok ? await res.json() : [];
  } catch (_) { _enemyList = []; }
  return _enemyList;
}

function _setupEnemyAutocomplete() {
  const input    = document.getElementById('s8-enemy-pick');
  const dropdown = document.getElementById('s8-enemy-pick-dropdown');
  let matches   = [];
  let activeIdx = -1;

  function closeDropdown() {
    dropdown.classList.remove('open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function render(q) {
    const list = _enemyList || [];
    const ql   = q.trim().toLowerCase();
    matches    = ql ? list.filter(e => e.name.toLowerCase().includes(ql)) : list;
    if (!matches.length) { closeDropdown(); return; }
    dropdown.innerHTML = matches.map((e, i) => {
      const u = x => x == null ? '?' : x;
      return `<li role="option" id="s8-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">У:${u(e.attack)} Ж:${u(e.hp)}</span></li>`;
    }).join('');
    activeIdx = -1;
    dropdown.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
  }

  function select(enemy) {
    const d = _data();
    if (!d || !enemy) return;
    input.value  = enemy.name;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.skill   = enemy.attack;
    if (enemy.hp     != null) { d.enemy.life = enemy.hp; d.enemy.lifeMax = enemy.hp; }
    closeDropdown();
    saveState();
    _renderInputs();
  }

  dropdown.addEventListener('mousedown', e => {
    const li = e.target.closest('li');
    if (!li) return;
    select(matches[+li.dataset.idx]);
    e.preventDefault();
  });

  input.addEventListener('focus', async () => { input.removeAttribute('readonly'); await _loadEnemyList(); render(input.value); });
  input.addEventListener('input', async () => { await _loadEnemyList(); render(input.value); });
  input.addEventListener('blur',  () => setTimeout(closeDropdown, 150));
  input.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('li');
    if (!items.length) return;
    if      (e.key === 'ArrowDown')               { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp')                 { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); select(matches[activeIdx]); return; }
    else if (e.key === 'Escape')                  { closeDropdown(); return; }
    else return;
    items.forEach((li, i) => { li.classList.toggle('ac-active', i === activeIdx); li.setAttribute('aria-selected', String(i === activeIdx)); });
    if (activeIdx >= 0) input.setAttribute('aria-activedescendant', items[activeIdx].id);
    else input.removeAttribute('aria-activedescendant');
    items[activeIdx]?.scrollIntoView({ block: 'nearest' });
  });
}

// ── Open / close ─────────────────────────────────────────────────────────────
function _openSim8() {
  if (!_data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  _renderInputs();
  _renderLog();
  _renderHistory();
  document.getElementById('s8-overlay').classList.add('active');
}

function _closeSim8() {
  document.getElementById('s8-overlay')?.classList.remove('active');
}

export function setSim8Visible(visible) {
  const btn = document.getElementById('sim8-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) _closeSim8();
}

export function renderSim8() {
  const overlay = document.getElementById('s8-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { _closeSim8(); return; }
  _renderInputs();
  _renderLog();
  _renderHistory();
}

// ── Stat stepper row ─────────────────────────────────────────────────────────


// ── Init ─────────────────────────────────────────────────────────────────────
export function initBattleSim8() {
  const overlay = document.createElement('div');
  overlay.id        = 's8-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim8.ui.title')}</span>
        <button id="s8-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim8.ui.you')}</div>
            ${_statField(t('battlesim8.ui.skill'), 's8-player-skill', 'player', 'skill')}
            ${_statField(t('battlesim8.ui.life'), 's8-player-life', 'player', 'life')}
            ${_statField(t('battlesim8.ui.life_max'), 's8-player-lifemax', 'player', 'lifeMax')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim8.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim8.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="s8-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly placeholder="${t('battlesim8.ui.pick_placeholder')}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="s8-enemy-pick-dropdown">
                <ul id="s8-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_statField(t('battlesim8.ui.skill'), 's8-enemy-skill', 'enemy', 'skill')}
            ${_statField(t('battlesim8.ui.life'), 's8-enemy-life', 'enemy', 'life')}
            ${_statField(t('battlesim8.ui.life_max'), 's8-enemy-lifemax', 'enemy', 'lifeMax')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim8.ui.attack_order')}</span>
              <input id="s8-enemy-foe-first" type="checkbox" class="inv-edit-check">
              <label for="s8-enemy-foe-first" class="inv-edit-check-label">${t('battlesim8.ui.foe_first')}</label>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim8.ui.items')}</div>
            <div class="inv-edit-row">
              <input id="s8-item-bow" type="checkbox" class="inv-edit-check">
              <label for="s8-item-bow" class="inv-edit-check-label">${t('battlesim8.ui.bow')}</label>
              <div class="inv-qty-wrap s8-arrows-wrap">
                <button class="inv-qty-btn" id="s8-arrows-dec">−</button>
                <input id="s8-arrows" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric" style="width:44px">
                <button class="inv-qty-btn" id="s8-arrows-inc">+</button>
              </div>
              <span class="s8-rules-note" style="margin-left:4px">${t('battlesim8.ui.arrows')}</span>
            </div>
            <div class="inv-edit-row">
              <input id="s8-item-chainmail" type="checkbox" class="inv-edit-check">
              <label for="s8-item-chainmail" class="inv-edit-check-label">${t('battlesim8.ui.chainmail')}</label>
            </div>
            <div class="inv-edit-row">
              <input id="s8-item-axe" type="checkbox" class="inv-edit-check">
              <label for="s8-item-axe" class="inv-edit-check-label">${t('battlesim8.ui.axe', { n: AXE_DICE_BONUS })}</label>
            </div>
            <div class="inv-edit-row">
              <input id="s8-item-potion" type="checkbox" class="inv-edit-check">
              <label for="s8-item-potion" class="inv-edit-check-label">${t('battlesim8.ui.potion', { n: POTION_HEAL_BONUS })}</label>
            </div>
          </div>
          <div class="s8-rules-note">
            ${t('battlesim8.ui.rules_note')}
          </div>
          <div class="inv-edit-row">
            <input id="s8-six-wins" type="checkbox" class="inv-edit-check">
            <label for="s8-six-wins" class="inv-edit-check-label">${t('battlesim8.ui.six_wins')}</label>
          </div>
          <div id="s8-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="s8-round" class="inv-add-btn bsim-action-primary">${t('battlesim8.btn.round')}</button>
            <button id="s8-bow-fire" class="inv-add-btn" style="display:none">${t('battlesim8.btn.bow_fire')}</button>
            <button id="s8-potion-use" class="inv-add-btn" style="display:none">${t('battlesim8.btn.potion_use')}</button>
            <button id="s8-reset" class="inv-add-btn">${t('battlesim8.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="s8-history-summary">${t('battlesim8.history.summary', { n: 0 })}</summary>
            <div id="s8-history-list" class="bsim-history-list"></div>
          </details>
          <div id="s8-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim8-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', _openSim8);
  document.getElementById('s8-close').addEventListener('click', _closeSim8);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) _closeSim8(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 's8-overlay'),
    open:  _openSim8,
    close: _closeSim8,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) _closeSim8();
  });

  document.getElementById('s8-round').addEventListener('click', _runRound);
  document.getElementById('s8-reset').addEventListener('click', _resetBattle);
  document.getElementById('s8-bow-fire').addEventListener('click', _fireBow);
  document.getElementById('s8-potion-use').addEventListener('click', _usePotion);

  // Group steppers (player/enemy stats)
  overlay.querySelectorAll('.inv-qty-input[data-group]').forEach(input => {
    input.addEventListener('input', () => {
      // Filter numeric text inputs; avoid native spinner/wheel behavior.
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      const d   = _data();
      if (!d) return;
      const grp = input.dataset.group;
      const key = input.dataset.key;
      let val   = Math.max(0, Number(raw) || 0);

      if (key === 'skill')  val = Math.max(2, Math.min(5, val));
      if (grp === 'player' && key === 'life' && val > d.player.lifeMax) d.player.lifeMax = val;
      if (grp === 'enemy'  && key === 'life' && val > d.enemy.lifeMax) d.enemy.lifeMax = val;

      d[grp][key] = val;

      if (key === 'skill' && grp === 'player') d.player.life = Math.min(d.player.life, d.player.lifeMax);
      if (key === 'lifeMax') d[grp].life = Math.min(d[grp].life, val);

      saveState();
      _renderInputs();
    });
  });

  overlay.querySelectorAll('.inv-qty-btn[data-group]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      const d     = _data();
      if (!d || !input) return;
      const grp = btnEl.dataset.group;
      const key = btnEl.dataset.key;
      let next  = (Number(input.value) || 0) + Number(btnEl.dataset.delta);

      if (key === 'skill') next = Math.max(2, Math.min(5, next));
      else                 next = Math.max(0, next);

      if (grp === 'player' && key === 'life' && next > d.player.lifeMax) d.player.lifeMax = next;
      if (grp === 'enemy'  && key === 'life' && next > d.enemy.lifeMax) d.enemy.lifeMax = next;

      d[grp][key] = next;

      if (key === 'skill' && grp === 'player') d.player.life = Math.min(d.player.life, d.player.lifeMax);
      if (key === 'lifeMax') d[grp].life = Math.min(d[grp].life, next);

      saveState();
      _renderInputs();
    });
  });

  // Arrows stepper
  document.getElementById('s8-arrows').addEventListener('input', e => {
    const raw = String(e.target.value).replace(/[^0-9]/g, '');
    if (raw !== e.target.value) e.target.value = raw;
    const d = _data();
    if (!d) return;
    d.items.arrows = Math.max(0, Number(raw) || 0);
    saveState();
    _updateItemBtns();
  });
  document.getElementById('s8-arrows-dec').addEventListener('click', () => {
    const d = _data();
    if (!d) return;
    d.items.arrows = Math.max(0, (d.items.arrows || 0) - 1);
    document.getElementById('s8-arrows').value = d.items.arrows;
    saveState();
    _updateItemBtns();
  });
  document.getElementById('s8-arrows-inc').addEventListener('click', () => {
    const d = _data();
    if (!d) return;
    d.items.arrows = (d.items.arrows || 0) + 1;
    document.getElementById('s8-arrows').value = d.items.arrows;
    saveState();
    _updateItemBtns();
  });

  // Item checkboxes
  document.getElementById('s8-item-bow').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.items.bow = e.target.checked;
    saveState();
    _updateItemBtns();
  });
  document.getElementById('s8-item-chainmail').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.items.chainmail = e.target.checked;
    saveState();
  });
  document.getElementById('s8-item-axe').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.items.axe = e.target.checked;
    saveState();
  });
  document.getElementById('s8-item-potion').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.items.potion = e.target.checked;
    saveState();
    _updateItemBtns();
  });

  document.getElementById('s8-six-wins').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.sixWins = e.target.checked;
    saveState();
  });

  document.getElementById('s8-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('s8-enemy-foe-first').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.enemy.foeFirst = e.target.checked;
    saveState();
  });

  _setupEnemyAutocomplete();
}

function _dieHtml(d) {

  if (d === 6) return `<span class="s8-die s8-die-6">${d}</span>`;
  if (d >= 4)  return `<span class="s8-die s8-die-hit">${d}</span>`;
  return `<span class="s8-die s8-die-miss">${d}</span>`;
}

function _dmgHtml(dmg, cls) {

  return dmg > 0 ? `<span class="${cls}">-${dmg}</span>` : `<span class="s8-miss">0</span>`;
}

function _statField(label, id, group, key) {

  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <div class="inv-qty-wrap">
        <button class="inv-qty-btn" data-id="${id}" data-group="${group}" data-key="${key}" data-delta="-1">−</button>
        <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric" data-group="${group}" data-key="${key}">
        <button class="inv-qty-btn" data-id="${id}" data-group="${group}" data-key="${key}" data-delta="1">+</button>
      </div>
    </div>`;
}

export { initBattleSim8 as init, renderSim8 as render, setSim8Visible as setVisible };
