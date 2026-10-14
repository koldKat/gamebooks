import { RIVALS, SPECIAL2 } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, RIVALS, ROUND1, ROUND2, SPECIAL2, SVG_SKULL, SVG_TROPHY, _appendLog, _checkEnd, _contraCheck, _counterDefenses, _d6, _dN, _dalgrenBlockOnly, _dalgrenR1, _dalgrenR2, _data, _freshEntity, _kill, _lestorR1, _lestorR2, _loseB, _loseE, _magicExchange, _matualR1, _numField, _oppDead, _oppOptions, _pickCounterDefense, _pickOppOption, _pickPlayerOption, _pickRival, _pickSourceOption, _pickSpecial, _playerAttackOptions, _playerDead, _recompute, _recordOutcome, _renderActions, _renderAll, _renderHistory, _renderInputs, _renderLog, _renderStatus, _rival, _rivalName, _rivalNameById, _rivalOptionsHtml, _shieldAbsorb, _shieldField, _shieldLabel, _smajtalR1, _smajtalR2, _startBattle, _statLine, _tejbrunR1, _tindalinR1, _tindalinR2Real, _uantorR1, _uantorR2, closeSim869, currentPlaythrough, escapeHtml, getPlayBtnRow, gt, initSim869, openSim869, registerPanelShortcut, renderSim869, saveState, setSim869Visible, shortcutLabel, showAlert, t, tigerOptions, tigerResolve });
const { _data, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _rival, _rivalNameById, _d6, _dN, _shieldAbsorb, _freshEntity, _recompute, _loseE, _loseB, _magicExchange, _kill, _dalgrenR1, _dalgrenR2, _dalgrenBlockOnly, _tindalinR1, _tindalinR2Real, _uantorR1, _uantorR2, _smajtalR1, _smajtalR2, _lestorR1, _lestorR2, _tejbrunR1, _matualR1, _counterDefenses, _contraCheck, _playerAttackOptions, _rivalName, _playerDead, _oppDead, _checkEnd, _startBattle, _oppOptions, _pickOppOption, _pickSpecial, _pickPlayerOption, _pickCounterDefense, _pickRival, _pickSourceOption, _shieldLabel, _statLine } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Тигрово око, book 869)
// Each named rival has distinct first-round and later-round attack formulas.
// Enter current player stats; narrative progression and unsupported gear effects remain manual.

import { currentPlaythrough, saveState } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { tigerOptions, tigerResolve } from "../.././engines/tiger-eye.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;











// ── Generic shared message helpers ──────────────────────────────────────

const gt = (key, params) => t(`battlesim869.g.${key}`, params);

// Entity fields: s,e,m,b,sword,shield,startE,startB,lostE,skillLossExtra.













// Attack options return {label,run(player,opp)}; player is the reader, opp the rival.


























const ROUND1 = { dalgren: _dalgrenR1, tindalin: _tindalinR1, uantor: _uantorR1, smajtal: _smajtalR1, lestor: _lestorR1, tejbrun: _tejbrunR1, matual: _matualR1 };
const ROUND2 = { dalgren: _dalgrenR2, tindalin: _tindalinR2Real, uantor: _uantorR2, smajtal: _smajtalR2, lestor: _lestorR2 };


// ── Player attack menu (shared across all rivals) ───────────────────────







// ── Simulation state ─────────────────────────────────────────────────────




























// ── Render ───────────────────────────────────────────────────────────────





function _renderStatus() {
  const d = _data();
  const el = document.getElementById('sim869-status');
  if (!d || !el) return;
  if (d.over) {
    if (d.winner === 'player') el.innerHTML = t('battlesim869.status.victory', { trophy: SVG_TROPHY });
    else if (d.winner === 'truce') el.innerHTML = t('battlesim869.status.truce');
    else el.innerHTML = t('battlesim869.status.fallen', { skull: SVG_SKULL });
  } else {
    el.innerHTML = '';
  }
  document.getElementById('sim869-player-stats').textContent = _statLine(d.player);
  document.getElementById('sim869-opp-stats').textContent = _statLine(d.opp);
  document.getElementById('sim869-opp-name').textContent = _rivalName(d);
}

