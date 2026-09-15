// ── Battle Simulator (Сага за Ринглас, book 871) ────────────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 871 only) by the caller in boot.js via
// setSim871Visible().
// To remove: delete this file, remove its import line and initSim871()/
// setSim871Visible() calls from boot.js, remove 'sim871' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim871-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim871-btn selectors in
// battlesim.css.
//
// One uniform resolver for every fight in the book (documented on the
// book's own "ПРАВИЛА ЗА БИТКИ" page, see book_frontmatter.rules_text):
//   Ринглас's own "mishena" (target) is always 6; each opponent has its
//   own target + ИЗДРЪЖЛИВОСТ (stamina) pool, given per-encounter.
//   Round: roll 2d6 for Ринглас - if the sum beats the opponent's target,
//   the opponent loses 1 stamina. Then roll 2d6 for the opponent - if the
//   sum is LESS than Ринглас's target (6), Ринглас loses 1 stamina.
//   Repeat until one side hits 0.
//   Multi-enemy fights add +5 stamina to Ринглас for that encounter (and
//   per the book's own wording this bonus stays in the running total
//   afterward, it's not reverted), and a horse-attack roll is added each
//   round: if the 2d6 roll is under the (shared) enemy target, Златогрив
//   finishes off one attacker for 2 stamina.
// A few individual fights grant a one-off roll modifier from a specific
// item (e.g. the torch gives Ринглас +2 on his roll against wolves, the
// strangling scarves give the wolves -3 on theirs) - modeled as optional
// per-fight bonus/penalty fields rather than hardcoding item-tracking,
// since the reader already knows from the story whether they have the
// item for that specific encounter.
//
// Full enemy roster (verified via a complete read of all 300 sections
// this session):
//   Бандит (Батуърк)          target 8  stamina 10
//   Каменни чудовища          target 9  stamina 12
//   Рандовански рицар         target 9  stamina 6
//   Водни духове              target 4  stamina 10
//   Снежни воини              target 7  stamina 10
//   Симаут, богът на бурите   target 10 stamina 5  (Ринглас +5 stamina for this fight)
//   Блатни/глинени чудовища   target 5  stamina 10
//   Рицари в брони            target 6  stamina 12 (multi-enemy)
//   Дракон                    target 10 stamina 6
//   Леден демон               target 8  stamina 6
//   Вълци                     target 6  stamina 12 (multi-enemy; torch/scarves modifiers apply)
//   Ледени лъвове             target 9  stamina 12 (multi-enemy)
//   Вездесъщият паяк          target 7  stamina 10
//
// All state lives in pt.sim871, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const ROSTER = [
  { id: 'bandit',   nameKey: 'battlesim871.name.bandit',   target: 8,  stamina: 10, multi: false },
  { id: 'stone',    nameKey: 'battlesim871.name.stone',    target: 9,  stamina: 12, multi: true },
  { id: 'knight',   nameKey: 'battlesim871.name.knight',   target: 9,  stamina: 6,  multi: false },
  { id: 'waterspirit', nameKey: 'battlesim871.name.waterspirit', target: 4, stamina: 10, multi: true },
  { id: 'snowwarrior', nameKey: 'battlesim871.name.snowwarrior', target: 7, stamina: 10, multi: true },
  { id: 'simaut',   nameKey: 'battlesim871.name.simaut',   target: 10, stamina: 5,  multi: false, playerBonus: 5 },
  { id: 'mudmonster', nameKey: 'battlesim871.name.mudmonster', target: 5, stamina: 10, multi: true },
  { id: 'armoredknight', nameKey: 'battlesim871.name.armoredknight', target: 6, stamina: 12, multi: true },
  { id: 'dragon',   nameKey: 'battlesim871.name.dragon',   target: 10, stamina: 6,  multi: false },
  { id: 'icedemon', nameKey: 'battlesim871.name.icedemon', target: 8,  stamina: 6,  multi: false },
  { id: 'wolf',     nameKey: 'battlesim871.name.wolf',     target: 6,  stamina: 12, multi: true },
  { id: 'icelion',  nameKey: 'battlesim871.name.icelion',  target: 9,  stamina: 12, multi: true },
  { id: 'spider',   nameKey: 'battlesim871.name.spider',   target: 7,  stamina: 10, multi: false },
];

function _rival(id) { return ROSTER.find(r => r.id === id) || ROSTER[0]; }
function _rivalNameById(id) { return t(_rival(id).nameKey); }

