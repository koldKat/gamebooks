// Battle Simulator (Галактическият гигант, book 877)
// Use each encounter's own comparison/roll rules; there is no uniform combat engine.
// Enter current Strength/Life/Esper; life below 3 ends play.

import { currentPlaythrough, saveState } from '../core/state.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { resolveGalacticDuel } from './engines/galactic-giant.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }
function _roll2d6() { return _roll1d6() + _roll1d6(); }
function _roll3d6() { return _roll1d6() + _roll1d6() + _roll1d6(); }

// Each resolver receives the player's current {sila, zhivot, esper} and
// returns { logKey, logParams, cost: {zhivot}, outcome: 'win'|'loss'|'draw', section }.

const ROSTER = [
  {
    id: 'robotrak', nameKey: 'battlesim877.name.robotrak',
    resolve(p) {
      if (p.sila > 10) return { key: 'robotrak_win', section: 203, outcome: 'win', cost: {} };
      return { key: 'robotrak_lose', section: 66, outcome: 'draw', cost: { zhivot: 2 } };
    },
  },
  {
    id: 'goraoktopod', nameKey: 'battlesim877.name.goraoktopod',
    resolve(p, d) {
      return resolveGalacticDuel('goraoktopod', p, d.pendingDuel?.state, false, _roll1d6);
    },
  },
  {
    id: 'medusa', nameKey: 'battlesim877.name.medusa',
    resolve(p) {
      const strOk = p.sila >= 8, lifeOk = p.zhivot >= 18;
      if (strOk && lifeOk) return { key: 'medusa_win', section: 43, outcome: 'win', cost: {} };
      if (!strOk && !lifeOk) return { key: 'medusa_costly', section: 56, outcome: 'win', cost: {} };
      if ((p.sila === 8 && !lifeOk) || (p.zhivot === 18 && !strOk)) {
        return { key: 'manual', outcome: 'manual', cost: {} };
      }
      return { key: 'medusa_stalemate', section: 197, outcome: 'draw', cost: {} };
    },
  },
  {
    id: 'web1', nameKey: 'battlesim877.name.web1',
    resolve(p) {
      const enemySum = 15 + 20;
      const diff = enemySum - (p.sila + p.zhivot);
      if (diff < 0) return { key: 'web_knife', section: 74, outcome: 'win', cost: {} };
      if (diff <= 6) return { key: 'web_blaster', section: 74, outcome: 'win', cost: { zhivot: 3 } };
      return { key: 'web_gravitoudar', section: 74, outcome: 'win', cost: { zhivot: 5 } };
    },
  },
  {
    id: 'web2', nameKey: 'battlesim877.name.web2',
    resolve(p) {
      const enemySum = 10 + 20;
      const diff = enemySum - (p.sila + p.zhivot);
      if (diff < 0) return { key: 'web2_one', section: 161, outcome: 'win', cost: {} };
      if (diff <= 6) return { key: 'web2_two', section: 161, outcome: 'win', cost: {} };
      return { key: 'web2_choice', section: 161, outcome: 'win', cost: {} };
    },
  },
  {
    id: 'invisiblerobot', nameKey: 'battlesim877.name.invisiblerobot',
    resolve(p, d) {
      return resolveGalacticDuel('invisiblerobot', p, d.pendingDuel?.state,
        document.getElementById('sim877-flee').checked, _roll1d6);
    },
  },
  {
    id: 'snakewall1', nameKey: 'battlesim877.name.snakewall1',
    resolve(p) {
      const sum = p.esper + p.zhivot;
      if (sum > 25) return { key: 'snakewall_win', section: 34, outcome: 'win', cost: {} };
      return { key: 'snakewall_lose', section: 214, outcome: 'loss', cost: {} };
    },
  },
  {
    id: 'snakewall2', nameKey: 'battlesim877.name.snakewall2',
    resolve(p) {
      if (p.esper > 12) return { key: 'snakewall2_win', section: 34, outcome: 'win', cost: { zhivot: 5 } };
      return { key: 'snakewall_lose', section: 214, outcome: 'loss', cost: {} };
    },
  },
  {
    id: 'twoheaded', nameKey: 'battlesim877.name.twoheaded',
    resolve(p) {
      const d1 = _roll1d6(), d2 = _roll1d6();
      const enemySum = (4 + d1) + (6 + d2);
      const playerSum = p.sila + p.zhivot;
      if (enemySum > playerSum) return { key: 'twoheaded_lose', section: 106, outcome: 'loss', cost: {} };
      if (enemySum === playerSum) return { key: 'twoheaded_exhausted', section: 137, outcome: 'win', cost: {} };
      if (playerSum - enemySum > 10) return { key: 'manual', outcome: 'manual', cost: {} };
      return { key: 'twoheaded_win', section: 67, outcome: 'win', cost: {} };
    },
  },
  {
    id: 'bigtwoheaded', nameKey: 'battlesim877.name.bigtwoheaded',
    resolve(p) {
      const enemySum = 8 + 12;
      if (enemySum >= p.sila + p.zhivot) return { key: 'bigtwoheaded_lose', section: 106, outcome: 'loss', cost: {} };
      return { key: 'bigtwoheaded_win', section: 64, outcome: 'win', cost: {} };
    },
  },
  {
    id: 'robottank', nameKey: 'battlesim877.name.robottank',
    resolve(p) {
      const roll = _roll2d6();
      const total = p.sila + roll;
      if (total > 20) return { key: 'robottank_win', section: 133, outcome: 'win', cost: {}, roll };
      return { key: 'robottank_continue', section: 119, outcome: 'draw', cost: {}, roll };
    },
  },
  {
    id: 'robotspider', nameKey: 'battlesim877.name.robotspider',
    resolve(p) {
      const sum = p.sila + p.zhivot;
      if (sum > 30) return { key: 'robotspider_win', section: 72, outcome: 'win', cost: {} };
      if (sum === 30) return { key: 'robotspider_tie', section: 68, outcome: 'draw', cost: {} };
      return { key: 'robotspider_lose', section: 92, outcome: 'loss', cost: {} };
    },
  },
];