function _renderActions() {
  const d = _data();
  const el = document.getElementById('sim869-actions');
  if (!d || !el) return;
  if (d.over || !d.started) { el.innerHTML = ''; return; }
  if (d.rulesVersion === 1) {
    if (d.turn === 'manual') { el.textContent = t('battlesim869.source.manual', { section: d.manualSection }); return; }
    const kind = d.pendingDefense ? 'counter' : d.turn === 'player' ? 'player' : 'opp';
    el.innerHTML = `<div class="bsim-turn-label">${t('battlesim869.turn.' + (d.pendingDefense ? 'defend' : d.turn), { name: _rivalName(d) })}</div>` + tigerOptions(d).map((key, i) => `<button class="inv-add-btn bsim-action-primary sim869-opt" data-kind="${kind}" data-idx="${i}">${escapeHtml(t('battlesim869.' + key))}</button>`).join('');
    return;
  }

  if (d.pendingDefense) {
    const defenses = _counterDefenses(d.player, d.opp);
    el.innerHTML = `<div class="bsim-turn-label">${t('battlesim869.turn.defend')}</div>` +
      defenses.map((o, i) => `<button class="inv-add-btn bsim-action-primary sim869-opt" data-kind="counter" data-idx="${i}">${escapeHtml(o.label)}</button>`).join('');
    return;
  }

  if (d.turn === 'opp') {
    if (d.phase === 2 && SPECIAL2.includes(d.rivalId)) {
      const labels = d.rivalId === 'tejbrun'
        ? [t('battlesim869.tejbrun.truce'), t('battlesim869.tejbrun.attack')]
        : [t('battlesim869.matual.water'), t('battlesim869.matual.attack'), t('battlesim869.matual.sword')];
      el.innerHTML = `<div class="bsim-turn-label">${t('battlesim869.turn.special', { name: _rivalName(d) })}</div>` +
        labels.map((l, i) => `<button class="inv-add-btn bsim-action-primary sim869-opt" data-kind="opp" data-idx="${i}">${escapeHtml(l)}</button>`).join('');
      return;
    }
    const opts = _oppOptions(d);
    el.innerHTML = `<div class="bsim-turn-label">${t('battlesim869.turn.opp', { name: _rivalName(d) })}</div>` +
      opts.map((o, i) => `<button class="inv-add-btn bsim-action-primary sim869-opt" data-kind="opp" data-idx="${i}">${escapeHtml(o.label)}</button>`).join('');
    return;
  }

  const opts = _playerAttackOptions(d.player, d.opp, d.phase === 1);
  el.innerHTML = `<div class="bsim-turn-label">${t('battlesim869.turn.player')}</div>` +
    opts.map((o, i) => `<button class="inv-add-btn bsim-action-primary sim869-opt" data-kind="player" data-idx="${i}">${escapeHtml(o.label)}</button>`).join('');
}

function _renderHistory() {
  const d = _data();
  const sumEl = document.getElementById('sim869-history-summary');
  const listEl = document.getElementById('sim869-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim869.history.summary', { n: d.history.length });
  if (!d.history.length) { listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim869.history.empty')}</div>`; return; }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon = h.outcome === 'win' ? SVG_TROPHY : h.outcome === 'truce' ? '🤝' : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim869.history.won') : h.outcome === 'truce' ? t('battlesim869.history.truced') : t('battlesim869.history.lost');
    const date = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const enemyName = _rivalNameById(h.enemyId);
    return `<div class="bsim-history-row"><span>${icon} ${t('battlesim869.history.you')} ${t('battlesim869.history.vs')} ${escapeHtml(enemyName)} - ${result}</span><span class="bsim-history-meta">${date}</span></div>`;
  }).join('');
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim869-log');
  if (!el || !d) return;
  el.innerHTML = d.log.filter(Boolean).slice().reverse().join('<br>');
}



