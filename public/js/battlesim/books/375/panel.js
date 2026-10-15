import { TECHNIQUES, DEF_FIELD } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, DEF_FIELD, SVG_SKULL, SVG_TROPHY, TECHNIQUES, _appendLog, _applyEnemyDefeat, _applyPlayerFall, _attack, _battleOver, _block, _busy, _consumeBlockPenalty, _data, _emptyEnemy, _enemyCounter, _enemyList, _enemyName, _enemyNameSafe, _loadEnemyList, _numField, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _resetBattle, _roll1d6, _roll2d6, _rollNd6, _setVal, _setupAutocomplete, _startEnemyFight, _takeHit, _techLabel, _throwFollowup, apiFetch, closeSim375, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim375, openSim375, registerPanelShortcut, renderSim375, saveState, setSim375Visible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _battleOver, _recordOutcome } = createState(simulatorContext);
const { _emptyEnemy, _roll2d6, _roll1d6, _rollNd6, _enemyName, _enemyNameSafe, _techLabel, _busy, _consumeBlockPenalty, _enemyCounter, _applyEnemyDefeat, _applyPlayerFall, _attack, _throwFollowup, _block, _takeHit, _resetBattle, _startEnemyFight } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Убиец! / The Assassin, book 375, Way of the Tiger 2)
// Way of the Tiger: roll 2d6 + technique against its encounter-specific defense.
// Track hand/kick/throw independently; shuriken, blocks, and Inner Force use their own rules.
// Narrative and unsupported encounter exceptions remain manual.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// ── Combat ───────────────────────────────────────────────────────────────────

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

