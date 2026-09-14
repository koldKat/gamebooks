// ── Battle Simulator (Бойците на Европа, book 760) ──────────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 760 only) by the caller in boot.js via
// setSim760Visible().
// To remove: delete this file, remove its import line and initSim760()/
// setSim760Visible() calls from boot.js, remove 'sim760' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim760-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim760-btn selectors in
// battlesim.css.
//
// This book is a 5-fighter round-robin tournament, not one fixed
// protagonist facing narrative enemies (unlike every other sim in this
// app). The reader picks ONE of 5 playable fighters at the start
// (Хамелеона §10, Стейси Бул/Червената чума §20, Хорацио Б. Андреас §30,
// Кръстника §40, Чери Уилсън/БА 764 §50), each with distinct stats, then
// fights the other four (reader's choice of order) in round 1 and the
// shared final boss "666" in round 2. All fights use one uniform
// dice-based resolver, documented on the book's own rules page as
// "Стандартна схватка" (Standard Combat):
//   1. Initiative: whoever has higher (Interactive Status + Chance,
//      Chance = d6) goes first for the whole fight; if the gap is 3+,
//      that fighter opens with two consecutive hits before alternation
//      begins.
//   2. Hit power = attacker's Offensive Status + Chance (d6).
//   3. Damage dealt = hit power minus defender's Defensive Status,
//      floored at 0.
//   4. Turns alternate until one fighter's Живот (Life) reaches 0.
// Rather than hardcode the narrative bracket order, the sim lets the user
// pick their fighter and any opponent (the other 4 rivals or 666) and
// resolves that one fight - matching how the book's mechanic actually
// works (same formula regardless of matchup) while staying honest about
// not tracking the full tournament bracket, per this app's "sim is
// convenience, not enforcement" precedent.
//
// Full roster (verified via a complete read of all 355 sections this
// session; stats come from the book's own character-intro pages):
//   Хамелеона            ОС3 ДС3 ИС3 Живот20 (built-in claws)
//   Стейси Бул/Ч.чума    ОС3 ДС2 ИС4 Живот20 (hidden knives)
//   Хорацио Б. Андреас   ОС3 ДС4 ИС2 Живот20 (bare-handed, carbon skeleton)
//   Кръстника            ОС5 ДС2 ИС2 Живот20 (steel chain)
//   Чери Уилсън/БА 764   ОС3 ДС1 ИС5 Живот20 (carbon staff, morphs)
//   666 (final boss)     ОС6 ДС6 ИС6 Живот40 (AI construct)
//
// All state lives in pt.sim760, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const ROSTER = [
  { id: 'chameleon', name: 'Хамелеона',               attack: 3, defense: 3, interactive: 3, life: 20 },
  { id: 'stacy',      name: 'Стейси Бул/Червената чума', attack: 3, defense: 2, interactive: 4, life: 20 },
  { id: 'horatio',    name: 'Хорацио Б. Андреас',      attack: 3, defense: 4, interactive: 2, life: 20 },
  { id: 'godfather',  name: 'Кръстника',               attack: 5, defense: 2, interactive: 2, life: 20 },
  { id: 'cherry',     name: 'Чери Уилсън/БА 764',      attack: 3, defense: 1, interactive: 5, life: 20 },
  { id: '666',        name: '666',                     attack: 6, defense: 6, interactive: 6, life: 40 },
];

function _fighter(id) { return ROSTER.find(f => f.id === id) || ROSTER[0]; }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim760) {
    pt.sim760 = {
      playerId: 'chameleon',
      enemyId: '666',
      player: { attack: 3, defense: 3, interactive: 3, life: 20 },
      enemy:  { attack: 6, defense: 6, interactive: 6, life: 40 },
      turn: null,        // 'player' | 'enemy' - whose turn is next
      started: false,
      log: [],
      history: [],
    };
  }
  const d = pt.sim760;
  if (!d.playerId) d.playerId = 'chameleon';
  if (!d.enemyId) d.enemyId = '666';
  if (!d.player) d.player = { ..._fighter(d.playerId) };
  if (!d.enemy) d.enemy = { ..._fighter(d.enemyId) };
  if (d.turn === undefined) d.turn = null;
  if (d.started === undefined) d.started = false;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _playerName(d) { return _fighter(d.playerId).name; }
function _enemyName(d) { return _fighter(d.enemyId).name; }

function _playerWon(d) { return d.enemy.life <= 0; }
function _playerLost(d) { return d.player.life <= 0; }
function _battleOver(d) { return _playerWon(d) || _playerLost(d); }