function _d6() { return 1 + Math.floor(Math.random() * 6); }
function _d2() { return _d6() + _d6(); }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim871) {
    pt.sim871 = {
      enemyId: 'bandit', playerTarget: 6, playerStamina: 25, enemyTarget: 8, enemyStamina: 10,
      multi: false, playerBonus: 0, enemyPenalty: 0, over: false, winner: null, started: false, log: [], history: [],
    };
  }
  const d = pt.sim871;
  if (!d.enemyId) d.enemyId = 'bandit';
  if (typeof d.playerTarget !== 'number') d.playerTarget = 6;
  if (typeof d.playerStamina !== 'number') d.playerStamina = 25;
  if (typeof d.enemyTarget !== 'number') d.enemyTarget = _rival(d.enemyId).target;
  if (typeof d.enemyStamina !== 'number') d.enemyStamina = _rival(d.enemyId).stamina;
  if (typeof d.multi !== 'boolean') d.multi = !!_rival(d.enemyId).multi;
  if (typeof d.playerBonus !== 'number') d.playerBonus = 0;
  if (typeof d.enemyPenalty !== 'number') d.enemyPenalty = 0;
  if (d.over === undefined) d.over = false;
  if (d.started === undefined) d.started = false;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) { d.log.push(line); if (d.log.length > 300) d.log.shift(); }
function _enemyName(d) { return _rivalNameById(d.enemyId); }
function _playerDead(d) { return d.playerStamina <= 0; }
function _enemyDead(d) { return d.enemyStamina <= 0; }
function _battleOver(d) { return _playerDead(d) || _enemyDead(d); }

function _recordOutcome(d, outcome) { d.history.push({ enemyId: d.enemyId, outcome, ts: Date.now() }); }

