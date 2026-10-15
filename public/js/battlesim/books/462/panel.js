import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, SVG_SKULL, SVG_TROPHY, _appendLog, _data, _enemyDefeated, _enemyList, _enemyName, _enemyNameSafe, _finishSourceRound, _loadEnemyList, _notReady, _numField, _receiveSourceHit, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _renderStatus, _resetBattle, _resetEncounterKnobs, _roll1d6, _roll2d6, _runLegacyRound, _runRound, _runSourceRound, _setupEnemyAutocomplete, _sideAlive, _skipLuck, _sourceFightOver, _switchSourceTarget, _testLuck, _testSourceLuck, apiFetch, closeSim462, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim462, openSim462, registerPanelShortcut, renderSim462, saveState, setSim462Visible, shortcutLabel, showAlert, t });
const { _data, _notReady, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _enemyDefeated, _resetEncounterKnobs, _runRound, _runLegacyRound, _sideAlive, _sourceFightOver, _finishSourceRound, _receiveSourceHit, _runSourceRound, _switchSourceTarget, _testLuck, _testSourceLuck, _skipLuck, _resetBattle } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Гората на обречените / Forest of the Doomed, book 462)
// Fighting Fantasy: opposed 2d6 + SKILL; ties miss, normal wounds cost 2 STAMINA.
// Luck modifies a landed hit; narrative bonuses and unmodeled effects are entered manually.
// New encounters track paired targets, whip attacks, shield protection and paralysis.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Keep lifetime outcomes: admin totals require the full history.

