// Battle Simulator (Принцът на Алкирия, book 412)
// Шанс-table + life-tier engine; player Strength follows current Life Points.

import { currentPlaythrough, saveState } from '../core/state.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { drawChance, lifeTier, resolveStrike } from './engines/alkiria.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Roster fed from book_enemies; §454 (Черна сянка) has no printed ж.т., defaulted and editable.
const ROSTER = [
  { id: 'e1',  nameKey: 'battlesim412.name.e1',  str: 14, hp: 12 },
  { id: 'e2',  nameKey: 'battlesim412.name.e2',  str: 15, hp: 14 },
  { id: 'e3',  nameKey: 'battlesim412.name.e3',  str: 17, hp: 6 },
  { id: 'e4',  nameKey: 'battlesim412.name.e4',  str: 13, hp: 8 },
  { id: 'e5',  nameKey: 'battlesim412.name.e5',  str: 9,  hp: 5 },
  { id: 'e6',  nameKey: 'battlesim412.name.e6',  str: 10, hp: 6 },
  { id: 'e7',  nameKey: 'battlesim412.name.e7',  str: 14, hp: 6 },
  { id: 'e8',  nameKey: 'battlesim412.name.e8',  str: 13, hp: 10 },
  { id: 'e9',  nameKey: 'battlesim412.name.e9',  str: 14, hp: 1 },
  { id: 'e10', nameKey: 'battlesim412.name.e10', str: 15, hp: 1 },
  { id: 'e11', nameKey: 'battlesim412.name.e11', str: 12, hp: 1 },
  { id: 'e12', nameKey: 'battlesim412.name.e12', str: 11, hp: 6 },
  { id: 'e13', nameKey: 'battlesim412.name.e13', str: 17, hp: 5 },
  { id: 'e14', nameKey: 'battlesim412.name.e14', str: 14, hp: 6 },
  { id: 'e15', nameKey: 'battlesim412.name.e15', str: 15, hp: 8 },
  { id: 'e16', nameKey: 'battlesim412.name.e16', str: 15, hp: 8 },
  { id: 'e17', nameKey: 'battlesim412.name.e17', str: 16, hp: 3 },
  { id: 'e18', nameKey: 'battlesim412.name.e18', str: 14, hp: 9 },
  { id: 'e19', nameKey: 'battlesim412.name.e19', str: 13, hp: 4 },
  { id: 'e20', nameKey: 'battlesim412.name.e20', str: 13, hp: 1 },
  { id: 'e21', nameKey: 'battlesim412.name.e21', str: 11, hp: 1 },
  { id: 'e22', nameKey: 'battlesim412.name.e22', str: 14, hp: 1 },
  { id: 'e23', nameKey: 'battlesim412.name.e23', str: 17, hp: 10 },
];

function _enemy(id) { return ROSTER.find(e => e.id === id) || ROSTER[0]; }
function _enemyName(d) { return t(_enemy(d.enemyId).nameKey); }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim412) {
    pt.sim412 = {
      enemyId: 'e1',
      player: { lp: 58, startLp: 58 },
      enemy: { str: 14, hp: 12, startHp: 12 },
      over: false, winner: null, started: false,
      log: [], history: [],
    };
  }
  const d = pt.sim412;
  if (!d.enemyId) d.enemyId = 'e1';
  if (!d.player) d.player = { lp: 58, startLp: 58 };
  if (typeof d.player.lp !== 'number') d.player.lp = 58;
  if (typeof d.player.startLp !== 'number') d.player.startLp = d.player.lp;
  if (!d.enemy) d.enemy = { ..._enemy(d.enemyId), startHp: _enemy(d.enemyId).hp };
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  if (d.over === undefined) d.over = false;
  if (d.started === undefined) d.started = false;
  return d;
}

function _appendLog(d, line) { d.log.push(line); if (d.log.length > 300) d.log.shift(); }
function _recordOutcome(d, outcome) { d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() }); }