function _renderInputs() {
  const d = _data();
  if (!d) return;
  document.getElementById('sim869-rival-pick').innerHTML = _rivalOptionsHtml(d.rivalId);

  document.getElementById('sim869-player-s').value = d.player.s;
  document.getElementById('sim869-player-e').value = d.player.startE;
  document.getElementById('sim869-player-m').value = d.player.m;
  document.getElementById('sim869-player-b').value = d.player.startB;
  document.getElementById('sim869-player-sword').value = d.player.sword;
  document.getElementById('sim869-player-shield').value = d.player.shield;

  document.getElementById('sim869-opp-e').value = d.opp.startE;
  document.getElementById('sim869-opp-b').value = d.opp.startB;
  document.getElementById('sim869-opp-m').value = d.opp.m;
  document.getElementById('sim869-opp-s').value = d.opp.s;
  document.getElementById('sim869-opp-sword').value = d.opp.sword;
  document.getElementById('sim869-opp-shield').value = d.opp.shield;
  const controls = document.getElementById('sim869-source-controls');
  controls.hidden = d.rulesVersion !== 1;
  for (const field of ['magicSpend', 'enduranceSpend', 'skillSpend']) {
    document.getElementById('sim869-' + field).value = d.options?.[field] ?? 0;
  }

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderActions();
  _renderLog();
  _renderHistory();
}