function _recordOutcome(d, outcome) {
  d.history.push({
    player: _playerName(d), enemy: _enemyName(d), outcome,
    playerLife: d.player.life, enemyLife: d.enemy.life,
    ts: Date.now(),
  });
}

// ── Combat ───────────────────────────────────────────────────────────────

function _startBattle(d) {
  const pChance = _roll1d6();
  const eChance = _roll1d6();
  const pInit = d.player.interactive + pChance;
  const eInit = d.enemy.interactive + eChance;
  d.started = true;
  if (pInit >= eInit) {
    d.turn = 'player';
    _appendLog(d, t('battlesim760.log.initiative', { name: _playerName(d), score: pInit, oname: _enemyName(d), oscore: eInit }));
    if (pInit - eInit >= 3) {
      _appendLog(d, t('battlesim760.log.double_hit', { name: _playerName(d) }));
      _strike(d, 'player');
      if (!_battleOver(d)) _strike(d, 'player');
      if (!_battleOver(d)) d.turn = 'enemy';
    }
  } else {
    d.turn = 'enemy';
    _appendLog(d, t('battlesim760.log.initiative', { name: _enemyName(d), score: eInit, oname: _playerName(d), oscore: pInit }));
    if (eInit - pInit >= 3) {
      _appendLog(d, t('battlesim760.log.double_hit', { name: _enemyName(d) }));
      _strike(d, 'enemy');
      if (!_battleOver(d)) _strike(d, 'enemy');
      if (!_battleOver(d)) d.turn = 'player';
    }
  }
}

function _strike(d, who) {
  const attacker = who === 'player' ? d.player : d.enemy;
  const defender = who === 'player' ? d.enemy  : d.player;
  const attackerName = who === 'player' ? _playerName(d) : _enemyName(d);
  const defenderName = who === 'player' ? _enemyName(d)  : _playerName(d);
  const chance = _roll1d6();
  const hitPower = attacker.attack + chance;
  const dmg = Math.max(0, hitPower - defender.defense);
  defender.life = Math.max(0, defender.life - dmg);
  if (dmg > 0) {
    _appendLog(d, t('battlesim760.log.hit', { attacker: attackerName, hitPower, defender: defenderName, dmg, life: defender.life }));
  } else {
    _appendLog(d, t('battlesim760.log.miss', { attacker: attackerName, hitPower, defender: defenderName }));
  }
}

