// Battle Simulator — book 463 "Изпитанието" (Майкъл Майндкрайм).
// Custom combat (NOT Fighting Fantasy): two stats per side, енергия (HP) and
// сила (base strength). Each fight opens with a fight-strength roll per side
// (base + ceil(d12roll/2), d12 ∈ 2..12 from the ШАНС table). Each exchange of
// blows: blow = fightStr + ceil(roll/2) per side; compare the two blows —
//   |diff| ≤ 1 → both lose 1 energy;
//   your blow ≥ +2 → enemy loses 3; his blow ≥ +2 → you lose 3.
// Repeat until one side's energy hits 0. Enemies come from book_enemies.
import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../core/state.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';

const ID = 'sim463', K = 'battlesim463';
const tk = (suffix, params) => t(`${K}.${suffix}`, params);
const el = id => document.getElementById(`${ID}-${id}`);

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// d12 table roll (2..12, as two six-sided dice) and its halved, rounded-up value.
const _tableRoll = () => (1 + Math.floor(Math.random() * 6)) + (1 + Math.floor(Math.random() * 6));
const _half = roll => Math.ceil(roll / 2);

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt[ID]) pt[ID] = {};
  const d = pt[ID];
  if (!d.player || typeof d.player.sila !== 'number') d.player = { sila: 16, energy: 16 };
  if (typeof d.player.energy !== 'number') d.player.energy = 16;
  if (!d.enemy) d.enemy = { name: '', sila: 0, energy: 0, curEnergy: 0, hasStats: false };
  if (typeof d.enemy.curEnergy !== 'number') d.enemy.curEnergy = d.enemy.energy;
  if (!d.fight) d.fight = { ready: false, pStr: 0, eStr: 0 };
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

const _enemyName = d => d.enemy.name.trim() || tk('ui.enemy');
const _over = d => d.fight.ready && (d.player.energy <= 0 || d.enemy.curEnergy <= 0);
const _fighting = d => d.fight.ready && !_over(d);

function _log(d, line) { d.log.push(line); if (d.log.length > 300) d.log.shift(); }

function _startFight(d) {
  const pr = _tableRoll(), er = _tableRoll();
  d.fight = {
    ready: true,
    pStr: d.player.sila + _half(pr),
    eStr: d.enemy.sila + _half(er),
    recorded: false,
  };
  d.enemy.curEnergy = d.enemy.energy;
  _log(d, tk('log.fight_start', {
    pbase: d.player.sila, proll: pr, phalf: _half(pr), pstr: d.fight.pStr,
    name: escapeHtml(_enemyName(d)), ebase: d.enemy.sila, eroll: er, ehalf: _half(er), estr: d.fight.eStr,
  }));
}

function _record(d, outcome) { d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() }); }

function _blow(d) {
  if (!_fighting(d)) return;
  const pr = _tableRoll(), er = _tableRoll();
  const pb = d.fight.pStr + _half(pr), eb = d.fight.eStr + _half(er);
  const diff = pb - eb;
  let line;
  if (Math.abs(diff) <= 1) {
    d.player.energy = Math.max(0, d.player.energy - 1);
    d.enemy.curEnergy = Math.max(0, d.enemy.curEnergy - 1);
    line = tk('log.blow_even', { proll: pr, pb, eroll: er, eb, pe: d.player.energy, ee: d.enemy.curEnergy });
  } else if (diff >= 2) {
    d.enemy.curEnergy = Math.max(0, d.enemy.curEnergy - 3);
    line = tk('log.blow_hit', { proll: pr, pb, eroll: er, eb, name: escapeHtml(_enemyName(d)), ee: d.enemy.curEnergy });
  } else {
    d.player.energy = Math.max(0, d.player.energy - 3);
    line = tk('log.blow_taken', { proll: pr, pb, eroll: er, eb, pe: d.player.energy });
  }
  _log(d, line);
  if (d.enemy.curEnergy <= 0) { _log(d, `${SVG_TROPHY} ${tk('log.win')}`); if (!d.fight.recorded) { _record(d, 'win'); d.fight.recorded = true; } }
  else if (d.player.energy <= 0) { _log(d, `${SVG_SKULL} ${tk('log.loss')}`); if (!d.fight.recorded) { _record(d, 'loss'); d.fight.recorded = true; } }
}

function _runBlow() { const d = _data(); if (!d) return; _blow(d); saveState(); _renderAll(); }
function _runToEnd() {
  const d = _data(); if (!d || !_fighting(d)) return;
  let guard = 0; while (_fighting(d) && guard++ < 1000) _blow(d);
  saveState(); _renderAll();
}
function _newFight() {
  const d = _data(); if (!d || !d.enemy.hasStats) { showAlert(tk('status.pick')); return; }
  if (d.log.length) _log(d, tk('log.sep'));
  _startFight(d); saveState(); _renderAll();
}

