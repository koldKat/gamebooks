import { MODES, MAX_ENERGY_TABLETS, MAX_SMART_MISSILES, ENERGY_TABLET_RESTORE, DEFAULT_MISSILE_DAMAGE } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, DEFAULT_MISSILE_DAMAGE, ENERGY_TABLET_RESTORE, MAX_ENERGY_TABLETS, MAX_SMART_MISSILES, MODES, SVG_SKULL, SVG_TROPHY, _activeSide, _appendLog, _checkOutcome, _data, _enemyList, _fireMissile, _foeName, _foeNameSafe, _loadEnemyList, _notReady, _numField, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _renderStatus, _resetBattle, _roll1d6, _roll2d6, _runRound, _selfMaxHp, _setupEnemyAutocomplete, _useEnergyTablet, apiFetch, closeSim211, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim211, openSim211, registerPanelShortcut, renderSim211, saveState, setSim211Visible, shortcutLabel, showAlert, t });
const { _data, _notReady, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _roll2d6, _roll1d6, _activeSide, _selfMaxHp, _foeName, _foeNameSafe, _runRound, _checkOutcome, _fireMissile, _resetBattle } = createCombat(simulatorContext);
const { _useEnergyTablet } = createEffects(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (The Rings of Kether, book 211)
// Hand-to-hand uses opposed rolls; blaster/ship combat uses independent threshold checks.
// Person and ship pools reset independently; missiles replace the turn. LUCK is narrative-only.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;






// Effectively "always destroys" for a normal ship - only the Asteroid
// Defences fight (sec 312) needs this dialed down to 2.










// Map fields by combat pool; hand-to-hand uses opposed rolls rather than blaster/ship resolution.


// Reset from staminaInitial/shieldsInitial, not the generic mapping's attack-stat maximum.







// ── Combat ───────────────────────────────────────────────────────────────────





// A missile replaces the normal turn; its damage remains editable for encounter exceptions.


// Reset only the current mode's pool, preserving unrelated ship/person damage.


// ── Energy Tablets ───────────────────────────────────────────────────────────



// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim211-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const side = _activeSide(d);
  const hasFoe = side.foe[side.foeHpMax] > 0;
  if (notReady)                                el.innerHTML = t('battlesim211.status.not_ready');
  else if (side.self[side.selfHp] <= 0)         el.innerHTML = t('battlesim211.status.fallen', { skull: SVG_SKULL });
  else if (hasFoe && side.foe[side.foeHp] <= 0) el.innerHTML = t('battlesim211.status.victory', { trophy: SVG_TROPHY });
  else                                          el.innerHTML = '';
  const over = notReady || side.self[side.selfHp] <= 0 || (hasFoe && side.foe[side.foeHp] <= 0);
  document.getElementById('sim211-round').disabled = over;
  document.getElementById('sim211-missile').disabled = notReady || d.mode !== 'ship' || d.ship.smartMissiles <= 0 || over;
  document.getElementById('sim211-missile-row').style.display = d.mode === 'ship' ? '' : 'none';
  document.getElementById('sim211-energy').disabled =
    notReady || d.player.energyTabletsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d[side.roundsKey] > 0 && side.self[side.selfHp] > 0 && side.foe[side.foeHp] > 0);
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim211-history-summary');
  const listEl = document.getElementById('sim211-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim211.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim211.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim211.history.won') : t('battlesim211.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${h.statLabel} ${h.statValue}/${h.statMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim211-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim211-player-skill').value      = d.player.skill;
  document.getElementById('sim211-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim211-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim211-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim211-player-luck').value       = d.player.luck;
  document.getElementById('sim211-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim211-player-money').value      = d.player.money;

  document.getElementById('sim211-ship-ws').value       = d.ship.weaponsStrength;
  document.getElementById('sim211-ship-wsmax').value    = d.ship.weaponsStrengthInitial;
  document.getElementById('sim211-ship-shields').value  = Math.min(d.ship.shields, d.ship.shieldsInitial);
  document.getElementById('sim211-ship-shieldsmax').value = d.ship.shieldsInitial;

  const rollBtn = document.getElementById('sim211-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim211.btn.rolled') : t('battlesim211.btn.roll');

  document.getElementById('sim211-energy-left').textContent = `${d.player.energyTabletsLeft}/${MAX_ENERGY_TABLETS}`;
  document.getElementById('sim211-missiles-left').textContent = `${d.ship.smartMissiles}/${MAX_SMART_MISSILES}`;
  document.getElementById('sim211-missile-dmg').value = d.missileDamage;

  document.getElementById('sim211-mode').value = d.mode;

  document.getElementById('sim211-enemy-pick').value       = d.enemy.name;
  document.getElementById('sim211-enemy-skill').value      = d.enemy.skill;
  document.getElementById('sim211-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim211-enemy-staminamax').value = d.enemy.staminaMax;

  document.getElementById('sim211-enemyship-pick').value        = d.enemyShip.name;
  document.getElementById('sim211-enemyship-ws').value          = d.enemyShip.weaponsStrength;
  document.getElementById('sim211-enemyship-shields').value     = Math.min(d.enemyShip.shields, d.enemyShip.shieldsMax);
  document.getElementById('sim211-enemyship-shieldsmax').value  = d.enemyShip.shieldsMax;

  document.getElementById('sim211-person-fields').style.display = d.mode === 'ship' ? 'none' : '';
  document.getElementById('sim211-ship-fields').style.display   = d.mode === 'ship' ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim211() {
  const overlay = document.getElementById('sim211-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim211(); return; }
  _renderAll();
}

function openSim211() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim211-overlay').classList.add('active');
}