function _setupAutocomplete(inputId, dropdownId, onSelect) {
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim375.ui.endurance')}:${e.hp ?? '?'}</span></li>`
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

// ── Render ───────────────────────────────────────────────────────────────────

function _setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

function _renderInputs(skipEnemyPick) {
  const d = _data();
  if (!d) return;
  const p = d.player, e = d.enemy;

  _setVal('sim375-player-endurance', p.endurance);
  _setVal('sim375-player-endurancemax', p.enduranceInitial);
  _setVal('sim375-player-innerforce', p.innerForce);
  _setVal('sim375-player-innerforcemax', p.innerForceInitial);
  _setVal('sim375-player-hand', p.hand);
  _setVal('sim375-player-kick', p.kick);
  _setVal('sim375-player-throw', p.throw);
  _setVal('sim375-player-shurikens', p.shurikens);
  _setVal('sim375-player-defense', p.defense);

  if (!skipEnemyPick) _setVal('sim375-enemy-pick', e.name);
  _setVal('sim375-enemy-endurance', e.endurance);
  _setVal('sim375-enemy-endurancemax', e.enduranceMax);
  _setVal('sim375-enemy-dmgdice', e.dmgDice);
  _setVal('sim375-enemy-dmgbonus', e.dmgBonus);
  _setVal('sim375-enemy-defhand', e.defHand);
  _setVal('sim375-enemy-defkick', e.defKick);
  _setVal('sim375-enemy-defthrow', e.defThrow);
  _setVal('sim375-enemy-defshuriken', e.defShuriken);

  const techSel = document.getElementById('sim375-technique');
  if (techSel) techSel.value = d.technique;
  const ifCheck = document.getElementById('sim375-innerforce-use');
  if (ifCheck) ifCheck.checked = d.useInnerForce;

  const busy = _busy(d);
  const over = _battleOver(d);
  document.getElementById('sim375-attack').disabled = busy || over;
  document.getElementById('sim375-technique').disabled = busy || over;
  document.getElementById('sim375-innerforce-use').disabled = busy || over || p.innerForce <= 0;

  const hitPrompt = document.getElementById('sim375-hit-prompt');
  hitPrompt.style.display = d.pendingEnemyHit ? '' : 'none';
  if (d.pendingEnemyHit) {
    document.getElementById('sim375-hit-prompt-text').textContent = t('battlesim375.ui.hit_prompt', { n: d.pendingEnemyHit.dmg });
  }

  const followupPrompt = document.getElementById('sim375-followup-prompt');
  followupPrompt.style.display = d.pendingThrowFollowup ? '' : 'none';

  const status = document.getElementById('sim375-status');
  if (p.endurance <= 0) status.innerHTML = t('battlesim375.status.fallen', { skull: SVG_SKULL });
  else if (e.enduranceMax > 0 && e.endurance <= 0) status.innerHTML = t('battlesim375.status.victory', { trophy: SVG_TROPHY });
  else status.innerHTML = '';

  const penaltyNote = document.getElementById('sim375-penalty-note');
  penaltyNote.style.display = p.blockPenaltyPending ? '' : 'none';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim375-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim375-history-summary');
  const listEl = document.getElementById('sim375-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim375.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim375.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim375.history.won') : t('battlesim375.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim375.ui.endurance')} ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim375() {
  const overlay = document.getElementById('sim375-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim375(); return; }
  _renderAll();
}

function openSim375() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim375-overlay').classList.add('active');
}

function closeSim375() {
  document.getElementById('sim375-overlay')?.classList.remove('active');
}

export function setSim375Visible(visible) {
  const btn = document.getElementById('sim375-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim375();
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initSim375() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim375-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim375.ui.title')}</span>
        <button id="sim375-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim375.ui.you')}</div>
            ${_numField(t('battlesim375.ui.endurance'), 'sim375-player-endurance')}
            ${_numField(t('battlesim375.ui.endurance_initial'), 'sim375-player-endurancemax')}
            ${_numField(t('battlesim375.ui.innerforce'), 'sim375-player-innerforce')}
            ${_numField(t('battlesim375.ui.innerforce_initial'), 'sim375-player-innerforcemax')}
            ${_numField(t('battlesim375.ui.hand'), 'sim375-player-hand')}
            ${_numField(t('battlesim375.ui.kick'), 'sim375-player-kick')}
            ${_numField(t('battlesim375.ui.throw'), 'sim375-player-throw')}
            ${_numField(t('battlesim375.ui.shurikens'), 'sim375-player-shurikens')}
            ${_numField(t('battlesim375.ui.player_defense'), 'sim375-player-defense')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim375.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim375.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim375-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim375-enemy-pick-dropdown">
                <ul id="sim375-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim375.ui.endurance'), 'sim375-enemy-endurance')}
            ${_numField(t('battlesim375.ui.endurance_max'), 'sim375-enemy-endurancemax')}
            ${_numField(t('battlesim375.ui.dmg_dice'), 'sim375-enemy-dmgdice')}
            ${_numField(t('battlesim375.ui.dmg_bonus'), 'sim375-enemy-dmgbonus')}
            ${_numField(t('battlesim375.ui.def_hand'), 'sim375-enemy-defhand')}
            ${_numField(t('battlesim375.ui.def_kick'), 'sim375-enemy-defkick')}
            ${_numField(t('battlesim375.ui.def_throw'), 'sim375-enemy-defthrow')}
            ${_numField(t('battlesim375.ui.def_shuriken'), 'sim375-enemy-defshuriken')}
          </div>
          <div class="inv-edit-row">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim375.ui.technique')}</span>
            <select id="sim375-technique" class="inv-edit-input">
              <option value="hand">${t('battlesim375.ui.tech_hand')}</option>
              <option value="kick">${t('battlesim375.ui.tech_kick')}</option>
              <option value="throw">${t('battlesim375.ui.tech_throw')}</option>
              <option value="shuriken">${t('battlesim375.ui.tech_shuriken')}</option>
            </select>
          </div>
          <div class="inv-edit-row">
            <label class="inv-edit-check-label"><input type="checkbox" id="sim375-innerforce-use" class="inv-edit-check"> ${t('battlesim375.ui.innerforce_use_toggle')}</label>
          </div>
          <div id="sim375-penalty-note" class="bsim-status" style="display:none">${t('battlesim375.ui.penalty_note')}</div>
          <div id="sim375-status" class="bsim-status"></div>
          <div id="sim375-hit-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span id="sim375-hit-prompt-text" class="inv-edit-label bsim-stat-label"></span>
            <button id="sim375-block" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim375.btn.block')}</button>
            <button id="sim375-take-hit" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim375.btn.take_hit')}</button>
          </div>
          <div id="sim375-followup-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim375.ui.followup_prompt')}</span>
            <button id="sim375-followup-hand" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim375.ui.tech_hand')}</button>
            <button id="sim375-followup-kick" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim375.ui.tech_kick')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim375-attack" class="inv-add-btn bsim-action-primary">${t('battlesim375.btn.attack')}</button>
            <button id="sim375-reset" class="inv-add-btn">${t('battlesim375.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim375-history-summary">${t('battlesim375.history.summary', { n: 0 })}</summary>
            <div id="sim375-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim375-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim375-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim375);
  document.getElementById('sim375-close').addEventListener('click', closeSim375);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim375(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim375-overlay'),
    open:  openSim375,
    close: closeSim375,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim375();
  });

  document.getElementById('sim375-attack').addEventListener('click', _attack);
  document.getElementById('sim375-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim375-block').addEventListener('click', _block);
  document.getElementById('sim375-take-hit').addEventListener('click', _takeHit);
  document.getElementById('sim375-followup-hand').addEventListener('click', () => _throwFollowup('hand'));
  document.getElementById('sim375-followup-kick').addEventListener('click', () => _throwFollowup('kick'));

  document.getElementById('sim375-technique').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.technique = e.target.value;
    saveState();
  });
  document.getElementById('sim375-innerforce-use').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.useInnerForce = e.target.checked;
    saveState();
  });

  document.getElementById('sim375-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim375-enemy-pick', 'sim375-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    _startEnemyFight(d, enemy);
    saveState();
    _renderAll();
  });

  const fieldMap = {
    'sim375-player-endurance': ['player', 'endurance'], 'sim375-player-endurancemax': ['player', 'enduranceInitial'],
    'sim375-player-innerforce': ['player', 'innerForce'], 'sim375-player-innerforcemax': ['player', 'innerForceInitial'],
    'sim375-player-hand': ['player', 'hand'], 'sim375-player-kick': ['player', 'kick'], 'sim375-player-throw': ['player', 'throw'],
    'sim375-player-shurikens': ['player', 'shurikens'], 'sim375-player-defense': ['player', 'defense'],
    'sim375-enemy-endurance': ['enemy', 'endurance'], 'sim375-enemy-endurancemax': ['enemy', 'enduranceMax'],
    'sim375-enemy-dmgdice': ['enemy', 'dmgDice'], 'sim375-enemy-dmgbonus': ['enemy', 'dmgBonus'],
    'sim375-enemy-defhand': ['enemy', 'defHand'], 'sim375-enemy-defkick': ['enemy', 'defKick'],
    'sim375-enemy-defthrow': ['enemy', 'defThrow'], 'sim375-enemy-defshuriken': ['enemy', 'defShuriken'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = parseInt(input.value, 10) || 0;
      d[path[0]][path[1]] = Math.max(0, val);
      saveState();
      _renderInputs(true);
    });
  }
  overlay.querySelectorAll('.inv-qty-btn').forEach(btn2 => {
    btn2.addEventListener('click', () => {
      const input = document.getElementById(btn2.dataset.id);
      if (!input) return;
      const delta = parseInt(btn2.dataset.delta, 10);
      input.value = (parseInt(input.value, 10) || 0) + delta;
      input.dispatchEvent(new Event('change'));
    });
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

export { initSim375 as init, renderSim375 as render, setSim375Visible as setVisible };
