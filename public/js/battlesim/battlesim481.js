// Battle Simulator (Кралска кръв, book 481)
// Opposed roll: both sides roll 1d6 + Сила; lower total loses 1 Издръжливост
// (ties cost nothing); fight continues until either side's Издръжливост hits 0.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../core/state.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

// One exchange: both roll 1d6 + Сила; lower total loses 1 Издръжливост; tie loses nothing.
export function resolveRound(playerSila, enemySila) {
  const playerRoll = _roll1d6();
  const enemyRoll = _roll1d6();
  const playerTotal = playerSila + playerRoll;
  const enemyTotal = enemySila + enemyRoll;
  if (playerTotal > enemyTotal) return { playerRoll, enemyRoll, playerTotal, enemyTotal, outcome: 'player', playerLoss: 0, enemyLoss: 1 };
  if (playerTotal < enemyTotal) return { playerRoll, enemyRoll, playerTotal, enemyTotal, outcome: 'enemy', playerLoss: 1, enemyLoss: 0 };
  return { playerRoll, enemyRoll, playerTotal, enemyTotal, outcome: 'tie', playerLoss: 0, enemyLoss: 0 };
}

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim481) {
    pt.sim481 = {
      player: { sila: 5, izd: 20 },
      enemy: { name: '', sila: 0, izd: 0, curIzd: 0, hasStats: false },
      log: [],
      history: [],
    };
  }
  const d = pt.sim481;
  if (!d.player) d.player = { sila: 5, izd: 20 };
  if (typeof d.player.sila !== 'number') d.player.sila = 5;
  if (typeof d.player.izd !== 'number') d.player.izd = 20;
  if (!d.enemy) d.enemy = { name: '', sila: 0, izd: 0, curIzd: 0, hasStats: false };
  if (typeof d.enemy.curIzd !== 'number') d.enemy.curIzd = d.enemy.izd;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim481.ui.enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 300) d.log.shift();
}

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
}

function _over(d) {
  return d.player.izd <= 0 || d.enemy.curIzd <= 0;
}
function _ready(d) {
  return d.enemy.hasStats;
}

function _finishWin(d) {
  _appendLog(d, `${SVG_TROPHY} ${t('battlesim481.log.win_footer')}`);
  _recordOutcome(d, 'win');
}
function _finishLoss(d) {
  _appendLog(d, `${SVG_SKULL} ${t('battlesim481.log.loss_footer')}`);
  _recordOutcome(d, 'loss');
}

// Resolves one round in place on `d`, appending the log line and recording the outcome if over.
function _stepRound(d) {
  const r = resolveRound(d.player.sila, d.enemy.sila);
  d.player.izd = Math.max(0, d.player.izd - r.playerLoss);
  d.enemy.curIzd = Math.max(0, d.enemy.curIzd - r.enemyLoss);

  if (r.outcome === 'player') {
    _appendLog(d, t('battlesim481.log.round_win', {
      name: _enemyNameSafe(d), proll: r.playerRoll, ptotal: r.playerTotal, eroll: r.enemyRoll, etotal: r.enemyTotal, izd: d.enemy.curIzd,
    }));
  } else if (r.outcome === 'enemy') {
    _appendLog(d, t('battlesim481.log.round_lose', {
      name: _enemyNameSafe(d), proll: r.playerRoll, ptotal: r.playerTotal, eroll: r.enemyRoll, etotal: r.enemyTotal, izd: d.player.izd,
    }));
  } else {
    _appendLog(d, t('battlesim481.log.round_tie', {
      name: _enemyNameSafe(d), proll: r.playerRoll, ptotal: r.playerTotal, eroll: r.enemyRoll, etotal: r.enemyTotal,
    }));
  }

  if (d.enemy.curIzd <= 0) _finishWin(d);
  else if (d.player.izd <= 0) _finishLoss(d);
}

function _runRound() {
  const d = _data();
  if (!d || !_ready(d) || _over(d)) return;
  _stepRound(d);
  saveState();
  _renderAll();
}

function _runToEnd() {
  const d = _data();
  if (!d || !_ready(d) || _over(d)) return;
  let guard = 0;
  while (!_over(d) && guard < 1000) { _stepRound(d); guard++; }
  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.curIzd = d.enemy.izd;
  if (d.log.length) _appendLog(d, t('battlesim481.log.reset_sep'));
  _appendLog(d, t('battlesim481.log.reset'));
  saveState();
  _renderAll();
}

// ── Render ───────────────────────────────────────────────────────────────

function _setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

function _renderStatus() {
  const d = _data();
  const el = document.getElementById('sim481-status');
  if (!d || !el) return;
  if (!d.enemy.hasStats) el.innerHTML = t('battlesim481.status.pick');
  else if (d.player.izd <= 0) el.innerHTML = `${SVG_SKULL} ${t('battlesim481.status.defeat')}`;
  else if (d.enemy.curIzd <= 0) el.innerHTML = `${SVG_TROPHY} ${t('battlesim481.status.victory')}`;
  else el.innerHTML = t('battlesim481.status.fighting', { enemy: _enemyNameSafe(d), eizd: d.enemy.curIzd });
  const strikeBtn = document.getElementById('sim481-strike');
  if (strikeBtn) strikeBtn.disabled = !_ready(d) || _over(d);
  const endBtn = document.getElementById('sim481-to-end');
  if (endBtn) endBtn.disabled = !_ready(d) || _over(d);
}