function _runRound() {
  const d = _data();
  if (!d || _battleOver(d)) return;

  if (!d.started) {
    _startBattle(d);
  } else {
    _strike(d, d.turn);
    if (!_battleOver(d)) d.turn = d.turn === 'player' ? 'enemy' : 'player';
  }

  if (_playerWon(d)) {
    _appendLog(d, t('battlesim760.log.defeated', { trophy: SVG_TROPHY, name: _playerName(d), enemy: _enemyName(d) }));
    _recordOutcome(d, 'win');
  } else if (_playerLost(d)) {
    _appendLog(d, t('battlesim760.log.fallen', { skull: SVG_SKULL, name: _playerName(d), enemy: _enemyName(d) }));
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.player = { ..._fighter(d.playerId) };
  d.enemy = { ..._fighter(d.enemyId) };
  d.turn = null;
  d.started = false;
  if (d.log.length) _appendLog(d, t('battlesim760.log.reset_sep'));
  _appendLog(d, t('battlesim760.log.reset', { name: _playerName(d), enemy: _enemyName(d) }));
  saveState();
  _renderAll();
}

function _pickPlayer(id) {
  const d = _data();
  if (!d) return;
  d.playerId = id;
  if (d.enemyId === id) d.enemyId = ROSTER.find(f => f.id !== id)?.id || '666';
  _resetBattle();
}

function _pickEnemy(id) {
  const d = _data();
  if (!d) return;
  d.enemyId = id;
  if (d.playerId === id) d.playerId = ROSTER.find(f => f.id !== id)?.id || 'chameleon';
  _resetBattle();
}

// ── Render ───────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim760-status');
  if (!d || !el) return;
  if (_playerLost(d))      el.innerHTML = t('battlesim760.status.fallen', { skull: SVG_SKULL });
  else if (_playerWon(d))  el.innerHTML = t('battlesim760.status.victory', { trophy: SVG_TROPHY });
  else                     el.innerHTML = '';
  document.getElementById('sim760-round').disabled = _battleOver(d);
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim760-history-summary');
  const listEl = document.getElementById('sim760-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim760.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim760.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim760.history.won') : t('battlesim760.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.player)} ${t('battlesim760.history.vs')} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim760-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _fighterOptions(selectedId) {
  return ROSTER.map(f => `<option value="${f.id}" ${f.id === selectedId ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim760-player-pick').innerHTML = _fighterOptions(d.playerId);
  document.getElementById('sim760-enemy-pick').innerHTML  = _fighterOptions(d.enemyId);

  document.getElementById('sim760-player-attack').value      = d.player.attack;
  document.getElementById('sim760-player-defense').value     = d.player.defense;
  document.getElementById('sim760-player-interactive').value = d.player.interactive;
  document.getElementById('sim760-player-life').value        = d.player.life;

  document.getElementById('sim760-enemy-attack').value      = d.enemy.attack;
  document.getElementById('sim760-enemy-defense').value     = d.enemy.defense;
  document.getElementById('sim760-enemy-interactive').value = d.enemy.interactive;
  document.getElementById('sim760-enemy-life').value        = d.enemy.life;

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim760() {
  const overlay = document.getElementById('sim760-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim760(); return; }
  _renderAll();
}

function openSim760() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim760-overlay').classList.add('active');
}

function closeSim760() {
  document.getElementById('sim760-overlay')?.classList.remove('active');
}

export function setSim760Visible(visible) {
  const btn = document.getElementById('sim760-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim760();
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

export function initSim760() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim760-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim760.ui.title')}</span>
        <button id="sim760-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim760.ui.you')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim760.ui.pick')}</span>
              <select id="sim760-player-pick" class="inv-edit-input"></select>
            </div>
            ${_numField(t('battlesim760.ui.attack'), 'sim760-player-attack')}
            ${_numField(t('battlesim760.ui.defense'), 'sim760-player-defense')}
            ${_numField(t('battlesim760.ui.interactive'), 'sim760-player-interactive')}
            ${_numField(t('battlesim760.ui.life'), 'sim760-player-life')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim760.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim760.ui.pick')}</span>
              <select id="sim760-enemy-pick" class="inv-edit-input"></select>
            </div>
            ${_numField(t('battlesim760.ui.attack'), 'sim760-enemy-attack')}
            ${_numField(t('battlesim760.ui.defense'), 'sim760-enemy-defense')}
            ${_numField(t('battlesim760.ui.interactive'), 'sim760-enemy-interactive')}
            ${_numField(t('battlesim760.ui.life'), 'sim760-enemy-life')}
          </div>
          <div id="sim760-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim760-round" class="inv-add-btn bsim-action-primary">${t('battlesim760.btn.round')}</button>
            <button id="sim760-reset" class="inv-add-btn">${t('battlesim760.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim760-history-summary">${t('battlesim760.history.summary', { n: 0 })}</summary>
            <div id="sim760-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim760-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim760-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim760);
  document.getElementById('sim760-close').addEventListener('click', closeSim760);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim760(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim760-overlay'),
    open:  openSim760,
    close: closeSim760,
  });

  document.getElementById('sim760-player-pick').addEventListener('change', e => _pickPlayer(e.target.value));
  document.getElementById('sim760-enemy-pick').addEventListener('change', e => _pickEnemy(e.target.value));
  document.getElementById('sim760-round').addEventListener('click', _runRound);
  document.getElementById('sim760-reset').addEventListener('click', _resetBattle);

  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d) return;
      const id    = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const val   = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
      input.value = val;
      if (id === 'sim760-player-attack')      d.player.attack = val;
      else if (id === 'sim760-player-defense')     d.player.defense = val;
      else if (id === 'sim760-player-interactive') d.player.interactive = val;
      else if (id === 'sim760-player-life')        d.player.life = val;
      else if (id === 'sim760-enemy-attack')       d.enemy.attack = val;
      else if (id === 'sim760-enemy-defense')      d.enemy.defense = val;
      else if (id === 'sim760-enemy-interactive')  d.enemy.interactive = val;
      else if (id === 'sim760-enemy-life')         d.enemy.life = val;
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
      const id = input.id;
      if (id === 'sim760-player-attack')      d.player.attack = val;
      else if (id === 'sim760-player-defense')     d.player.defense = val;
      else if (id === 'sim760-player-interactive') d.player.interactive = val;
      else if (id === 'sim760-player-life')        d.player.life = val;
      else if (id === 'sim760-enemy-attack')       d.enemy.attack = val;
      else if (id === 'sim760-enemy-defense')      d.enemy.defense = val;
      else if (id === 'sim760-enemy-interactive')  d.enemy.interactive = val;
      else if (id === 'sim760-enemy-life')         d.enemy.life = val;
      saveState();
      _renderStatus();
    });
  });
}