function _encounter(id) { return ROSTER.find(e => e.id === id) || ROSTER[0]; }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim877) {
    pt.sim877 = {
      encounterId: 'robotrak',
      player: { sila: 8, zhivot: 15, esper: 10 },
      log: [],
      history: [],
    };
  }
  const d = pt.sim877;
  if (!d.encounterId) d.encounterId = 'robotrak';
  if (!d.player) d.player = { sila: 8, zhivot: 15, esper: 10 };
  if (typeof d.player.sila !== 'number') d.player.sila = 8;
  if (typeof d.player.zhivot !== 'number') d.player.zhivot = 15;
  if (typeof d.player.esper !== 'number') d.player.esper = 10;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: t(_encounter(d.encounterId).nameKey), outcome, ts: Date.now() });
}

function _fight() {
  const d = _data();
  if (!d) return;
  const enc = _encounter(d.encounterId);
  if (d.player.zhivot < 3) { showAlert(t('battlesim877.log.dead')); return; }
  const before = { ...d.player };
  const res = enc.resolve(d.player, d);
  if (res.cost && res.cost.zhivot) d.player.zhivot = Math.max(0, d.player.zhivot - res.cost.zhivot);
  if (res.cost && res.cost.sila) d.player.sila = Math.max(0, d.player.sila - res.cost.sila);
  if (d.player.zhivot < 3) res.outcome = 'loss';
  if (res.pending) d.pendingDuel = { encounterId: d.encounterId, state: res.pending };
  else delete d.pendingDuel;

  _appendLog(d, t('battlesim877.log.header', { name: t(enc.nameKey) }));
  _appendLog(d, t(`battlesim877.log.${res.key}`, {
    sila: before.sila, zhivot: before.zhivot, esper: before.esper,
    lifeLost: (res.cost && res.cost.zhivot) || 0,
    rounds: res.rounds || 0,
    roll: res.roll || 0,
    section: res.section,
  }));
  if (res.outcome === 'pending' || res.outcome === 'manual') {
    saveState();
    _renderAll();
    return;
  }
  if (d.player.zhivot < 3) _appendLog(d, t('battlesim877.log.dead'));
  else if (res.outcome === 'win') _appendLog(d, t('battlesim877.log.win_footer', { trophy: SVG_TROPHY, section: res.section }));
  else if (res.outcome === 'loss') _appendLog(d, t('battlesim877.log.loss_footer', { skull: SVG_SKULL, section: res.section }));
  else _appendLog(d, t('battlesim877.log.draw_footer', { section: res.section }));

  _recordOutcome(d, res.outcome);
  saveState();
  _renderAll();
}

function _rollSila() {
  const d = _data();
  if (!d) return;
  if (d.pendingDuel) return;
  d.player.sila = _roll2d6() + 6;
  _appendLog(d, t('battlesim877.log.rolled_sila', { value: d.player.sila }));
  saveState();
  _renderAll();
}

function _rollZhivot() {
  const d = _data();
  if (!d) return;
  if (d.pendingDuel) return;
  d.player.zhivot = _roll1d6() + 12;
  _appendLog(d, t('battlesim877.log.rolled_zhivot', { value: d.player.zhivot }));
  saveState();
  _renderAll();
}