function _renderInputs() {
  const d = _data();
  if (!d) return;
  _setVal('sim481-player-sila', d.player.sila);
  _setVal('sim481-player-izd', d.player.izd);
  _setVal('sim481-e-sila', d.enemy.sila);
  _setVal('sim481-e-izd', d.enemy.curIzd);
  const pick = document.getElementById('sim481-enemy-pick');
  if (pick && document.activeElement !== pick) pick.value = d.enemy.name;
  _renderStatus();
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim481-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d = _data();
  const sumEl = document.getElementById('sim481-history-summary');
  const listEl = document.getElementById('sim481-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim481.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim481.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim481.history.won') : t('battlesim481.history.lost');
    const date = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() { _renderInputs(); _renderLog(); _renderHistory(); }

export function renderSim481() {
  const overlay = document.getElementById('sim481-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim481(); return; }
  _renderAll();
}

function openSim481() {
  if (!_data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  _renderAll();
  document.getElementById('sim481-overlay').classList.add('active');
}

function closeSim481() {
  document.getElementById('sim481-overlay')?.classList.remove('active');
}

export function setSim481Visible(visible) {
  const btn = document.getElementById('sim481-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim481();
}

// ── Enemy autocomplete (book_enemies) ──────────────────────────────────────

let _enemyList = null;
async function _loadEnemyList() {
  if (_enemyList) return _enemyList;
  try {
    const res = await apiFetch(`/api/books/${currentBookId}/enemies`);
    _enemyList = res.ok ? await res.json() : [];
  } catch (_) { _enemyList = []; }
  return _enemyList;
}

function _applyEnemy(d, enemy) {
  d.enemy.name = enemy.name;
  d.enemy.sila = enemy.attack || 0;
  d.enemy.izd = enemy.hp || 0;
  d.enemy.curIzd = d.enemy.izd;
  d.enemy.hasStats = enemy.attack != null && enemy.hp != null;
  d.player.izd = d.player.izd > 0 ? d.player.izd : 20;
}

function _setupEnemyAutocomplete() {
  const input = document.getElementById('sim481-enemy-pick');
  const dropdown = document.getElementById('sim481-enemy-pick-dropdown');
  let matches = [];
  let activeIdx = -1;

  function closeDropdown() {
    dropdown.classList.remove('open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function renderList(q) {
    const list = _enemyList || [];
    const ql = q.trim().toLowerCase();
    matches = ql ? list.filter(e => e.name.toLowerCase().includes(ql)) : list;
    if (!matches.length) { closeDropdown(); return; }
    dropdown.innerHTML = matches.map((e, i) => {
      const sila = e.attack == null ? '?' : e.attack;
      const izd = e.hp == null ? '?' : e.hp;
      return `<li role="option" id="sim481-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim481.ui.sila')}:${sila} ${t('battlesim481.ui.izd')}:${izd}</span></li>`;
    }).join('');
    activeIdx = -1;
    dropdown.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
  }
  function select(enemy) {
    const d = _data();
    if (!d || !enemy) return;
    input.value = enemy.name;
    _applyEnemy(d, enemy);
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
  input.addEventListener('focus', async () => { input.removeAttribute('readonly'); await _loadEnemyList(); renderList(input.value); });
  input.addEventListener('input', async () => { await _loadEnemyList(); renderList(input.value); });
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

// ── Init ─────────────────────────────────────────────────────────────────

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

export function initSim481() {
  const overlay = document.createElement('div');
  overlay.id = 'sim481-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim481.ui.title')}</span>
        <button id="sim481-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim481.ui.you')}</div>
            ${_numField(t('battlesim481.ui.sila'), 'sim481-player-sila')}
            ${_numField(t('battlesim481.ui.izd'), 'sim481-player-izd')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim481.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim481.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim481-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim481-enemy-pick-dropdown">
                <ul id="sim481-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim481.ui.sila'), 'sim481-e-sila')}
            ${_numField(t('battlesim481.ui.izd'), 'sim481-e-izd')}
          </div>
          <div id="sim481-status" class="bsim-status"></div>
          <div class="inv-modal-ftr bsim-action-grid">
            <button id="sim481-strike" class="inv-add-btn bsim-action-primary">${t('battlesim481.btn.strike')}</button>
            <button id="sim481-to-end" class="inv-add-btn">${t('battlesim481.btn.to_end')}</button>
            <button id="sim481-reset" class="inv-add-btn">${t('battlesim481.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim481-history-summary">${t('battlesim481.history.summary', { n: 0 })}</summary>
            <div id="sim481-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim481-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id = 'sim481-btn';
  btn.innerHTML = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim481);
  document.getElementById('sim481-close').addEventListener('click', closeSim481);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim481(); });
  registerPanelShortcut('KeyS', {
    getButton: () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim481-overlay'),
    open: openSim481,
    close: closeSim481,
  });

  document.getElementById('sim481-strike').addEventListener('click', _runRound);
  document.getElementById('sim481-to-end').addEventListener('click', _runToEnd);
  document.getElementById('sim481-reset').addEventListener('click', _resetBattle);

  const FIELD_MAP = {
    'sim481-player-sila': ['player', 'sila'],
    'sim481-player-izd': ['player', 'izd'],
    'sim481-e-sila': ['enemy', 'sila'],
    'sim481-e-izd': ['enemy', 'curIzd'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = Math.max(0, val);
    if (map[0] === 'enemy') d.enemy.hasStats = true;
    d[map[0]][map[1]] = val;
    saveState();
    _renderInputs();
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
      const next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete();
}
