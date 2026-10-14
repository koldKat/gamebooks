import { SUPER_POWERS, HERO_POINT_PENALTY, SUPER_POWER_STAMINA_COST } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, HERO_POINT_PENALTY, SUPER_POWERS, SUPER_POWER_STAMINA_COST, SVG_SKULL, SVG_TROPHY, _appendLog, _attemptEnergyBlast, _captureEnemy, _continueAttacking, _data, _enemyList, _enemyName, _enemyNameSafe, _finishEnemy, _loadEnemyList, _notReady, _numField, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _renderStatus, _resetBattle, _resetEncounterKnobs, _resolveRoundEnd, _roll1d6, _roll2d6, _runRound, _setupEnemyAutocomplete, _skipLuck, _testLuck, _usePsiPower, apiFetch, closeSim213, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim213, openSim213, registerPanelShortcut, renderSim213, saveState, setSim213Visible, shortcutLabel, showAlert, t });
const { _data, _notReady, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _resetEncounterKnobs, _runRound, _captureEnemy, _finishEnemy, _continueAttacking, _testLuck, _skipLuck, _resetBattle, _attemptEnergyBlast } = createCombat(simulatorContext);
const { _usePsiPower } = createEffects(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Appointment with F.E.A.R., book 213)
// Fighting Fantasy: opposed 2d6 + SKILL; ties miss, normal wounds cost 2 STAMINA.
// Luck modifies a landed hit; narrative bonuses and unmodeled effects are entered manually.
// Surrender, killing, Hero Points, and round limits share the outcome resolver.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;




















// Uncapped, true lifetime total (matches every other sim's history - the
// admin dashboard aggregates battle counts app-wide from this array).


// ── Combat ───────────────────────────────────────────────────────────────────



