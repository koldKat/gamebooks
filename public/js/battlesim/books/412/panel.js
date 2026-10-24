import { ROSTER } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createOpponentEditor, validateOpponents } from '../../opponents.js';

let opponents, editorState;

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, ROSTER, SVG_SKULL, SVG_TROPHY, _appendLog, _autoResolve, _checkEnd, _data, _enemy, _enemyName, _enemyOptions, _numField, _pickEnemy, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _renderStatus, _rollLp, _startBattle, _strike, _strikeOnce, closeSim412, currentPlaythrough, drawChance, escapeHtml, getPlayBtnRow, initSim412, lifeTier, openSim412, registerPanelShortcut, renderSim412, resolveStrike, saveState, setSim412Visible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _enemy, _enemyName, _checkEnd, _startBattle, _strikeOnce, _strike, _autoResolve, _rollLp, _pickEnemy } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Принцът на Алкирия, book 412)
// Шанс-table + life-tier engine; player Strength follows current Life Points.

import { currentPlaythrough, saveState } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { drawChance, lifeTier, resolveStrike } from "../.././engines/alkiria.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Roster fed from book_enemies; §454 (Черна сянка) has no printed ж.т., defaulted and editable.

// ── Render ───────────────────────────────────────────────────────────────

function _renderStatus() {
  const d = _data();
  const el = document.getElementById('sim412-status');
  if (!d || !el) return;
  if (d.over) {
    el.innerHTML = d.winner === 'player' && d.timedEncounter ? t('battlesim412.log.continue',{section:d.timedEncounter.destination}) : d.winner === 'player'
      ? t('battlesim412.status.victory', { trophy: SVG_TROPHY })
      : t('battlesim412.status.defeat', { skull: SVG_SKULL });
  } else {
    el.innerHTML = '';
  }
  const tier = lifeTier(d.player.lp);
  document.getElementById('sim412-player-stat').textContent =
    t('battlesim412.stat.player', { lp: Math.max(0, d.player.lp), level: tier.level, str: tier.str + (d.printedCombatRules === 1 ? (d.companionBonus || 0) : 0) });
  document.getElementById('sim412-enemy-stat').textContent =
    d.timedEncounter ? t('battlesim412.stat.timed',{str:d.enemy.str,strike:d.timedEncounter.strikes,total:d.timedEncounter.minStrikes}) :
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

function _renderInputs() {
  const d = _data();
  if (!d) return;
  if (editorState !== d) {
    editorState = d;
    opponents.set([{...d.enemy, hp: d.enemy.startHp, displayName: d.enemyName ?? t(_enemy(d.enemyId).nameKey),
      ...(d.timedEncounter?{minStrikes:d.timedEncounter.minStrikes,destination:d.timedEncounter.destination}:{})}]);
  }
  const busy = d.started && !d.over;
  opponents.lock(busy);
  document.getElementById('sim412-player-lp').value = d.player.lp;
  document.getElementById('sim412-companion').checked = d.nextCompanionBonus === true;
  document.getElementById('sim412-start').disabled = busy;
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
            <label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim412.ui.companion')}</span><input id="sim412-companion" type="checkbox"></label>
            <div id="sim412-player-stat" class="bsim-stat-summary"></div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim412.ui.enemy')}</div>
            <div id="sim412-opponent-editor"></div>
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
  opponents = createOpponentEditor({document, id: 'sim412', t, language: 'bg',
    fields: [{key: 'str', label: t('battlesim412.ui.str')}, {key: 'hp', label: t('battlesim412.ui.hp'), min: 1}],
    presets: ROSTER.map(enemy => ({...enemy, displayName: t(enemy.nameKey)})),
    isStatUnavailable:(key,enemy)=>key==='hp'&&Boolean(enemy.minStrikes)});
  opponents.fixCount(true);
  document.getElementById('sim412-opponent-editor').append(opponents.element);

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

  document.getElementById('sim412-start').addEventListener('click', () => {
    const d = _data();
    if (!d || d.started && !d.over) return;
    try {
      const raw=opponents.snapshot();
      const [enemy] = raw[0]?.minStrikes ? validateOpponents(raw,[{key:'str'}]) : opponents.read();
      if(enemy.minStrikes){
        if(!Number.isSafeInteger(enemy.minStrikes)||enemy.minStrikes<1||!Number.isSafeInteger(enemy.destination))throw new RangeError('Invalid timed encounter');
        d.timedEncounter={minStrikes:enemy.minStrikes,destination:enemy.destination,strikes:0};
      }else delete d.timedEncounter;
      if(ROSTER.some(row=>row.id===enemy.id))d.enemyId=enemy.id;
      d.enemyName = enemy.displayName || t('battlesim.editor.bg.name');
      d.enemy = {str: enemy.str, hp: enemy.hp, startHp: enemy.hp};
      _startBattle();
    } catch { showAlert(t('battlesim.editor.bg.invalid')); }
  });
  document.getElementById('sim412-strike').addEventListener('click', _strike);
  document.getElementById('sim412-auto').addEventListener('click', _autoResolve);
  document.getElementById('sim412-roll-lp').addEventListener('click', _rollLp);
  document.getElementById('sim412-companion').addEventListener('change', e => {
    const d = _data(); if (!d) return;
    d.nextCompanionBonus = e.target.checked;
    saveState();
  });

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

function _enemyOptions(selectedId) {

  return ROSTER.map(e => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(t(e.nameKey))}</option>`).join('');
}

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

export { initSim412 as init, renderSim412 as render, setSim412Visible as setVisible };