export function renderSim869() {
  const overlay = document.getElementById('sim869-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim869(); return; }
  _renderAll();
}

function openSim869() {
  if (!_data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  _renderAll();
  document.getElementById('sim869-overlay').classList.add('active');
}

function closeSim869() { document.getElementById('sim869-overlay')?.classList.remove('active'); }

export function setSim869Visible(visible) {
  const btn = document.getElementById('sim869-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim869();
}

// ── Init ─────────────────────────────────────────────────────────────────





export function initSim869() {
  const overlay = document.createElement('div');
  overlay.id = 'sim869-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim869.ui.title')}</span>
        <button id="sim869-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim869.ui.you')}</div>
            ${_numField(t('battlesim869.ui.strength'), 'sim869-player-s')}
            ${_numField(t('battlesim869.ui.stamina'), 'sim869-player-e')}
            ${_numField(t('battlesim869.ui.magic'), 'sim869-player-m')}
            ${_numField(t('battlesim869.ui.skill'), 'sim869-player-b')}
            ${_numField(t('battlesim869.ui.sword'), 'sim869-player-sword')}
            ${_shieldField(t('battlesim869.ui.shield'), 'sim869-player-shield')}
            <div id="sim869-player-stats" class="bsim-stat-summary"></div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title" id="sim869-opp-name">${t('battlesim869.ui.rival')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim869.ui.pick')}</span>
              <select id="sim869-rival-pick" class="inv-edit-input"></select>
            </div>
            ${_numField(t('battlesim869.ui.strength'), 'sim869-opp-s')}
            ${_numField(t('battlesim869.ui.stamina'), 'sim869-opp-e')}
            ${_numField(t('battlesim869.ui.magic'), 'sim869-opp-m')}
            ${_numField(t('battlesim869.ui.skill'), 'sim869-opp-b')}
            ${_numField(t('battlesim869.ui.sword'), 'sim869-opp-sword')}
            ${_shieldField(t('battlesim869.ui.shield'), 'sim869-opp-shield')}
            <div id="sim869-opp-stats" class="bsim-stat-summary"></div>
          </div>
          <div id="sim869-status" class="bsim-status"></div>
          <div id="sim869-source-controls" hidden>
            ${_numField(t('battlesim869.source.magic_spend'), 'sim869-magicSpend')}
            ${_numField(t('battlesim869.source.endurance_spend'), 'sim869-enduranceSpend')}
            ${_numField(t('battlesim869.source.skill_spend'), 'sim869-skillSpend')}
            <p class="bsim-stat-summary">${t('battlesim869.source.note')}</p>
          </div>
          <div id="sim869-actions" class="bsim-action-grid"></div>
          <div class="inv-modal-ftr">
            <button id="sim869-start" class="inv-add-btn">${t('battlesim869.btn.start')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim869-history-summary">${t('battlesim869.history.summary', { n: 0 })}</summary>
            <div id="sim869-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim869-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id = 'sim869-btn';
  btn.innerHTML = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim869);
  document.getElementById('sim869-close').addEventListener('click', closeSim869);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim869(); });
  registerPanelShortcut('KeyS', {
    getButton: () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim869-overlay'),
    open: openSim869,
    close: closeSim869,
  });

  document.getElementById('sim869-rival-pick').addEventListener('change', e => _pickRival(e.target.value));
  document.getElementById('sim869-start').addEventListener('click', _startBattle);

  overlay.addEventListener('click', e => {
    const optBtn = e.target.closest('.sim869-opt');
    if (!optBtn) return;
    const kind = optBtn.dataset.kind;
    const idx = Number(optBtn.dataset.idx);
    if (kind === 'opp') _pickOppOption(idx);
    else if (kind === 'player') _pickPlayerOption(idx);
    else if (kind === 'counter') _pickCounterDefense(idx);
  });

  const fieldMap = {
    'sim869-magicSpend': (d, v) => { d.options.magicSpend = v; },
    'sim869-enduranceSpend': (d, v) => { d.options.enduranceSpend = v; },
    'sim869-skillSpend': (d, v) => { d.options.skillSpend = v; },
    'sim869-player-s': (d, v) => { d.player.s = v; },
    'sim869-player-e': (d, v) => { d.player.e = v; d.player.startE = v; d.player.lostE = 0; },
    'sim869-player-m': (d, v) => { d.player.m = v; },
    'sim869-player-b': (d, v) => { d.player.startB = v; d.player.skillLossExtra = 0; if (d.rulesVersion !== 1) d.player.lostE = 0; _recompute(d.player); },
    'sim869-player-sword': (d, v) => { d.player.sword = v; },
    'sim869-opp-s': (d, v) => { d.opp.s = v; },
    'sim869-opp-e': (d, v) => { d.opp.e = v; d.opp.startE = v; d.opp.lostE = 0; },
    'sim869-opp-m': (d, v) => { d.opp.m = v; },
    'sim869-opp-b': (d, v) => { d.opp.startB = v; d.opp.skillLossExtra = 0; if (d.rulesVersion !== 1) d.opp.lostE = 0; _recompute(d.opp); },
    'sim869-opp-sword': (d, v) => { d.opp.sword = v; },
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
      if (d.rulesVersion === 1 && id.startsWith('sim869-opp-')) d.rivalSetup = { ...d.opp, e: d.opp.startE, b: d.opp.startB };
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
      if (d.rulesVersion === 1 && input.id.startsWith('sim869-opp-')) d.rivalSetup = { ...d.opp, e: d.opp.startE, b: d.opp.startB };
      saveState();
      _renderStatus();
    });
  });

  document.getElementById('sim869-player-shield').addEventListener('change', e => { const d = _data(); if (d) { d.player.shield = e.target.value; saveState(); } });
  document.getElementById('sim869-opp-shield').addEventListener('change', e => { const d = _data(); if (d) { d.opp.shield = e.target.value; if (d.rulesVersion === 1 && d.rivalSetup) d.rivalSetup.shield = e.target.value; saveState(); } });
}

function _rivalOptionsHtml(selectedId) {

  return RIVALS.map(r => `<option value="${r.id}" ${r.id === selectedId ? 'selected' : ''}>${escapeHtml(t(r.nameKey))}</option>`).join('');
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

function _shieldField(label, id) {

  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <select id="${id}" class="inv-edit-input">
        <option value="none">${t('battlesim869.shield.none')}</option>
        <option value="magic">${t('battlesim869.shield.magic')}</option>
        <option value="holy">${t('battlesim869.shield.holy')}</option>
      </select>
    </div>`;
}

export { initSim869 as init, renderSim869 as render, setSim869Visible as setVisible };