// Resolve surrender, death, and round limits consistently after attacks and Luck tests.
function _resolveRoundEnd(d) {
  if (d.pendingLuckQueue.length) return; // wait for the Luck test to resolve first

  if (d.enemy.stamina <= 0) {
    // Reduced straight to 0 without ever pausing in the 1-2 surrender
    // window - the rules treat that as a kill, no choice was ever offered.
    _appendLog(d, t('battlesim213.log.killed_outright', { enemy: _enemyNameSafe(d), n: HERO_POINT_PENALTY }));
    d.player.heroPoints -= HERO_POINT_PENALTY;
    _appendLog(d, t('battlesim213.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return;
  }
  if (d.enemy.stamina > 0 && d.enemy.stamina <= 2) {
    d.pendingSurrender = true;
    _appendLog(d, t('battlesim213.log.surrenders', { enemy: _enemyNameSafe(d), stamina: d.enemy.stamina }));
    return;
  }
  if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim213.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return;
  }
  // Warn once at the threshold; later rounds remain playable.
  if (d.player.forceLossAfterRounds > 0 && d.roundsThisBattle === d.player.forceLossAfterRounds) {
    _appendLog(d, t('battlesim213.log.round_limit'));
  }
}







// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome.
// Same table every sim in this app uses.






// ── Super Powers ─────────────────────────────────────────────────────────────





// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim213-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                              el.innerHTML = t('battlesim213.status.not_ready');
  else if (d.player.stamina <= 0)            el.innerHTML = t('battlesim213.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= 0 && !d.pendingSurrender) el.innerHTML = t('battlesim213.status.victory', { trophy: SVG_TROPHY });
  else                                        el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0 && !d.pendingSurrender);
  document.getElementById('sim213-round').disabled = over || !!d.pendingLuckQueue.length || d.pendingSurrender;
  document.getElementById('sim213-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim213-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim213-psi-use').disabled =
    notReady || (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
  document.getElementById('sim213-eblast-use').disabled =
    notReady || d.roundsThisBattle > 0 || !hasEnemy;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim213-history-summary');
  const listEl = document.getElementById('sim213-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim213.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim213.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim213.history.won') : t('battlesim213.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim213-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim213-player-skill').value      = d.player.skill;
  document.getElementById('sim213-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim213-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim213-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim213-player-luck').value       = d.player.luck;
  document.getElementById('sim213-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim213-player-atkmod').value     = d.player.attackModifier;
  document.getElementById('sim213-player-hero').value       = d.player.heroPoints;

  const rollBtn = document.getElementById('sim213-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim213.btn.rolled') : t('battlesim213.btn.roll');

  const powerSel = document.getElementById('sim213-power');
  powerSel.value = d.player.superPower;
  powerSel.disabled = d.rolled;
  document.getElementById('sim213-psi-row').style.display    = d.player.superPower === 'psi'         ? '' : 'none';
  document.getElementById('sim213-eblast-row').style.display = d.player.superPower === 'energyblast'  ? '' : 'none';

  document.getElementById('sim213-enemy-pick').value       = d.enemy.name;
  document.getElementById('sim213-enemy-skill').value      = d.enemy.skill;
  document.getElementById('sim213-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim213-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim213-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim213-enemy-roundlimit').value = d.player.forceLossAfterRounds;

  const pendingLuckEl = document.getElementById('sim213-luck-prompt');
  pendingLuckEl.style.display = d.pendingLuckQueue.length ? '' : 'none';
  const pendingSurrEl = document.getElementById('sim213-surrender-prompt');
  pendingSurrEl.style.display = d.pendingSurrender ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim213() {
  const overlay = document.getElementById('sim213-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim213(); return; }
  _renderAll();
}

function openSim213() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim213-overlay').classList.add('active');
}

function closeSim213() {
  document.getElementById('sim213-overlay')?.classList.remove('active');
}

export function setSim213Visible(visible) {
  const btn = document.getElementById('sim213-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim213();
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



export function initSim213() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim213-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim213-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim213.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim213-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim213.btn.roll')}</button>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim213.ui.super_power')}</span>
              <select id="sim213-power" class="inv-edit-input bsim-select">
                ${SUPER_POWERS.map(p => `<option value="${p[0]}">${escapeHtml(t(p[1]))}</option>`).join('')}
              </select>
            </div>
            ${_numField(t('battlesim213.ui.skill'), 'sim213-player-skill')}
            ${_numField(t('battlesim213.ui.skill_initial'), 'sim213-player-skillmax')}
            ${_numField(t('battlesim213.ui.stamina'), 'sim213-player-stamina')}
            ${_numField(t('battlesim213.ui.stamina_initial'), 'sim213-player-staminamax')}
            ${_numField(t('battlesim213.ui.luck'), 'sim213-player-luck')}
            ${_numField(t('battlesim213.ui.luck_initial'), 'sim213-player-luckmax')}
            ${_numField(t('battlesim213.ui.atkmod'), 'sim213-player-atkmod')}
            ${_numField(t('battlesim213.ui.hero_points'), 'sim213-player-hero')}
            <div id="sim213-psi-row" class="inv-edit-row bsim-ae-row" style="display:none">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim213.ui.psi_power')}</span>
              <button id="sim213-psi-use" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim213.btn.psi_use', { n: SUPER_POWER_STAMINA_COST, stamina: t('battlesim213.ui.stamina') })}</button>
            </div>
            <div id="sim213-eblast-row" class="inv-edit-row bsim-ae-row" style="display:none">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim213.ui.energy_blast')}</span>
              <button id="sim213-eblast-use" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim213.btn.eblast_attempt', { n: SUPER_POWER_STAMINA_COST, stamina: t('battlesim213.ui.stamina') })}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim213.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim213.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim213-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim213-enemy-pick-dropdown">
                <ul id="sim213-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim213.ui.skill'), 'sim213-enemy-skill')}
            ${_numField(t('battlesim213.ui.stamina'), 'sim213-enemy-stamina')}
            ${_numField(t('battlesim213.ui.stamina_max'), 'sim213-enemy-staminamax')}
            ${_numField(t('battlesim213.ui.wound_dmg'), 'sim213-enemy-wounddmg')}
            ${_numField(t('battlesim213.ui.round_limit'), 'sim213-enemy-roundlimit')}
          </div>
          <div id="sim213-status" class="bsim-status"></div>
          <div id="sim213-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim213.btn.luck_prompt')}</span>
            <button id="sim213-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim213.btn.luck_yes')}</button>
            <button id="sim213-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim213.btn.luck_no')}</button>
          </div>
          <div id="sim213-surrender-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim213.ui.enemy_surrenders')}</span>
            <button id="sim213-capture" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim213.btn.capture')}</button>
            <button id="sim213-finish" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim213.btn.finish', { n: HERO_POINT_PENALTY })}</button>
            <button id="sim213-continue" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim213.btn.continue')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim213-round" class="inv-add-btn bsim-action-primary">${t('battlesim213.btn.round')}</button>
            <button id="sim213-reset" class="inv-add-btn">${t('battlesim213.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim213-history-summary">${t('battlesim213.history.summary', { n: 0 })}</summary>
            <div id="sim213-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim213-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim213-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim213);
  document.getElementById('sim213-close').addEventListener('click', closeSim213);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim213(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim213-overlay'),
    open:  openSim213,
    close: closeSim213,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim213();
  });

  document.getElementById('sim213-round').addEventListener('click', _runRound);
  document.getElementById('sim213-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim213-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim213-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim213-capture').addEventListener('click', _captureEnemy);
  document.getElementById('sim213-finish').addEventListener('click', _finishEnemy);
  document.getElementById('sim213-continue').addEventListener('click', _continueAttacking);
  document.getElementById('sim213-psi-use').addEventListener('click', _usePsiPower);
  document.getElementById('sim213-eblast-use').addEventListener('click', _attemptEnergyBlast);

  document.getElementById('sim213-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = d.player.superPower === 'strength' ? 13 : (_roll1d6() + 6);
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim213.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim213-power').addEventListener('change', e => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.superPower = e.target.value;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim213-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim213-player-skill':      ['player', 'skill'],
    'sim213-player-skillmax':   ['player', 'skillInitial'],
    'sim213-player-stamina':    ['player', 'stamina'],
    'sim213-player-staminamax': ['player', 'staminaInitial'],
    'sim213-player-luck':       ['player', 'luck'],
    'sim213-player-luckmax':    ['player', 'luckInitial'],
    'sim213-player-atkmod':     ['player', 'attackModifier'],
    'sim213-player-hero':       ['player', 'heroPoints'],
    'sim213-enemy-skill':       ['enemy', 'skill'],
    'sim213-enemy-stamina':     ['enemy', 'stamina'],
    'sim213-enemy-staminamax':  ['enemy', 'staminaMax'],
    'sim213-enemy-wounddmg':    ['player', 'enemyWoundDamage'],
    'sim213-enemy-roundlimit':  ['player', 'forceLossAfterRounds'],
  };
  // Attack modifiers and Hero Points may be negative; other fields stay non-negative.
  const NEGATIVE_OK = new Set(['sim213-player-atkmod', 'sim213-player-hero']);
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = NEGATIVE_OK.has(id) ? Number(val) : Math.max(0, val);
    if (id === 'sim213-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim213-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim213-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim213-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim213-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim213-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim213-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim213-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim213-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = NEGATIVE_OK.has(input.id);
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim213-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = NEGATIVE_OK.has(btnEl.dataset.id);
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim213-enemy-pick', 'sim213-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.skill = enemy.attack;
    if (enemy.hp != null)     { d.enemy.stamina = enemy.hp; d.enemy.staminaMax = enemy.hp; }
    d.roundsThisBattle = 0;
    d.pendingLuckQueue = [];
    d.pendingSurrender = false;
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

export { initSim213 as init, renderSim213 as render, setSim213Visible as setVisible };