function _rollEsper() {
  const d = _data();
  if (!d) return;
  if (d.pendingDuel) return;
  d.player.esper = _roll3d6();
  _appendLog(d, t('battlesim877.log.rolled_esper', { value: d.player.esper }));
  saveState();
  _renderAll();
}

function _pickEncounter(id) {
  const d = _data();
  if (!d) return;
  if (d.pendingDuel) return;
  d.encounterId = id;
  saveState();
  _renderAll();
}

// ── Render ───────────────────────────────────────────────────────────────

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim877-history-summary');
  const listEl = document.getElementById('sim877-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim877.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim877.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : (h.outcome === 'loss' ? SVG_SKULL : '');
    const result = h.outcome === 'win' ? t('battlesim877.history.won') : (h.outcome === 'loss' ? t('battlesim877.history.lost') : t('battlesim877.history.draw'));
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim877-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _encounterOptions(selectedId) {
  return ROSTER.map(e => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(t(e.nameKey))}</option>`).join('');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;
  document.getElementById('sim877-encounter-pick').innerHTML = _encounterOptions(d.encounterId);
  document.getElementById('sim877-player-sila').value   = d.player.sila;
  document.getElementById('sim877-player-zhivot').value = d.player.zhivot;
  document.getElementById('sim877-player-esper').value  = d.player.esper;
  document.getElementById('sim877-encounter-pick').disabled = !!d.pendingDuel;
  document.querySelectorAll('#sim877-overlay .inv-qty-input, #sim877-overlay .inv-qty-btn, #sim877-overlay .bsim-roll-btn')
    .forEach(element => { element.disabled = !!d.pendingDuel; });
  document.getElementById('sim877-flee-row').hidden = d.encounterId !== 'invisiblerobot';
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim877() {
  const overlay = document.getElementById('sim877-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim877(); return; }
  _renderAll();
}

function openSim877() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim877-overlay').classList.add('active');
}

function closeSim877() {
  document.getElementById('sim877-overlay')?.classList.remove('active');
}

export function setSim877Visible(visible) {
  const btn = document.getElementById('sim877-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim877();
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
        ${rollId ? `<button id="${rollId}" class="inv-add-btn bsim-roll-btn">${t('battlesim877.btn.roll')}</button>` : ''}
      </div>
    </div>`;
}

export function initSim877() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim877-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim877.ui.title')}</span>
        <button id="sim877-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim877.ui.you')}</div>
            ${_numField(t('battlesim877.ui.sila'), 'sim877-player-sila', 'sim877-roll-sila')}
            ${_numField(t('battlesim877.ui.zhivot'), 'sim877-player-zhivot', 'sim877-roll-zhivot')}
            ${_numField(t('battlesim877.ui.esper'), 'sim877-player-esper', 'sim877-roll-esper')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim877.ui.encounter')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim877.ui.pick')}</span>
              <select id="sim877-encounter-pick" class="inv-edit-input"></select>
            </div>
            <label id="sim877-flee-row" hidden><input id="sim877-flee" type="checkbox"> ${t('battlesim877.ui.flee')}</label>
          </div>
          <div class="inv-modal-ftr bsim-action-grid">
            <button id="sim877-fight" class="inv-add-btn bsim-action-primary">${t('battlesim877.btn.fight')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim877-history-summary">${t('battlesim877.history.summary', { n: 0 })}</summary>
            <div id="sim877-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim877-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim877-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim877);
  document.getElementById('sim877-close').addEventListener('click', closeSim877);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim877(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim877-overlay'),
    open:  openSim877,
    close: closeSim877,
  });

  document.getElementById('sim877-encounter-pick').addEventListener('change', e => _pickEncounter(e.target.value));
  document.getElementById('sim877-fight').addEventListener('click', _fight);
  document.getElementById('sim877-roll-sila').addEventListener('click', _rollSila);
  document.getElementById('sim877-roll-zhivot').addEventListener('click', _rollZhivot);
  document.getElementById('sim877-roll-esper').addEventListener('click', _rollEsper);

  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d) return;
      const id    = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const val   = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
      input.value = val;
      if (id === 'sim877-player-sila')   d.player.sila = val;
      else if (id === 'sim877-player-zhivot') d.player.zhivot = val;
      else if (id === 'sim877-player-esper')  d.player.esper = val;
      saveState();
    });
  });

  overlay.querySelectorAll('.inv-qty-input').forEach(input => {
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = Math.max(0, parseInt(input.value, 10) || 0);
      input.value = val;
      const id = input.id;
      if (id === 'sim877-player-sila')   d.player.sila = val;
      else if (id === 'sim877-player-zhivot') d.player.zhivot = val;
      else if (id === 'sim877-player-esper')  d.player.esper = val;
      saveState();
    });
  });
}