// ── Combat ───────────────────────────────────────────────────────────────────

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome.
// Same Lucky/Unlucky table as every other FF sim in this app.

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim462-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim462.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim462.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && (d.combatRulesVersion === 2 ? _sourceFightOver(d) : _enemyDefeated(d))) el.innerHTML = t('battlesim462.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const missingSide = d.combatRulesVersion === 2 && d.encounter.paired && d.sideEnemy.staminaMax <= 0;
  const over = notReady || !hasEnemy || missingSide || d.player.stamina <= 0 || (hasEnemy && (d.combatRulesVersion === 2 ? _sourceFightOver(d) : _enemyDefeated(d)));
  document.getElementById('sim462-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim462-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim462-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim462-history-summary');
  const listEl = document.getElementById('sim462-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim462.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim462.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim462.history.won') : t('battlesim462.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim462-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim462-player-skill').value      = d.player.skill;
  document.getElementById('sim462-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim462-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim462-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim462-player-luck').value       = d.player.luck;
  document.getElementById('sim462-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim462-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim462-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim462.btn.rolled') : t('battlesim462.btn.roll');

  document.getElementById('sim462-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim462-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim462-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim462-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim462-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim462-player-wounddmg').value  = d.player.playerWoundDamage;
  document.getElementById('sim462-enemy-threshold').value  = d.player.enemyDefeatThreshold;
  document.getElementById('sim462-enemy-firstwin').checked = d.player.enemyAutoWinFirstRound;
  const future = d.combatRulesVersion === 2;
  document.getElementById('sim462-source-controls').style.display = future ? '' : 'none';
  if (future) {
    for (const key of ['paired', 'whip', 'shield']) {
      const input = document.getElementById('sim462-' + key);
      input.checked = d.encounter[key];
      input.disabled = d.roundsThisBattle > 0 || !!d.pendingLuckQueue.length;
    }
    document.getElementById('sim462-side-fields').style.display = d.encounter.paired ? '' : 'none';
    document.getElementById('sim462-side-pick').value = d.sideEnemy.name;
    document.getElementById('sim462-side-skill').value = d.sideEnemy.skill;
    document.getElementById('sim462-side-stamina').value = d.sideEnemy.stamina;
    document.getElementById('sim462-side-staminamax').value = d.sideEnemy.staminaMax;
    document.getElementById('sim462-paralyze').value = d.encounter.paralyzeAfter;
    document.getElementById('sim462-paralyze').disabled = d.roundsThisBattle > 0 || !!d.pendingLuckQueue.length;
    document.getElementById('sim462-side-pick').disabled = d.roundsThisBattle > 0 || !!d.pendingLuckQueue.length;
    document.getElementById('sim462-switch').disabled = !_sideAlive(d) || !!d.pendingLuckQueue.length || d.player.stamina <= 0;
  }

  const pendingEl = document.getElementById('sim462-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim462() {
  const overlay = document.getElementById('sim462-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim462(); return; }
  _renderAll();
}

function openSim462() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim462-overlay').classList.add('active');
}

function closeSim462() {
  document.getElementById('sim462-overlay')?.classList.remove('active');
}

export function setSim462Visible(visible) {
  const btn = document.getElementById('sim462-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim462();
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

export function initSim462() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim462-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim462-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim462.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim462-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim462.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim462.ui.skill'), 'sim462-player-skill')}
            ${_numField(t('battlesim462.ui.skill_initial'), 'sim462-player-skillmax')}
            ${_numField(t('battlesim462.ui.stamina'), 'sim462-player-stamina')}
            ${_numField(t('battlesim462.ui.stamina_initial'), 'sim462-player-staminamax')}
            ${_numField(t('battlesim462.ui.luck'), 'sim462-player-luck')}
            ${_numField(t('battlesim462.ui.luck_initial'), 'sim462-player-luckmax')}
            ${_numField(t('battlesim462.ui.atkmod'), 'sim462-player-atkmod')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim462.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim462.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim462-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim462-enemy-pick-dropdown">
                <ul id="sim462-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim462.ui.skill'), 'sim462-enemy-skill')}
            ${_numField(t('battlesim462.ui.stamina'), 'sim462-enemy-stamina')}
            ${_numField(t('battlesim462.ui.stamina_max'), 'sim462-enemy-staminamax')}
            ${_numField(t('battlesim462.ui.wound_dmg'), 'sim462-enemy-wounddmg')}
            ${_numField(t('battlesim462.ui.player_wound_dmg'), 'sim462-player-wounddmg')}
            ${_numField(t('battlesim462.ui.defeat_threshold'), 'sim462-enemy-threshold')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim462-enemy-firstwin" class="inv-edit-check"> ${t('battlesim462.ui.enemy_firstwin_toggle')}</label>
            </div>
            <div id="sim462-source-controls">
              <div class="inv-edit-row"><label class="inv-edit-check-label"><input type="checkbox" id="sim462-whip" class="inv-edit-check"> ${t('battlesim462.ui.whip')}</label></div>
              <div class="inv-edit-row"><label class="inv-edit-check-label"><input type="checkbox" id="sim462-shield" class="inv-edit-check"> ${t('battlesim462.ui.shield')}</label></div>
              ${_numField(t('battlesim462.ui.paralyze'), 'sim462-paralyze')}
              <div class="inv-edit-row"><label class="inv-edit-check-label"><input type="checkbox" id="sim462-paired" class="inv-edit-check"> ${t('battlesim462.ui.paired')}</label></div>
              <div id="sim462-side-fields">
                <div class="inv-edit-row">
                  <span class="inv-edit-label bsim-stat-label">${t('battlesim462.ui.side')}</span>
                  <div class="autocomplete-wrap bsim-enemy-ac">
                    <input id="sim462-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim462-side-dropdown">
                    <ul id="sim462-side-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                  </div>
                </div>
                ${_numField(t('battlesim462.ui.skill'), 'sim462-side-skill')}
                ${_numField(t('battlesim462.ui.stamina'), 'sim462-side-stamina')}
                ${_numField(t('battlesim462.ui.stamina_max'), 'sim462-side-staminamax')}
                <button id="sim462-switch" class="inv-edit-done" type="button">${t('battlesim462.btn.switch')}</button>
              </div>
            </div>
          </div>
          <div id="sim462-status" class="bsim-status"></div>
          <div id="sim462-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim462.btn.luck_prompt')}</span>
            <button id="sim462-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim462.btn.luck_yes')}</button>
            <button id="sim462-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim462.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim462-round" class="inv-add-btn bsim-action-primary">${t('battlesim462.btn.round')}</button>
            <button id="sim462-reset" class="inv-add-btn">${t('battlesim462.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim462-history-summary">${t('battlesim462.history.summary', { n: 0 })}</summary>
            <div id="sim462-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim462-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim462-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim462);
  document.getElementById('sim462-close').addEventListener('click', closeSim462);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim462(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim462-overlay'),
    open:  openSim462,
    close: closeSim462,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim462();
  });

  document.getElementById('sim462-round').addEventListener('click', _runRound);
  document.getElementById('sim462-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim462-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim462-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim462-switch').addEventListener('click', _switchSourceTarget);
  for (const key of ['paired', 'whip', 'shield']) {
    document.getElementById('sim462-' + key).addEventListener('change', e => {
      const d = _data();
      if (d?.combatRulesVersion !== 2 || d.pendingLuckQueue.length || d.roundsThisBattle > 0) {
        _renderAll();
        return;
      }
      d.encounter[key] = e.target.checked;
      saveState();
      _renderAll();
    });
  }
  document.getElementById('sim462-side-pick').addEventListener('input', e => {
    const d = _data();
    if (d?.combatRulesVersion !== 2 || d.roundsThisBattle > 0) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim462-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim462.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim462-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim462-enemy-firstwin').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.enemyAutoWinFirstRound = e.target.checked;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim462-player-skill':      ['player', 'skill'],
    'sim462-player-skillmax':   ['player', 'skillInitial'],
    'sim462-player-stamina':    ['player', 'stamina'],
    'sim462-player-staminamax': ['player', 'staminaInitial'],
    'sim462-player-luck':       ['player', 'luck'],
    'sim462-player-luckmax':    ['player', 'luckInitial'],
    'sim462-player-atkmod':     ['player', 'attackModifier'],
    'sim462-enemy-skill':       ['enemy', 'skill'],
    'sim462-enemy-stamina':        ['enemy', 'stamina'],
    'sim462-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim462-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim462-player-wounddmg':      ['player', 'playerWoundDamage'],
    'sim462-enemy-threshold':      ['player', 'enemyDefeatThreshold'],
    'sim462-side-skill':           ['sideEnemy', 'skill'],
    'sim462-side-stamina':         ['sideEnemy', 'stamina'],
    'sim462-side-staminamax':      ['sideEnemy', 'staminaMax'],
    'sim462-paralyze':             ['encounter', 'paralyzeAfter'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    if (['sideEnemy', 'encounter'].includes(map[0]) && d.combatRulesVersion !== 2) return;
    if (id === 'sim462-paralyze' && (d.pendingLuckQueue.length || d.roundsThisBattle > 0)) return;
    // Allow negative attack modifiers; other fields stay non-negative.
    val = id === 'sim462-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim462-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim462-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim462-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim462-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim462-side-stamina') val = Math.min(val, d.sideEnemy.staminaMax);
    if (id === 'sim462-enemy-threshold') val = Math.min(val, Math.max(0, d.enemy.staminaMax - 1));
    d[map[0]][map[1]] = val;
    if (id === 'sim462-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim462-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim462-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim462-enemy-staminamax') {
      d.enemy.stamina = Math.min(d.enemy.stamina, val);
      d.player.enemyDefeatThreshold = Math.min(d.player.enemyDefeatThreshold, Math.max(0, val - 1));
    }
    if (id === 'sim462-side-staminamax') d.sideEnemy.stamina = Math.min(d.sideEnemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim462-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim462-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim462-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim462-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim462-enemy-pick', 'sim462-enemy-pick-dropdown', enemy => {
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
  _setupEnemyAutocomplete('sim462-side-pick', 'sim462-side-dropdown', enemy => {
    const d = _data();
    if (d?.combatRulesVersion !== 2 || d.pendingLuckQueue.length || d.roundsThisBattle > 0) return;
    d.sideEnemy = { name: enemy.name, skill: enemy.attack ?? 0, stamina: enemy.hp ?? 0, staminaMax: enemy.hp ?? 0 };
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

export { initSim462 as init, renderSim462 as render, setSim462Visible as setVisible };