function _checkEnd(d) {
  if (d.enemy.hp <= 0) {
    d.over = true; d.winner = 'player';
    _appendLog(d, t('battlesim412.log.defeated', { trophy: SVG_TROPHY, name: _enemyName(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  if (d.player.lp <= 0) {
    d.over = true; d.winner = 'enemy';
    _appendLog(d, t('battlesim412.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _startBattle() {
  const d = _data();
  if (!d) return;
  const base = _enemy(d.enemyId);
  d.enemy = { str: d.enemy.str || base.str, hp: d.enemy.startHp || base.hp, startHp: d.enemy.startHp || base.hp };
  d.player.lp = d.player.startLp;
  d.over = false; d.winner = null; d.started = true;
  if (d.log.length) _appendLog(d, t('battlesim412.log.reset_sep'));
  _appendLog(d, t('battlesim412.log.start', { name: _enemyName(d) }));
  saveState();
  _renderAll();
}

function _strikeOnce(d) {
  const r = resolveStrike(d.player.lp, d.enemy.str, drawChance());
  if (r.outcome === 'enemy') {
    d.enemy.hp = Math.max(0, d.enemy.hp - r.enemyLoss);
    _appendLog(d, t('battlesim412.log.strike_enemy', { chance: r.chance, pstr: r.playerStr, sum: r.sum, estr: d.enemy.str, name: _enemyName(d), hp: d.enemy.hp }));
  } else if (r.outcome === 'player') {
    d.player.lp = Math.max(0, d.player.lp - r.playerLoss);
    _appendLog(d, t('battlesim412.log.strike_player', { chance: r.chance, pstr: r.playerStr, sum: r.sum, estr: d.enemy.str, lp: d.player.lp }));
  } else {
    d.enemy.hp = Math.max(0, d.enemy.hp - r.enemyLoss);
    d.player.lp = Math.max(0, d.player.lp - r.playerLoss);
    _appendLog(d, t('battlesim412.log.strike_both', { chance: r.chance, pstr: r.playerStr, sum: r.sum, estr: d.enemy.str, lp: d.player.lp, hp: d.enemy.hp }));
  }
  return _checkEnd(d);
}

function _strike() {
  const d = _data();
  if (!d || d.over || !d.started) return;
  _strikeOnce(d);
  saveState();
  _renderAll();
}

function _autoResolve() {
  const d = _data();
  if (!d || d.over || !d.started) return;
  let guard = 0;
  while (!d.over && guard++ < 500) { if (_strikeOnce(d)) break; }
  saveState();
  _renderAll();
}

function _rollLp() {
  const d = _data();
  if (!d) return;
  const n = drawChance();
  d.player.startLp = n + 50;
  d.player.lp = d.player.startLp;
  _appendLog(d, t('battlesim412.log.rolled_lp', { chance: n, lp: d.player.startLp }));
  saveState();
  _renderAll();
}

function _pickEnemy(id) {
  const d = _data();
  if (!d) return;
  d.enemyId = id;
  const base = _enemy(id);
  d.enemy = { str: base.str, hp: base.hp, startHp: base.hp };
  d.started = false; d.over = false; d.winner = null;
  saveState();
  _renderAll();
}

// ── Render ───────────────────────────────────────────────────────────────

function _renderStatus() {
  const d = _data();
  const el = document.getElementById('sim412-status');
  if (!d || !el) return;
  if (d.over) {
    el.innerHTML = d.winner === 'player'
      ? t('battlesim412.status.victory', { trophy: SVG_TROPHY })
      : t('battlesim412.status.defeat', { skull: SVG_SKULL });
  } else {
    el.innerHTML = '';
  }
  const tier = lifeTier(d.player.lp);
  document.getElementById('sim412-player-stat').textContent =
    t('battlesim412.stat.player', { lp: Math.max(0, d.player.lp), level: tier.level, str: tier.str });
  document.getElementById('sim412-enemy-stat').textContent =
    t('battlesim412.stat.enemy', { name: _enemyName(d), str: d.enemy.str, hp: Math.max(0, d.enemy.hp) });
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim412-log');
  if (!el || !d) return;
  el.innerHTML = d.log.filter(Boolean).slice().reverse().join('<br>');
}

function _renderHistory() {
  const d = _data();
  const sumEl = document.getElementById('sim412-history-summary');
  const listEl = document.getElementById('sim412-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim412.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim412.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim412.history.won') : t('battlesim412.history.lost');
    const date = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row"><span>${icon} ${t('battlesim412.history.you')} ${t('battlesim412.history.vs')} ${escapeHtml(h.enemy)} - ${result}</span><span class="bsim-history-meta">${date}</span></div>`;
  }).join('');
}

function _enemyOptions(selectedId) {
  return ROSTER.map(e => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(t(e.nameKey))}</option>`).join('');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;
  document.getElementById('sim412-enemy-pick').innerHTML = _enemyOptions(d.enemyId);
  document.getElementById('sim412-player-lp').value = d.player.startLp;
  document.getElementById('sim412-enemy-str').value = d.enemy.str;
  document.getElementById('sim412-enemy-hp').value = d.enemy.startHp;
  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim412() {
  const overlay = document.getElementById('sim412-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim412(); return; }
  _renderAll();
}

function openSim412() {
  if (!_data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  _renderAll();
  document.getElementById('sim412-overlay').classList.add('active');
}

function closeSim412() { document.getElementById('sim412-overlay')?.classList.remove('active'); }

export function setSim412Visible(visible) {
  const btn = document.getElementById('sim412-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim412();
}

// ── Init ─────────────────────────────────────────────────────────────────

function _numField(label, id, rollId) {
  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <div class="inv-qty-wrap">
        <button class="inv-qty-btn" data-id="${id}" data-delta="-1">−</button>
        <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
        <button class="inv-qty-btn" data-id="${id}" data-delta="1">+</button>
        ${rollId ? `<button id="${rollId}" class="inv-add-btn bsim-roll-btn">${t('battlesim412.btn.rollLp')}</button>` : ''}
      </div>
    </div>`;
}

export function initSim412() {
  const overlay = document.createElement('div');
  overlay.id = 'sim412-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim412.ui.title')}</span>
        <button id="sim412-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim412.ui.you')}</div>
            ${_numField(t('battlesim412.ui.lp'), 'sim412-player-lp', 'sim412-roll-lp')}
            <div id="sim412-player-stat" class="bsim-stat-summary"></div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim412.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim412.ui.pick')}</span>
              <select id="sim412-enemy-pick" class="inv-edit-input"></select>
            </div>
            ${_numField(t('battlesim412.ui.str'), 'sim412-enemy-str')}
            ${_numField(t('battlesim412.ui.hp'), 'sim412-enemy-hp')}
            <div id="sim412-enemy-stat" class="bsim-stat-summary"></div>
          </div>
          <div id="sim412-status" class="bsim-status"></div>
          <div class="inv-modal-ftr bsim-action-grid">
            <button id="sim412-start" class="inv-add-btn">${t('battlesim412.btn.start')}</button>
            <button id="sim412-strike" class="inv-add-btn bsim-action-primary">${t('battlesim412.btn.strike')}</button>
            <button id="sim412-auto" class="inv-add-btn">${t('battlesim412.btn.auto')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim412-history-summary">${t('battlesim412.history.summary', { n: 0 })}</summary>
            <div id="sim412-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim412-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id = 'sim412-btn';
  btn.innerHTML = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim412);
  document.getElementById('sim412-close').addEventListener('click', closeSim412);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim412(); });
  registerPanelShortcut('KeyS', {
    getButton: () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim412-overlay'),
    open: openSim412,
    close: closeSim412,
  });

  document.getElementById('sim412-enemy-pick').addEventListener('change', e => _pickEnemy(e.target.value));
  document.getElementById('sim412-start').addEventListener('click', _startBattle);
  document.getElementById('sim412-strike').addEventListener('click', _strike);
  document.getElementById('sim412-auto').addEventListener('click', _autoResolve);
  document.getElementById('sim412-roll-lp').addEventListener('click', _rollLp);

  const fieldSet = (d, id, val) => {
    if (id === 'sim412-player-lp') { d.player.startLp = val; d.player.lp = val; }
    else if (id === 'sim412-enemy-str') { d.enemy.str = val; }
    else if (id === 'sim412-enemy-hp') { d.enemy.hp = val; d.enemy.startHp = val; }
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
      fieldSet(d, id, val);
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
      fieldSet(d, input.id, val);
      saveState();
      _renderStatus();
    });
  });
}