function _checkEnd(d) {
  if (_enemyDead(d)) {
    d.over = true; d.winner = 'player';
    _appendLog(d, t('battlesim871.log.defeated', { trophy: SVG_TROPHY, name: _enemyName(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  if (_playerDead(d)) {
    d.over = true; d.winner = 'enemy';
    _appendLog(d, t('battlesim871.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _round() {
  const d = _data();
  if (!d || d.over) return;
  d.started = true;
  let msg = '';

  const playerRoll = _d2() + d.playerBonus;
  if (playerRoll > d.enemyTarget) {
    d.enemyStamina = Math.max(0, d.enemyStamina - 1);
    msg += t('battlesim871.log.player_hit', { roll: playerRoll, target: d.enemyTarget, stamina: d.enemyStamina });
  } else {
    msg += t('battlesim871.log.player_miss', { roll: playerRoll, target: d.enemyTarget });
  }

  if (d.multi && !_enemyDead(d)) {
    const horseRoll = _d2();
    if (horseRoll < d.enemyTarget) {
      d.enemyStamina = Math.max(0, d.enemyStamina - 2);
      msg += ' ' + t('battlesim871.log.horse_hit', { roll: horseRoll, stamina: d.enemyStamina });
    }
  }

  if (!_enemyDead(d)) {
    const enemyRoll = _d2() - d.enemyPenalty;
    if (enemyRoll < d.playerTarget) {
      d.playerStamina = Math.max(0, d.playerStamina - 1);
      msg += ' ' + t('battlesim871.log.enemy_hit', { roll: enemyRoll, target: d.playerTarget, stamina: d.playerStamina });
    } else {
      msg += ' ' + t('battlesim871.log.enemy_miss', { roll: enemyRoll, target: d.playerTarget });
    }
  }

  _appendLog(d, msg);
  _checkEnd(d);
  saveState();
  _renderAll();
}

function _startBattle() {
  const d = _data();
  if (!d) return;
  const r = _rival(d.enemyId);
  d.enemyTarget = r.target;
  d.enemyStamina = r.stamina;
  d.multi = !!r.multi;
  if (r.playerBonus) d.playerStamina += r.playerBonus;
  d.over = false;
  d.winner = null;
  d.started = true;
  if (d.log.length) _appendLog(d, t('battlesim871.log.reset_sep'));
  _appendLog(d, t('battlesim871.log.start', { name: _enemyName(d) }));
  if (r.playerBonus) _appendLog(d, t('battlesim871.log.player_bonus', { n: r.playerBonus }));
  saveState();
  _renderAll();
}

function _pickEnemy(id) {
  const d = _data();
  if (!d) return;
  d.enemyId = id;
  const r = _rival(id);
  d.enemyTarget = r.target;
  d.enemyStamina = r.stamina;
  d.multi = !!r.multi;
  saveState();
  _renderAll();
}

// ── Render ───────────────────────────────────────────────────────────────

function _renderStatus() {
  const d = _data();
  const el = document.getElementById('sim871-status');
  if (!d || !el) return;
  if (d.over) {
    if (d.winner === 'player') el.innerHTML = t('battlesim871.status.victory', { trophy: SVG_TROPHY });
    else el.innerHTML = t('battlesim871.status.fallen', { skull: SVG_SKULL });
  } else {
    el.innerHTML = '';
  }
  document.getElementById('sim871-round').disabled = d.over || !d.started;
}

function _enemyOptionsHtml(selectedId) {
  return ROSTER.map(r => `<option value="${r.id}" ${r.id === selectedId ? 'selected' : ''}>${escapeHtml(t(r.nameKey))}</option>`).join('');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;
  document.getElementById('sim871-enemy-pick').innerHTML = _enemyOptionsHtml(d.enemyId);
  document.getElementById('sim871-player-stamina').value = d.playerStamina;
  document.getElementById('sim871-player-target').value = d.playerTarget;
  document.getElementById('sim871-player-bonus').value = d.playerBonus;
  document.getElementById('sim871-enemy-target').value = d.enemyTarget;
  document.getElementById('sim871-enemy-stamina').value = d.enemyStamina;
  document.getElementById('sim871-enemy-penalty').value = d.enemyPenalty;
  document.getElementById('sim871-multi-cb').checked = !!d.multi;
  _renderStatus();
}

function _renderHistory() {
  const d = _data();
  const sumEl = document.getElementById('sim871-history-summary');
  const listEl = document.getElementById('sim871-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim871.history.summary', { n: d.history.length });
  if (!d.history.length) { listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim871.history.empty')}</div>`; return; }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim871.history.won') : t('battlesim871.history.lost');
    const date = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const enemyName = _rivalNameById(h.enemyId);
    return `<div class="bsim-history-row"><span>${icon} ${t('battlesim871.history.you')} ${t('battlesim871.history.vs')} ${escapeHtml(enemyName)} - ${result}</span><span class="bsim-history-meta">${date}</span></div>`;
  }).join('');
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim871-log');
  if (!el || !d) return;
  el.innerHTML = d.log.filter(Boolean).slice().reverse().join('<br>');
}

function _renderAll() { _renderInputs(); _renderLog(); _renderHistory(); }

export function renderSim871() {
  const overlay = document.getElementById('sim871-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim871(); return; }
  _renderAll();
}

function openSim871() {
  if (!_data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  _renderAll();
  document.getElementById('sim871-overlay').classList.add('active');
}

function closeSim871() { document.getElementById('sim871-overlay')?.classList.remove('active'); }

export function setSim871Visible(visible) {
  const btn = document.getElementById('sim871-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim871();
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

export function initSim871() {
  const overlay = document.createElement('div');
  overlay.id = 'sim871-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim871.ui.title')}</span>
        <button id="sim871-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim871.ui.you')}</div>
            ${_numField(t('battlesim871.ui.stamina'), 'sim871-player-stamina')}
            ${_numField(t('battlesim871.ui.target'), 'sim871-player-target')}
            ${_numField(t('battlesim871.ui.bonus'), 'sim871-player-bonus')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim871.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim871.ui.pick')}</span>
              <select id="sim871-enemy-pick" class="inv-edit-input"></select>
            </div>
            ${_numField(t('battlesim871.ui.target'), 'sim871-enemy-target')}
            ${_numField(t('battlesim871.ui.stamina'), 'sim871-enemy-stamina')}
            ${_numField(t('battlesim871.ui.penalty'), 'sim871-enemy-penalty')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim871.ui.multi')}</span>
              <input id="sim871-multi-cb" type="checkbox">
            </div>
          </div>
          <div id="sim871-status" class="bsim-status"></div>
          <div class="inv-modal-ftr bsim-action-grid">
            <button id="sim871-round" class="inv-add-btn bsim-action-primary">${t('battlesim871.btn.round')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim871-start" class="inv-add-btn">${t('battlesim871.btn.start')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim871-history-summary">${t('battlesim871.history.summary', { n: 0 })}</summary>
            <div id="sim871-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim871-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id = 'sim871-btn';
  btn.innerHTML = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim871);
  document.getElementById('sim871-close').addEventListener('click', closeSim871);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim871(); });
  registerPanelShortcut('KeyS', {
    getButton: () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim871-overlay'),
    open: openSim871,
    close: closeSim871,
  });

  document.getElementById('sim871-enemy-pick').addEventListener('change', e => _pickEnemy(e.target.value));
  document.getElementById('sim871-start').addEventListener('click', _startBattle);
  document.getElementById('sim871-round').addEventListener('click', _round);
  document.getElementById('sim871-multi-cb').addEventListener('change', e => { const d = _data(); if (d) { d.multi = !!e.target.checked; saveState(); } });

  const fieldMap = {
    'sim871-player-stamina': (d, v) => { d.playerStamina = v; },
    'sim871-player-target': (d, v) => { d.playerTarget = v; },
    'sim871-player-bonus': (d, v) => { d.playerBonus = v; },
    'sim871-enemy-target': (d, v) => { d.enemyTarget = v; },
    'sim871-enemy-stamina': (d, v) => { d.enemyStamina = v; },
    'sim871-enemy-penalty': (d, v) => { d.enemyPenalty = v; },
  };

  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d) return;
      const id = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const val = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
      input.value = val;
      if (fieldMap[id]) fieldMap[id](d, val);
      saveState();
      _renderStatus();
    });
  });

  overlay.querySelectorAll('.inv-qty-input').forEach(input => {
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = Math.max(0, parseInt(input.value, 10) || 0);
      input.value = val;
      if (fieldMap[input.id]) fieldMap[input.id](d, val);
      saveState();
      _renderStatus();
    });
  });
}