// ── Render ──────────────────────────────────────────────────────────────────
function _setVal(id, v) { const node = el(id); if (node && document.activeElement !== node) node.value = v; }

function _renderStatus(d) {
  const node = el('status'); if (!node) return;
  if (!d.enemy.hasStats) node.innerHTML = tk('status.pick');
  else if (!d.fight.ready) node.innerHTML = tk('status.ready', { enemy: escapeHtml(_enemyName(d)) });
  else if (d.player.energy <= 0) node.innerHTML = `${SVG_SKULL} ${tk('status.defeat')}`;
  else if (d.enemy.curEnergy <= 0) node.innerHTML = `${SVG_TROPHY} ${tk('status.victory')}`;
  else node.innerHTML = tk('status.fighting', { enemy: escapeHtml(_enemyName(d)), ee: d.enemy.curEnergy, pe: d.player.energy });
  const fs = el('fightstr');
  if (fs) fs.innerHTML = d.fight.ready ? tk('ui.fightstr', { pstr: d.fight.pStr, estr: d.fight.eStr }) : '';
  if (el('strike')) el('strike').disabled = !_fighting(d);
  if (el('to-end')) el('to-end').disabled = !_fighting(d);
  if (el('reset')) el('reset').disabled = !d.enemy.hasStats;
}

function _renderInputs(d) {
  _setVal('player-sila', d.player.sila);
  _setVal('player-energy', d.player.energy);
  _setVal('e-sila', d.enemy.sila);
  _setVal('e-energy', d.enemy.curEnergy);
  const pick = el('enemy-pick');
  if (pick && document.activeElement !== pick) pick.value = d.enemy.name;
  _renderStatus(d);
}

function _renderLog(d) { const node = el('log'); if (node) node.innerHTML = d.log.slice().reverse().join('<br>'); }

function _renderHistory(d) {
  const sum = el('history-summary'), list = el('history-list');
  if (!sum || !list) return;
  sum.textContent = tk('history.summary', { n: d.history.length });
  if (!d.history.length) { list.innerHTML = `<div class="bsim-history-empty">${tk('history.empty')}</div>`; return; }
  list.innerHTML = d.history.slice().reverse().map(h => {
    const icon = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const res = h.outcome === 'win' ? tk('history.won') : tk('history.lost');
    const date = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row"><span>${icon} ${escapeHtml(h.enemy)} - ${res}</span><span class="bsim-history-meta">${date}</span></div>`;
  }).join('');
}

function _renderAll() { const d = _data(); if (!d) { _close(); return; } _renderInputs(d); _renderLog(d); _renderHistory(d); }

