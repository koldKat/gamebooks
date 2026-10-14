import { MODES, MAX_MEDKIT, MAX_ROCKETS, MAX_SPIKES, MAX_OIL, MEDKIT_HEAL, HAND_KO_THRESHOLD } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, HAND_KO_THRESHOLD, MAX_MEDKIT, MAX_OIL, MAX_ROCKETS, MAX_SPIKES, MEDKIT_HEAL, MODES, SVG_SKULL, SVG_TROPHY, _activeSide, _appendLog, _checkOutcome, _data, _enemyList, _fireRocket, _foeName, _foeNameSafe, _loadEnemyList, _notReady, _numField, _recordOutcome, _renderAll, _renderConsumablesHtml, _renderHistory, _renderInputs, _renderLog, _renderStatus, _resetBattle, _roll1d6, _roll2d6, _runRound, _setupEnemyAutocomplete, _useMedKit, apiFetch, closeSim209, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim209, openSim209, registerPanelShortcut, renderSim209, saveState, setSim209Visible, shortcutLabel, showAlert, t });
const { _data, _notReady, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _roll2d6, _roll1d6, _activeSide, _foeName, _foeNameSafe, _runRound, _checkOutcome, _fireRocket, _resetBattle } = createCombat(simulatorContext);
const { _useMedKit } = createEffects(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Freeway Fighter, book 209)
// Separate person/vehicle pools; hand fights end after 6 cumulative damage or death.
// Shooting/vehicle hits deal 1d6; hand damage is encounter-specific.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;


















// Map round fields to the current combat pool.





// Record remaining/max stats from the combat's own pool.


// ── Combat ───────────────────────────────────────────────────────────────────





// A rocket is fired instead of a normal Attack Round - the book rules it as
// an automatic hit that destroys any target outright, no roll needed.


// Reset only the current mode's pool; person and vehicle damage are independent.


// ── Med-Kit ──────────────────────────────────────────────────────────────────



// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim209-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const side = _activeSide(d);
  const hasFoe = side.foe[side.foeHpMax] > 0;
  if (notReady)                                el.innerHTML = t('battlesim209.status.not_ready');
  else if (side.self[side.selfHp] <= 0)         el.innerHTML = t('battlesim209.status.fallen', { skull: SVG_SKULL });
  else if (hasFoe && side.foe[side.foeHp] <= 0) el.innerHTML = t('battlesim209.status.victory', { trophy: SVG_TROPHY });
  else                                          el.innerHTML = '';
  const over = notReady || side.self[side.selfHp] <= 0 || (hasFoe && side.foe[side.foeHp] <= 0);
  document.getElementById('sim209-round').disabled = over;
  document.getElementById('sim209-rocket').disabled = notReady || d.mode !== 'vehicle' || d.car.rockets <= 0 || over;
  document.getElementById('sim209-rocket').style.display = d.mode === 'vehicle' ? '' : 'none';
  document.getElementById('sim209-handdmg-row').style.display = d.mode === 'hand' ? '' : 'none';
  document.getElementById('sim209-medkit').disabled =
    notReady || d.player.medKitLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d[side.roundsKey] > 0 && side.self[side.selfHp] > 0 && side.foe[side.foeHp] > 0);
}