function closeSim211() {
  document.getElementById('sim211-overlay')?.classList.remove('active');
}

export function setSim211Visible(visible) {
  const btn = document.getElementById('sim211-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim211();
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



export function initSim211() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim211-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim211-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="inv-edit-row">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim211.ui.combat_type')}</span>
            <select id="sim211-mode" class="inv-edit-input bsim-select">
              ${MODES.map(m => `<option value="${m[0]}">${escapeHtml(t(m[1]))}</option>`).join('')}
            </select>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim211.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim211-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim211.btn.roll')}</button>
            </div>
            <div id="sim211-person-fields">
              ${_numField(t('battlesim211.ui.skill'), 'sim211-player-skill')}
              ${_numField(t('battlesim211.ui.skill_initial'), 'sim211-player-skillmax')}
              ${_numField(t('battlesim211.ui.stamina'), 'sim211-player-stamina')}
              ${_numField(t('battlesim211.ui.stamina_initial'), 'sim211-player-staminamax')}
              <div class="inv-edit-row bsim-ae-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim211.ui.energy_tablets')}</span>
                <span id="sim211-energy-left" class="bsim-ae-display"></span>
                <button id="sim211-energy" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim211.btn.energy_take', { n: ENERGY_TABLET_RESTORE, stamina: t('battlesim211.ui.stamina') })}</button>
              </div>
            </div>
            <div id="sim211-ship-fields" style="display:none">
              ${_numField(t('battlesim211.ui.weapons_strength'), 'sim211-ship-ws')}
              ${_numField(t('battlesim211.ui.weapons_strength_initial'), 'sim211-ship-wsmax')}
              ${_numField(t('battlesim211.ui.shields'), 'sim211-ship-shields')}
              ${_numField(t('battlesim211.ui.shields_initial'), 'sim211-ship-shieldsmax')}
              <div class="inv-edit-row bsim-ae-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim211.ui.smart_missiles')}</span>
                <span id="sim211-missiles-left" class="bsim-ae-display"></span>
              </div>
              ${_numField(t('battlesim211.ui.missile_dmg'), 'sim211-missile-dmg')}
            </div>
            ${_numField(t('battlesim211.ui.luck'), 'sim211-player-luck')}
            ${_numField(t('battlesim211.ui.luck_initial'), 'sim211-player-luckmax')}
            ${_numField(t('battlesim211.ui.money'), 'sim211-player-money')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim211.ui.enemy_blaster')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim211.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim211-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim211-enemy-pick-dropdown">
                <ul id="sim211-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim211.ui.skill'), 'sim211-enemy-skill')}
            ${_numField(t('battlesim211.ui.stamina'), 'sim211-enemy-stamina')}
            ${_numField(t('battlesim211.ui.stamina_max'), 'sim211-enemy-staminamax')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim211.ui.enemy_ship')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim211.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim211-enemyship-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim211-enemyship-pick-dropdown">
                <ul id="sim211-enemyship-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim211.ui.weapons_strength'), 'sim211-enemyship-ws')}
            ${_numField(t('battlesim211.ui.shields'), 'sim211-enemyship-shields')}
            ${_numField(t('battlesim211.ui.shields_max'), 'sim211-enemyship-shieldsmax')}
          </div>
          <div id="sim211-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim211-round" class="inv-add-btn bsim-action-primary">${t('battlesim211.btn.round')}</button>
            <div id="sim211-missile-row" style="display:none">
              <button id="sim211-missile" class="inv-add-btn">${t('battlesim211.btn.fire_missile')}</button>
            </div>
            <button id="sim211-reset" class="inv-add-btn">${t('battlesim211.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim211-history-summary">${t('battlesim211.history.summary', { n: 0 })}</summary>
            <div id="sim211-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim211-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim211-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim211);
  document.getElementById('sim211-close').addEventListener('click', closeSim211);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim211(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim211-overlay'),
    open:  openSim211,
    close: closeSim211,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim211();
  });

  document.getElementById('sim211-round').addEventListener('click', _runRound);
  document.getElementById('sim211-missile').addEventListener('click', _fireMissile);
  document.getElementById('sim211-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim211-energy').addEventListener('click', _useEnergyTablet);

  document.getElementById('sim211-mode').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.mode = e.target.value;
    saveState();
    _renderAll();
  });

  document.getElementById('sim211-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.ship.weaponsStrengthInitial = _roll1d6() + 6;
    d.ship.shieldsInitial         = _roll1d6();
    d.ship.weaponsStrength = d.ship.weaponsStrengthInitial;
    d.ship.shields         = d.ship.shieldsInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim211.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial, ws: d.ship.weaponsStrengthInitial, shields: d.ship.shieldsInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim211-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  document.getElementById('sim211-enemyship-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemyShip.name = e.target.value;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim211-player-skill':      ['player', 'skill'],
    'sim211-player-skillmax':   ['player', 'skillInitial'],
    'sim211-player-stamina':    ['player', 'stamina'],
    'sim211-player-staminamax': ['player', 'staminaInitial'],
    'sim211-player-luck':       ['player', 'luck'],
    'sim211-player-luckmax':    ['player', 'luckInitial'],
    'sim211-player-money':      ['player', 'money'],
    'sim211-ship-ws':           ['ship', 'weaponsStrength'],
    'sim211-ship-wsmax':        ['ship', 'weaponsStrengthInitial'],
    'sim211-ship-shields':      ['ship', 'shields'],
    'sim211-ship-shieldsmax':   ['ship', 'shieldsInitial'],
    'sim211-missile-dmg':       ['root', 'missileDamage'],
    'sim211-enemy-skill':       ['enemy', 'skill'],
    'sim211-enemy-stamina':     ['enemy', 'stamina'],
    'sim211-enemy-staminamax':  ['enemy', 'staminaMax'],
    'sim211-enemyship-ws':          ['enemyShip', 'weaponsStrength'],
    'sim211-enemyship-shields':     ['enemyShip', 'shields'],
    'sim211-enemyship-shieldsmax':  ['enemyShip', 'shieldsMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = Math.max(0, val);
    if (id === 'sim211-missile-dmg') val = Math.max(1, val);
    if (id === 'sim211-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim211-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim211-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim211-ship-ws') val = Math.min(val, d.ship.weaponsStrengthInitial);
    if (id === 'sim211-ship-shields') val = Math.min(val, d.ship.shieldsInitial);
    if (id === 'sim211-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim211-enemyship-shields') val = Math.min(val, d.enemyShip.shieldsMax);
    if (map[0] === 'root') d[map[1]] = val;
    else d[map[0]][map[1]] = val;
    if (id === 'sim211-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim211-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim211-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim211-ship-wsmax') d.ship.weaponsStrength = Math.min(d.ship.weaponsStrength, val);
    if (id === 'sim211-ship-shieldsmax') d.ship.shields = Math.min(d.ship.shields, val);
    if (id === 'sim211-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    if (id === 'sim211-enemyship-shieldsmax') d.enemyShip.shields = Math.min(d.enemyShip.shields, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim211-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim211-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim211-enemy-pick', 'sim211-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.skill = enemy.attack;
    if (enemy.hp != null) { d.enemy.stamina = enemy.hp; d.enemy.staminaMax = enemy.hp; }
    d.roundsPerson = 0;
    saveState();
    _renderAll();
  });
  _setupEnemyAutocomplete('sim211-enemyship-pick', 'sim211-enemyship-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemyShip.name = enemy.name;
    if (enemy.attack != null) d.enemyShip.weaponsStrength = enemy.attack;
    if (enemy.hp != null) { d.enemyShip.shields = enemy.hp; d.enemyShip.shieldsMax = enemy.hp; }
    d.roundsShip = 0;
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

export { initSim211 as init, renderSim211 as render, setSim211Visible as setVisible };