export function renderSim463() {
  const overlay = el('overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { _close(); return; }
  _renderAll();
}

function _open() { if (!_data()) { showAlert(t('battlesim.no_active_playthrough')); return; } _renderAll(); el('overlay').classList.add('active'); }
function _close() { el('overlay')?.classList.remove('active'); }
export function setSim463Visible(value) { if (el('btn')) el('btn').style.display = value ? '' : 'none'; if (!value) _close(); }

// ── Enemy autocomplete (book_enemies) ────────────────────────────────────────
let _enemyList = null;
async function _loadEnemyList() {
  if (_enemyList) return _enemyList;
  try { const res = await apiFetch(`/api/books/${currentBookId}/enemies`); _enemyList = res.ok ? await res.json() : []; }
  catch (_) { _enemyList = []; }
  return _enemyList;
}
function _applyEnemy(d, enemy) {
  d.enemy = {
    name: enemy.name,
    sila: enemy.attack || 0,
    energy: enemy.hp || 0,
    curEnergy: enemy.hp || 0,
    hasStats: enemy.attack != null && enemy.hp != null,
  };
  if (d.enemy.hasStats) _startFight(d);
}

function _setupEnemyAutocomplete() {
  const input = el('enemy-pick'), dropdown = el('enemy-pick-dropdown');
  let matches = [], activeIdx = -1;
  const closeDropdown = () => { dropdown.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
  function renderList(q) {
    const list = _enemyList || [], ql = q.trim().toLowerCase();
    matches = ql ? list.filter(e => e.name.toLowerCase().includes(ql)) : list;
    if (!matches.length) { closeDropdown(); return; }
    dropdown.innerHTML = matches.map((e, i) => `<li role="option" id="${ID}-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${tk('ui.sila')}:${e.attack ?? '?'} ${tk('ui.energy')}:${e.hp ?? '?'}</span></li>`).join('');
    activeIdx = -1; dropdown.classList.add('open'); input.setAttribute('aria-expanded', 'true'); input.removeAttribute('aria-activedescendant');
  }
  function select(enemy) {
    const d = _data(); if (!d || !enemy) return;
    input.value = enemy.name; _applyEnemy(d, enemy); closeDropdown(); saveState(); _renderAll();
  }
  dropdown.addEventListener('mousedown', e => { const li = e.target.closest('li'); if (!li) return; select(matches[+li.dataset.idx]); e.preventDefault(); });
  input.addEventListener('focus', async () => { input.removeAttribute('readonly'); await _loadEnemyList(); renderList(input.value); });
  input.addEventListener('input', async () => { await _loadEnemyList(); renderList(input.value); });
  input.addEventListener('blur', () => setTimeout(closeDropdown, 150));
  input.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('li'); if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); select(matches[activeIdx]); return; }
    else if (e.key === 'Escape') { closeDropdown(); return; }
    else return;
    items.forEach((li, i) => { li.classList.toggle('ac-active', i === activeIdx); li.setAttribute('aria-selected', String(i === activeIdx)); });
    if (activeIdx >= 0) input.setAttribute('aria-activedescendant', items[activeIdx].id); else input.removeAttribute('aria-activedescendant');
    items[activeIdx]?.scrollIntoView({ block: 'nearest' });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────
function _numField(label, id) {
  return `<div class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${label}</span><div class="inv-qty-wrap"><button class="inv-qty-btn" data-id="${id}" data-delta="-1">−</button><input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric"><button class="inv-qty-btn" data-id="${id}" data-delta="1">+</button></div></div>`;
}

export function initSim463() {
  if (el('overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = `${ID}-overlay`;
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr"><span class="inv-modal-title">${tk('ui.title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button></div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side"><div class="bsim-side-title">${tk('ui.you')}</div>${_numField(tk('ui.sila'), `${ID}-player-sila`)}${_numField(tk('ui.energy'), `${ID}-player-energy`)}</div>
          <div class="bsim-side"><div class="bsim-side-title">${tk('ui.enemy')}</div>
            <div class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk('ui.pick')}</span><div class="autocomplete-wrap bsim-enemy-ac"><input id="${ID}-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="${ID}-enemy-pick-dropdown"><ul id="${ID}-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul></div></div>
            ${_numField(tk('ui.sila'), `${ID}-e-sila`)}${_numField(tk('ui.energy'), `${ID}-e-energy`)}</div>
          <div id="${ID}-fightstr" class="bsim-status"></div>
          <div id="${ID}-status" class="bsim-status"></div>
          <p class="bsim-note">${tk('ui.note')}</p>
          <div class="inv-modal-ftr bsim-action-grid">
            <button id="${ID}-strike" class="inv-add-btn bsim-action-primary">${tk('btn.strike')}</button>
            <button id="${ID}-to-end" class="inv-add-btn">${tk('btn.to_end')}</button>
            <button id="${ID}-reset" class="inv-add-btn">${tk('btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right"><details class="bsim-history" open><summary id="${ID}-history-summary">${tk('history.summary', { n: 0 })}</summary><div id="${ID}-history-list" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id = `${ID}-btn`; btn.innerHTML = shortcutLabel(t('battlesim.title')); btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', _open);
  el('close').addEventListener('click', _close);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) _close(); });
  registerPanelShortcut('KeyS', { getButton: () => btn, getOverlay: () => overlay, otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== `${ID}-overlay`), open: _open, close: _close });

  el('strike').addEventListener('click', _runBlow);
  el('to-end').addEventListener('click', _runToEnd);
  el('reset').addEventListener('click', _newFight);

  const FIELD_MAP = {
    [`${ID}-player-sila`]: ['player', 'sila'],
    [`${ID}-player-energy`]: ['player', 'energy'],
    [`${ID}-e-sila`]: ['enemy', 'sila'],
    [`${ID}-e-energy`]: ['enemy', 'curEnergy'],
  };
  function _applyField(id, val) {
    const d = _data(); if (!d) return;
    const map = FIELD_MAP[id]; if (!map) return;
    val = Math.max(0, val);
    if (map[0] === 'enemy') { d.enemy.hasStats = true; if (id === `${ID}-e-sila`) d.enemy.sila = val; if (id === `${ID}-e-energy`) d.enemy.energy = val; }
    d[map[0]][map[1]] = val;
    saveState(); _renderInputs(d);
  }
  overlay.querySelectorAll('.inv-qty-input').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      _applyField(btnEl.dataset.id, Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta)));
    });
  });

  _setupEnemyAutocomplete();
}