function _renderConsumablesHtml(d) {
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim209.ui.spike_name')}</div>
      <div class="bsim-tech-desc">${t('battlesim209.ui.spike_desc')}</div>
      <div class="bsim-tech-footer"><span class="bsim-ae-display">${d.car.spikes}/${MAX_SPIKES}</span>
        <button class="inv-edit-done bsim-tech-btn" id="sim209-spike-use" ${d.car.spikes <= 0 ? 'disabled' : ''}>${t('battlesim209.btn.use_one')}</button></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim209.ui.oil_name')}</div>
      <div class="bsim-tech-desc">${t('battlesim209.ui.oil_desc')}</div>
      <div class="bsim-tech-footer"><span class="bsim-ae-display">${d.car.oil}/${MAX_OIL}</span>
        <button class="inv-edit-done bsim-tech-btn" id="sim209-oil-use" ${d.car.oil <= 0 ? 'disabled' : ''}>${t('battlesim209.btn.use_one')}</button></div>
    </div>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim209-history-summary');
  const listEl = document.getElementById('sim209-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim209.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim209.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim209.history.won') : t('battlesim209.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${h.statLabel} ${h.statValue}/${h.statMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim209-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim209-player-skill').value      = d.player.skill;
  document.getElementById('sim209-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim209-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim209-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim209-player-luck').value       = d.player.luck;
  document.getElementById('sim209-player-luckmax').value    = d.player.luckInitial;

  document.getElementById('sim209-car-firepower').value      = d.car.firepower;
  document.getElementById('sim209-car-firepowermax').value   = d.car.firepowerInitial;
  document.getElementById('sim209-car-armour').value         = Math.min(d.car.armour, d.car.armourInitial);
  document.getElementById('sim209-car-armourmax').value      = d.car.armourInitial;

  const rollBtn = document.getElementById('sim209-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim209.btn.rolled') : t('battlesim209.btn.roll');

  document.getElementById('sim209-medkit-left').textContent = `${d.player.medKitLeft}/${MAX_MEDKIT}`;
  document.getElementById('sim209-rockets-left').textContent = `${d.car.rockets}/${MAX_ROCKETS}`;

  document.getElementById('sim209-mode').value = d.mode;
  document.getElementById('sim209-handdmg').value = d.handDmg;
  document.getElementById('sim209-handloss').textContent = t('battlesim209.ui.hand_loss', { you: d.playerHandLoss, foe: d.enemyHandLoss, n: HAND_KO_THRESHOLD });

  document.getElementById('sim209-enemy-pick').value       = d.enemy.name;
  document.getElementById('sim209-enemy-skill').value      = d.enemy.skill;
  document.getElementById('sim209-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim209-enemy-staminamax').value = d.enemy.staminaMax;

  document.getElementById('sim209-enemycar-pick').value        = d.enemyCar.name;
  document.getElementById('sim209-enemycar-firepower').value   = d.enemyCar.firepower;
  document.getElementById('sim209-enemycar-armour').value      = Math.min(d.enemyCar.armour, d.enemyCar.armourMax);
  document.getElementById('sim209-enemycar-armourmax').value   = d.enemyCar.armourMax;

  document.getElementById('sim209-consumables').innerHTML = _renderConsumablesHtml(d);

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim209() {
  const overlay = document.getElementById('sim209-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim209(); return; }
  _renderAll();
}

function openSim209() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim209-overlay').classList.add('active');
}

function closeSim209() {
  document.getElementById('sim209-overlay')?.classList.remove('active');
}

export function setSim209Visible(visible) {
  const btn = document.getElementById('sim209-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim209();
}

// Both pickers share one enemy list; the reader chooses rows appropriate to the current mode.

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



export function initSim209() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim209-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim209-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="inv-edit-row">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim209.ui.combat_type')}</span>
            <select id="sim209-mode" class="inv-edit-input bsim-select">
              ${MODES.map(m => `<option value="${m[0]}">${escapeHtml(t(m[1]))}</option>`).join('')}
            </select>
          </div>
          <div id="sim209-handdmg-row" class="inv-edit-row bsim-ae-row">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim209.ui.hand_dmg')}</span>
            <div class="inv-qty-wrap">
              <button class="inv-qty-btn" data-id="sim209-handdmg" data-delta="-1">−</button>
              <input id="sim209-handdmg" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
              <button class="inv-qty-btn" data-id="sim209-handdmg" data-delta="1">+</button>
            </div>
          </div>
          <div id="sim209-handloss" class="bsim-ae-display"></div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim209.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim209-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim209.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim209.ui.skill'), 'sim209-player-skill')}
            ${_numField(t('battlesim209.ui.skill_initial'), 'sim209-player-skillmax')}
            ${_numField(t('battlesim209.ui.stamina'), 'sim209-player-stamina')}
            ${_numField(t('battlesim209.ui.stamina_initial'), 'sim209-player-staminamax')}
            ${_numField(t('battlesim209.ui.luck'), 'sim209-player-luck')}
            ${_numField(t('battlesim209.ui.luck_initial'), 'sim209-player-luckmax')}
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim209.ui.medkit')}</span>
              <span id="sim209-medkit-left" class="bsim-ae-display"></span>
              <button id="sim209-medkit" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim209.btn.medkit_use', { n: MEDKIT_HEAL })}</button>
            </div>
            ${_numField(t('battlesim209.ui.firepower'), 'sim209-car-firepower')}
            ${_numField(t('battlesim209.ui.firepower_initial'), 'sim209-car-firepowermax')}
            ${_numField(t('battlesim209.ui.armour'), 'sim209-car-armour')}
            ${_numField(t('battlesim209.ui.armour_initial'), 'sim209-car-armourmax')}
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim209.ui.rockets')}</span>
              <span id="sim209-rockets-left" class="bsim-ae-display"></span>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim209.ui.enemy_handshoot')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim209.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim209-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim209-enemy-pick-dropdown">
                <ul id="sim209-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim209.ui.skill'), 'sim209-enemy-skill')}
            ${_numField(t('battlesim209.ui.stamina'), 'sim209-enemy-stamina')}
            ${_numField(t('battlesim209.ui.stamina_max'), 'sim209-enemy-staminamax')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim209.ui.enemy_vehicle')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim209.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim209-enemycar-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim209-enemycar-pick-dropdown">
                <ul id="sim209-enemycar-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim209.ui.firepower'), 'sim209-enemycar-firepower')}
            ${_numField(t('battlesim209.ui.armour'), 'sim209-enemycar-armour')}
            ${_numField(t('battlesim209.ui.armour_max'), 'sim209-enemycar-armourmax')}
          </div>
          <div id="sim209-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim209-round" class="inv-add-btn bsim-action-primary">${t('battlesim209.btn.round')}</button>
            <button id="sim209-rocket" class="inv-add-btn">${t('battlesim209.btn.rocket')}</button>
            <button id="sim209-reset" class="inv-add-btn">${t('battlesim209.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>${t('battlesim209.ui.spikes_oil')}</summary>
            <div id="sim209-consumables" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim209-history-summary">${t('battlesim209.history.summary', { n: 0 })}</summary>
            <div id="sim209-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim209-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim209-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim209);
  document.getElementById('sim209-close').addEventListener('click', closeSim209);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim209(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim209-overlay'),
    open:  openSim209,
    close: closeSim209,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim209();
  });

  document.getElementById('sim209-round').addEventListener('click', _runRound);
  document.getElementById('sim209-rocket').addEventListener('click', _fireRocket);
  document.getElementById('sim209-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim209-medkit').addEventListener('click', _useMedKit);

  document.getElementById('sim209-mode').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.mode = e.target.value;
    saveState();
    _renderAll();
  });

  document.getElementById('sim209-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 24;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.car.firepowerInitial = _roll1d6() + 6;
    d.car.armourInitial    = _roll2d6() + 24;
    d.car.firepower = d.car.firepowerInitial;
    d.car.armour    = d.car.armourInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim209.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial, firepower: d.car.firepowerInitial, armour: d.car.armourInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim209-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  document.getElementById('sim209-enemycar-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemyCar.name = e.target.value;
    saveState();
  });

  document.getElementById('sim209-consumables').addEventListener('click', e => {
    const d = _data();
    if (!d) return;
    if (e.target.id === 'sim209-spike-use' && d.car.spikes > 0) {
      d.car.spikes--;
      _appendLog(d, t('battlesim209.log.spike_use', { n: d.car.spikes }));
      saveState(); _renderAll();
    } else if (e.target.id === 'sim209-oil-use' && d.car.oil > 0) {
      d.car.oil--;
      _appendLog(d, t('battlesim209.log.oil_use', { n: d.car.oil }));
      saveState(); _renderAll();
    }
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim209-player-skill':       ['player', 'skill'],
    'sim209-player-skillmax':    ['player', 'skillInitial'],
    'sim209-player-stamina':     ['player', 'stamina'],
    'sim209-player-staminamax':  ['player', 'staminaInitial'],
    'sim209-player-luck':        ['player', 'luck'],
    'sim209-player-luckmax':     ['player', 'luckInitial'],
    'sim209-car-firepower':      ['car', 'firepower'],
    'sim209-car-firepowermax':   ['car', 'firepowerInitial'],
    'sim209-car-armour':         ['car', 'armour'],
    'sim209-car-armourmax':      ['car', 'armourInitial'],
    'sim209-enemy-skill':        ['enemy', 'skill'],
    'sim209-enemy-stamina':      ['enemy', 'stamina'],
    'sim209-enemy-staminamax':   ['enemy', 'staminaMax'],
    'sim209-enemycar-firepower':    ['enemyCar', 'firepower'],
    'sim209-enemycar-armour':       ['enemyCar', 'armour'],
    'sim209-enemycar-armourmax':    ['enemyCar', 'armourMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    if (id === 'sim209-handdmg') {
      d.handDmg = Math.max(1, val);
      saveState();
      _renderInputs();
      return;
    }
    const map = FIELD_MAP[id];
    if (!map) return;
    val = Math.max(0, val);
    if (id === 'sim209-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim209-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim209-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim209-car-firepower') val = Math.min(val, d.car.firepowerInitial);
    if (id === 'sim209-car-armour') val = Math.min(val, d.car.armourInitial);
    if (id === 'sim209-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim209-enemycar-armour') val = Math.min(val, d.enemyCar.armourMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim209-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim209-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim209-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim209-car-firepowermax') d.car.firepower = Math.min(d.car.firepower, val);
    if (id === 'sim209-car-armourmax') d.car.armour = Math.min(d.car.armour, val);
    if (id === 'sim209-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    if (id === 'sim209-enemycar-armourmax') d.enemyCar.armour = Math.min(d.enemyCar.armour, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim209-"]').forEach(input => {
    if (!FIELD_MAP[input.id] && input.id !== 'sim209-handdmg') return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim209-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || (!FIELD_MAP[btnEl.dataset.id] && btnEl.dataset.id !== 'sim209-handdmg')) return;
      const next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim209-enemy-pick', 'sim209-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.skill = enemy.attack;
    if (enemy.hp != null) { d.enemy.stamina = enemy.hp; d.enemy.staminaMax = enemy.hp; }
    d.roundsPerson = 0;
    // Reset cumulative knockout progress for each new enemy.
    d.playerHandLoss = 0;
    d.enemyHandLoss = 0;
    saveState();
    _renderAll();
  });
  _setupEnemyAutocomplete('sim209-enemycar-pick', 'sim209-enemycar-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemyCar.name = enemy.name;
    if (enemy.attack != null) d.enemyCar.firepower = enemy.attack;
    if (enemy.hp != null) { d.enemyCar.armour = enemy.hp; d.enemyCar.armourMax = enemy.hp; }
    d.roundsVehicle = 0;
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

export { initSim209 as init, renderSim209 as render, setSim209Visible as setVisible };
