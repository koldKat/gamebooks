// Battle Simulator (Сенките на мрака, book 661, Kung-Fu style book)
// Encounter-specific totals stay manual, including matching forms.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../core/state.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const TYPES = ['rock', 'paper', 'scissors'];
const STAT_BY_TYPE = { rock: 'sila', paper: 'lovkost', scissors: 'barzina' };

// Paper beats Rock, Scissors beats Paper, Rock beats Scissors.
function _beats(a, b) {
  return (a === 'paper' && b === 'rock') || (a === 'scissors' && b === 'paper') || (a === 'rock' && b === 'scissors');
}

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim661) {
    pt.sim661 = {
      player: {
        sila: 0, lovkost: 0, barzina: 0, umenie: 0,
        formType: 'rock', formSila: 0, formLovkost: 0, formBarzina: 0,
      },
      enemy: {
        name: '', sila: 0, lovkost: 0, barzina: 0, umenie: 0,
        formType: 'rock', formSila: 0, formLovkost: 0, formBarzina: 0,
      },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim661;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _formStat(side, statKey) {
  return statKey === 'sila' ? side.formSila : statKey === 'lovkost' ? side.formLovkost : side.formBarzina;
}
function _generalStat(side, statKey) {
  return side[statKey];
}

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
}

// ── Resolution helper (not automatic combat - see header) ──────────────────

function _resolve() {
  const d = _data();
  if (!d) return null;
  const pType = d.player.formType;
  const eType = d.enemy.formType;
  if (pType === eType) {
    const statKey = STAT_BY_TYPE[pType];
    return {
      tie: true, statKey,
      playerGeneral: _generalStat(d.player, statKey), playerForm: _formStat(d.player, statKey), playerSkill: d.player.umenie,
      enemyGeneral: _generalStat(d.enemy, statKey), enemyForm: _formStat(d.enemy, statKey), enemySkill: d.enemy.umenie,
    };
  }
  const winningType = _beats(pType, eType) ? pType : eType;
  const statKey = STAT_BY_TYPE[winningType];
  const playerWinsType = winningType === pType;
  return {
    tie: false, statKey, playerWinsType,
    playerGeneral: _generalStat(d.player, statKey), playerForm: _formStat(d.player, statKey), playerSkill: d.player.umenie,
    enemyGeneral: _generalStat(d.enemy, statKey), enemyForm: _formStat(d.enemy, statKey), enemySkill: d.enemy.umenie,
  };
}

function _renderResolution() {
  const d = _data();
  const el = document.getElementById('sim661-resolution');
  if (!d || !el) return;
  const r = _resolve();
  if (!r) { el.innerHTML = ''; return; }
  if (r.tie) {
    el.innerHTML = t('battlesim661.resolve.tie', {
      stat: t(`battlesim661.ui.${r.statKey}`),
      playerGeneral: r.playerGeneral, playerForm: r.playerForm, playerSkill: r.playerSkill,
      enemyGeneral: r.enemyGeneral, enemyForm: r.enemyForm, enemySkill: r.enemySkill,
    });
  } else {
    el.innerHTML = t('battlesim661.resolve.mismatch', {
      stat: t(`battlesim661.ui.${r.statKey}`),
      winner: r.playerWinsType ? t('battlesim661.ui.you') : _enemyNameSafe(d),
      playerGeneral: r.playerGeneral, playerForm: r.playerForm, playerSkill: r.playerSkill,
      enemyGeneral: r.enemyGeneral, enemyForm: r.enemyForm, enemySkill: r.enemySkill,
    });
  }
}

function _recordWin() {
  const d = _data();
  if (!d) return;
  _appendLog(d, `${SVG_TROPHY} ${t('battlesim661.log.win', { enemy: _enemyNameSafe(d) })}`);
  _recordOutcome(d, 'win');
  saveState();
  _renderAll();
}
function _recordLoss() {
  const d = _data();
  if (!d) return;
  _appendLog(d, `${SVG_SKULL} ${t('battlesim661.log.loss', { enemy: _enemyNameSafe(d) })}`);
  _recordOutcome(d, 'loss');
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim661-history-summary');
  const listEl = document.getElementById('sim661-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim661.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim661.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim661.history.won') : t('battlesim661.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim661-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim661-player-sila').value     = d.player.sila;
  document.getElementById('sim661-player-lovkost').value  = d.player.lovkost;
  document.getElementById('sim661-player-barzina').value  = d.player.barzina;
  document.getElementById('sim661-player-umenie').value   = d.player.umenie;
  document.getElementById('sim661-player-formtype').value = d.player.formType;
  document.getElementById('sim661-player-formsila').value    = d.player.formSila;
  document.getElementById('sim661-player-formlovkost').value = d.player.formLovkost;
  document.getElementById('sim661-player-formbarzina').value = d.player.formBarzina;

  document.getElementById('sim661-enemy-pick').value      = d.enemy.name;
  document.getElementById('sim661-enemy-sila').value      = d.enemy.sila;
  document.getElementById('sim661-enemy-lovkost').value   = d.enemy.lovkost;
  document.getElementById('sim661-enemy-barzina').value   = d.enemy.barzina;
  document.getElementById('sim661-enemy-umenie').value    = d.enemy.umenie;
  document.getElementById('sim661-enemy-formtype').value  = d.enemy.formType;
  document.getElementById('sim661-enemy-formsila').value    = d.enemy.formSila;
  document.getElementById('sim661-enemy-formlovkost').value = d.enemy.formLovkost;
  document.getElementById('sim661-enemy-formbarzina').value = d.enemy.formBarzina;

  _renderResolution();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim661() {
  const overlay = document.getElementById('sim661-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim661(); return; }
  _renderAll();
}

function openSim661() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim661-overlay').classList.add('active');
}

function closeSim661() {
  document.getElementById('sim661-overlay')?.classList.remove('active');
}

export function setSim661Visible(visible) {
  const btn = document.getElementById('sim661-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim661();
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
  const input    = document.getElementById('sim661-enemy-pick');
  const dropdown = document.getElementById('sim661-enemy-pick-dropdown');
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
      `<li role="option" id="sim661-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">С:${e.attack ?? '?'} Л:${e.defense ?? '?'} Б:${e.hp ?? '?'} У:${e.pb ?? '?'}</span></li>`
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
    if (enemy.attack != null)  d.enemy.sila = enemy.attack;
    if (enemy.defense != null) d.enemy.lovkost = enemy.defense;
    if (enemy.hp != null)      d.enemy.barzina = enemy.hp;
    if (enemy.pb != null)      d.enemy.umenie = enemy.pb;
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

function _typeSelect(id) {
  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${t('battlesim661.ui.form_type')}</span>
      <select id="${id}" class="inv-edit-input">
        <option value="rock">${t('battlesim661.ui.rock')}</option>
        <option value="paper">${t('battlesim661.ui.paper')}</option>
        <option value="scissors">${t('battlesim661.ui.scissors')}</option>
      </select>
    </div>`;
}

export function initSim661() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim661-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim661.ui.title')}</span>
        <button id="sim661-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim661.ui.you')}</div>
            ${_numField(t('battlesim661.ui.sila'), 'sim661-player-sila')}
            ${_numField(t('battlesim661.ui.lovkost'), 'sim661-player-lovkost')}
            ${_numField(t('battlesim661.ui.barzina'), 'sim661-player-barzina')}
            ${_numField(t('battlesim661.ui.umenie'), 'sim661-player-umenie')}
            ${_typeSelect('sim661-player-formtype')}
            ${_numField(t('battlesim661.ui.form_sila'), 'sim661-player-formsila')}
            ${_numField(t('battlesim661.ui.form_lovkost'), 'sim661-player-formlovkost')}
            ${_numField(t('battlesim661.ui.form_barzina'), 'sim661-player-formbarzina')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim661.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim661.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim661-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim661-enemy-pick-dropdown">
                <ul id="sim661-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim661.ui.sila'), 'sim661-enemy-sila')}
            ${_numField(t('battlesim661.ui.lovkost'), 'sim661-enemy-lovkost')}
            ${_numField(t('battlesim661.ui.barzina'), 'sim661-enemy-barzina')}
            ${_numField(t('battlesim661.ui.umenie'), 'sim661-enemy-umenie')}
            ${_typeSelect('sim661-enemy-formtype')}
            ${_numField(t('battlesim661.ui.form_sila'), 'sim661-enemy-formsila')}
            ${_numField(t('battlesim661.ui.form_lovkost'), 'sim661-enemy-formlovkost')}
            ${_numField(t('battlesim661.ui.form_barzina'), 'sim661-enemy-formbarzina')}
          </div>
          <div id="sim661-resolution" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim661-win" class="inv-add-btn bsim-action-primary">${t('battlesim661.btn.win')}</button>
            <button id="sim661-loss" class="inv-add-btn">${t('battlesim661.btn.loss')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim661-history-summary">${t('battlesim661.history.summary', { n: 0 })}</summary>
            <div id="sim661-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim661-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim661-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim661);
  document.getElementById('sim661-close').addEventListener('click', closeSim661);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim661(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim661-overlay'),
    open:  openSim661,
    close: closeSim661,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim661();
  });

  document.getElementById('sim661-win').addEventListener('click', _recordWin);
  document.getElementById('sim661-loss').addEventListener('click', _recordLoss);

  document.getElementById('sim661-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim661-player-formtype').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.formType = e.target.value;
    saveState();
    _renderResolution();
  });
  document.getElementById('sim661-enemy-formtype').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.enemy.formType = e.target.value;
    saveState();
    _renderResolution();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim661-player-sila':         ['player', 'sila'],
    'sim661-player-lovkost':      ['player', 'lovkost'],
    'sim661-player-barzina':      ['player', 'barzina'],
    'sim661-player-umenie':       ['player', 'umenie'],
    'sim661-player-formsila':     ['player', 'formSila'],
    'sim661-player-formlovkost':  ['player', 'formLovkost'],
    'sim661-player-formbarzina':  ['player', 'formBarzina'],
    'sim661-enemy-sila':          ['enemy', 'sila'],
    'sim661-enemy-lovkost':       ['enemy', 'lovkost'],
    'sim661-enemy-barzina':       ['enemy', 'barzina'],
    'sim661-enemy-umenie':        ['enemy', 'umenie'],
    'sim661-enemy-formsila':      ['enemy', 'formSila'],
    'sim661-enemy-formlovkost':   ['enemy', 'formLovkost'],
    'sim661-enemy-formbarzina':   ['enemy', 'formBarzina'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = Math.max(0, val);
    d[map[0]][map[1]] = val;
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim661-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim661-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete();
}
