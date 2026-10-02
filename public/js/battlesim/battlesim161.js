// ── Battle Simulator (Blood of the Zombies, book 161) ───────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 161 only) by the caller in boot.js via
// setSim161Visible().
// To remove: delete this file, remove its import line and initSim161()/
// setSim161Visible() calls from boot.js, remove 'sim161' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim161-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim161-btn selectors in
// battlesim.css.
//
// This book's combat system (book_frontmatter.rules_text) is NOT classic
// Fighting Fantasy SKILL/STAMINA/LUCK - it's a horde-clearance system:
//   - Player STAMINA: roll 2d6+20 to start.
//   - Nearly every enemy (Zombies, Attack Dogs) has exactly 1 STAMINA point
//     each - a weapon's DAMAGE roll each Attack Round directly equals the
//     number of enemies killed that round (capped at however many remain).
//   - Any enemies that survive a round each inflict DAMAGE back before the
//     next round (normally 1 point per survivor, confirmed variable in a
//     couple of specific encounters - e.g. axe-wielding Zombies at 2 each,
//     one Attack Dog encounter at 2 each vs. another at 1 each - so this is
//     exposed as an adjustable field, not hardcoded).
//   - Grenades are a pre-combat, one-off "reduce enemy count by 2d6+1"
//     action, not a per-round weapon.
//   - Med Kits restore STAMINA once (usually +4, occasionally +2 - exposed
//     as an adjustable amount rather than a fixed button).
//   - Full read of all 400 sections found ONE named durable enemy that
//     doesn't follow the 1-STAMINA-per-body horde rule: Gingrich Yurr in his
//     final barehanded confrontation (7 STAMINA, section 117) - modeled as
//     a separate "Duel" fight type where both sides roll their own weapon
//     dice each round against the other's STAMINA pool directly, since he's
//     a single durable body rather than a horde. "Zombie Kong" (section 158,
//     a one-off combined-roll-vs-20 threshold puzzle) and any other single
//     scripted set-piece checks are intentionally left out of scope, same as
//     other sims in this project exclude one-off narrative-only mechanics.
//
// Weapon roster (DAMAGE dice, confirmed via full text search across all
// sections):
//   Barehanded            1d6-3
//   Crowbar / Axe / Sword / Baseball bat   1d6
//   Handgun / Pistol      1d6+2
//   Sawn-off shotgun      1d6+4
//   Shotgun               1d6+5
//   Chainsaw              2d6+3
//   Browning machine gun  2d6+15
//
// All state lives in pt.sim161, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState } from '../core/state.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const WEAPONS = [
  { id: 'bare',     nameKey: 'battlesim161.weapon.bare',     dice: 1, sides: 6, mod: -3 },
  { id: 'melee',    nameKey: 'battlesim161.weapon.melee',    dice: 1, sides: 6, mod: 0 },
  { id: 'handgun',  nameKey: 'battlesim161.weapon.handgun',  dice: 1, sides: 6, mod: 2 },
  { id: 'sawnoff',  nameKey: 'battlesim161.weapon.sawnoff',  dice: 1, sides: 6, mod: 4 },
  { id: 'shotgun',  nameKey: 'battlesim161.weapon.shotgun',  dice: 1, sides: 6, mod: 5 },
  { id: 'chainsaw', nameKey: 'battlesim161.weapon.chainsaw', dice: 2, sides: 6, mod: 3 },
  { id: 'browning', nameKey: 'battlesim161.weapon.browning', dice: 2, sides: 6, mod: 15 },
  { id: 'custom',   nameKey: 'battlesim161.weapon.custom',   dice: 1, sides: 6, mod: 0 },
];

function _weapon(id) { return WEAPONS.find(w => w.id === id) || WEAPONS[0]; }
function _weaponNameById(id) { return t(_weapon(id).nameKey); }

function _die(sides) { return 1 + Math.floor(Math.random() * sides); }
function _rollDice(n, sides, mod) {
  let total = mod;
  for (let i = 0; i < n; i++) total += _die(sides);
  return total;
}
function _rollWeapon(d, whoseDiceN, whoseDiceSides, whoseDiceMod) {
  return Math.max(0, _rollDice(whoseDiceN, whoseDiceSides, whoseDiceMod));
}

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim161) {
    pt.sim161 = {
      mode: 'horde', // 'horde' | 'duel'
      playerStamina: 27, playerStaminaMax: 27,
      weaponId: 'handgun', diceN: 1, diceSides: 6, diceMod: 2,
      enemyCount: 10, retaliation: 1,
      duelEnemyStamina: 7, duelEnemyStaminaMax: 7,
      duelPlayerDiceN: 1, duelPlayerDiceSides: 6, duelPlayerDiceMod: -3,
      duelEnemyDiceN: 1, duelEnemyDiceSides: 6, duelEnemyDiceMod: -3,
      medkitAmount: 4,
      over: false, winner: null, started: false, log: [], history: [],
    };
  }
  const d = pt.sim161;
  if (d.mode !== 'horde' && d.mode !== 'duel') d.mode = 'horde';
  if (typeof d.playerStamina !== 'number') d.playerStamina = 27;
  if (typeof d.playerStaminaMax !== 'number') d.playerStaminaMax = 27;
  if (!d.weaponId) d.weaponId = 'handgun';
  if (typeof d.diceN !== 'number') d.diceN = 1;
  if (typeof d.diceSides !== 'number') d.diceSides = 6;
  if (typeof d.diceMod !== 'number') d.diceMod = 2;
  if (typeof d.enemyCount !== 'number') d.enemyCount = 10;
  if (typeof d.retaliation !== 'number') d.retaliation = 1;
  if (typeof d.duelEnemyStamina !== 'number') d.duelEnemyStamina = 7;
  if (typeof d.duelEnemyStaminaMax !== 'number') d.duelEnemyStaminaMax = 7;
  if (typeof d.duelPlayerDiceN !== 'number') d.duelPlayerDiceN = 1;
  if (typeof d.duelPlayerDiceSides !== 'number') d.duelPlayerDiceSides = 6;
  if (typeof d.duelPlayerDiceMod !== 'number') d.duelPlayerDiceMod = -3;
  if (typeof d.duelEnemyDiceN !== 'number') d.duelEnemyDiceN = 1;
  if (typeof d.duelEnemyDiceSides !== 'number') d.duelEnemyDiceSides = 6;
  if (typeof d.duelEnemyDiceMod !== 'number') d.duelEnemyDiceMod = -3;
  if (typeof d.medkitAmount !== 'number') d.medkitAmount = 4;
  if (d.over === undefined) d.over = false;
  if (d.started === undefined) d.started = false;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) { d.log.push(line); if (d.log.length > 300) d.log.shift(); }
function _playerDead(d) { return d.playerStamina <= 0; }
function _hordeCleared(d) { return d.enemyCount <= 0; }
function _duelEnemyDead(d) { return d.duelEnemyStamina <= 0; }

function _recordOutcome(d, outcome) { d.history.push({ mode: d.mode, outcome, ts: Date.now() }); }

function _checkEnd(d) {
  const enemyDown = d.mode === 'horde' ? _hordeCleared(d) : _duelEnemyDead(d);
  if (enemyDown) {
    d.over = true; d.winner = 'player';
    _appendLog(d, t('battlesim161.log.defeated', { trophy: SVG_TROPHY }));
    _recordOutcome(d, 'win');
    return true;
  }
  if (_playerDead(d)) {
    d.over = true; d.winner = 'enemy';
    _appendLog(d, t('battlesim161.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _hordeRound() {
  const d = _data();
  if (!d || d.over) return;
  d.started = true;
  const w = _weapon(d.weaponId);
  const n = d.weaponId === 'custom' ? d.diceN : w.dice;
  const sides = d.weaponId === 'custom' ? d.diceSides : w.sides;
  const mod = d.weaponId === 'custom' ? d.diceMod : w.mod;
  const roll = _rollWeapon(d, n, sides, mod);
  const kills = Math.min(roll, d.enemyCount);
  d.enemyCount -= kills;
  let msg = t('battlesim161.log.you_kill', { roll, kills, remaining: d.enemyCount });

  if (d.enemyCount > 0) {
    const dmg = d.enemyCount * d.retaliation;
    d.playerStamina = Math.max(0, d.playerStamina - dmg);
    msg += ' ' + t('battlesim161.log.retaliate', { n: d.enemyCount, dmg, stamina: d.playerStamina, staminaMax: d.playerStaminaMax });
  }

  _appendLog(d, msg);
  _checkEnd(d);
  saveState();
  _renderAll();
}

function _duelRound() {
  const d = _data();
  if (!d || d.over) return;
  d.started = true;
  const pRoll = _rollWeapon(d, d.duelPlayerDiceN, d.duelPlayerDiceSides, d.duelPlayerDiceMod);
  d.duelEnemyStamina = Math.max(0, d.duelEnemyStamina - pRoll);
  let msg = t('battlesim161.log.you_hit_duel', { roll: pRoll, stamina: d.duelEnemyStamina, staminaMax: d.duelEnemyStaminaMax });

  if (!_duelEnemyDead(d)) {
    const eRoll = _rollWeapon(d, d.duelEnemyDiceN, d.duelEnemyDiceSides, d.duelEnemyDiceMod);
    d.playerStamina = Math.max(0, d.playerStamina - eRoll);
    msg += ' ' + t('battlesim161.log.enemy_hit_duel', { roll: eRoll, stamina: d.playerStamina, staminaMax: d.playerStaminaMax });
  }

  _appendLog(d, msg);
  _checkEnd(d);
  saveState();
  _renderAll();
}

function _round() {
  const d = _data();
  if (!d) return;
  if (d.mode === 'horde') _hordeRound(); else _duelRound();
}

function _startBattle() {
  const d = _data();
  if (!d) return;
  d.over = false;
  d.winner = null;
  d.started = true;
  if (d.log.length) _appendLog(d, t('battlesim161.log.reset_sep'));
  _appendLog(d, d.mode === 'horde'
    ? t('battlesim161.log.start_horde', { n: d.enemyCount })
    : t('battlesim161.log.start_duel', { stamina: d.duelEnemyStamina }));
  saveState();
  _renderAll();
}

function _throwGrenade() {
  const d = _data();
  if (!d || d.mode !== 'horde' || d.over) return;
  const roll = _rollDice(2, 6, 1);
  const killed = Math.min(roll, d.enemyCount);
  d.enemyCount -= killed;
  d.started = true;
  _appendLog(d, t('battlesim161.log.grenade', { roll, killed, remaining: d.enemyCount }));
  _checkEnd(d);
  saveState();
  _renderAll();
}

function _useMedkit() {
  const d = _data();
  if (!d) return;
  const before = d.playerStamina;
  d.playerStamina = Math.min(d.playerStaminaMax, d.playerStamina + d.medkitAmount);
  _appendLog(d, t('battlesim161.log.medkit', { n: d.medkitAmount, before, stamina: d.playerStamina, staminaMax: d.playerStaminaMax }));
  saveState();
  _renderAll();
}

function _setMode(mode) {
  const d = _data();
  if (!d) return;
  d.mode = mode;
  saveState();
  _renderAll();
}

function _pickWeapon(id) {
  const d = _data();
  if (!d) return;
  d.weaponId = id;
  const w = _weapon(id);
  if (id !== 'custom') { d.diceN = w.dice; d.diceSides = w.sides; d.diceMod = w.mod; }
  saveState();
  _renderAll();
}

// ── Render ───────────────────────────────────────────────────────────────

function _renderStatus() {
  const d = _data();
  const el = document.getElementById('sim161-status');
  if (!d || !el) return;
  if (d.over) {
    if (d.winner === 'player') el.innerHTML = t('battlesim161.status.victory', { trophy: SVG_TROPHY });
    else el.innerHTML = t('battlesim161.status.fallen', { skull: SVG_SKULL });
  } else {
    el.innerHTML = '';
  }
  document.getElementById('sim161-round').disabled = d.over || !d.started;
}

function _weaponOptionsHtml(selectedId) {
  return WEAPONS.map(w => `<option value="${w.id}" ${w.id === selectedId ? 'selected' : ''}>${escapeHtml(t(w.nameKey))}</option>`).join('');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;
  const hordeEls = document.getElementById('sim161-horde-fields');
  const duelEls = document.getElementById('sim161-duel-fields');
  if (hordeEls) hordeEls.style.display = d.mode === 'horde' ? '' : 'none';
  if (duelEls) duelEls.style.display = d.mode === 'duel' ? '' : 'none';
  document.getElementById('sim161-mode').value = d.mode;
  document.getElementById('sim161-player-stamina').value = d.playerStamina;
  document.getElementById('sim161-player-stamina-max').value = d.playerStaminaMax;
  document.getElementById('sim161-medkit-amount').value = d.medkitAmount;

  document.getElementById('sim161-weapon-pick').innerHTML = _weaponOptionsHtml(d.weaponId);
  document.getElementById('sim161-dice-n').value = d.diceN;
  document.getElementById('sim161-dice-sides').value = d.diceSides;
  document.getElementById('sim161-dice-mod').value = d.diceMod;
  document.getElementById('sim161-custom-dice-row').style.display = d.weaponId === 'custom' ? '' : 'none';
  document.getElementById('sim161-enemy-count').value = d.enemyCount;
  document.getElementById('sim161-retaliation').value = d.retaliation;

  document.getElementById('sim161-duel-enemy-stamina').value = d.duelEnemyStamina;
  document.getElementById('sim161-duel-enemy-stamina-max').value = d.duelEnemyStaminaMax;
  document.getElementById('sim161-duel-player-mod').value = d.duelPlayerDiceMod;
  document.getElementById('sim161-duel-enemy-mod').value = d.duelEnemyDiceMod;
  _renderStatus();
}

function _renderHistory() {
  const d = _data();
  const sumEl = document.getElementById('sim161-history-summary');
  const listEl = document.getElementById('sim161-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim161.history.summary', { n: d.history.length });
  if (!d.history.length) { listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim161.history.empty')}</div>`; return; }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim161.history.won') : t('battlesim161.history.lost');
    const modeLabel = h.mode === 'duel' ? t('battlesim161.mode.duel') : t('battlesim161.mode.horde');
    const date = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row"><span>${icon} ${escapeHtml(modeLabel)} - ${result}</span><span class="bsim-history-meta">${date}</span></div>`;
  }).join('');
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim161-log');
  if (!el || !d) return;
  el.innerHTML = d.log.filter(Boolean).slice().reverse().join('<br>');
}

function _renderAll() { _renderInputs(); _renderLog(); _renderHistory(); }

export function renderSim161() {
  const overlay = document.getElementById('sim161-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim161(); return; }
  _renderAll();
}

function openSim161() {
  if (!_data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  _renderAll();
  document.getElementById('sim161-overlay').classList.add('active');
}

function closeSim161() { document.getElementById('sim161-overlay')?.classList.remove('active'); }

export function setSim161Visible(visible) {
  const btn = document.getElementById('sim161-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim161();
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

export function initSim161() {
  const overlay = document.createElement('div');
  overlay.id = 'sim161-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim161.ui.title')}</span>
        <button id="sim161-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim161.ui.mode')}</span>
              <select id="sim161-mode" class="inv-edit-input">
                <option value="horde">${t('battlesim161.mode.horde')}</option>
                <option value="duel">${t('battlesim161.mode.duel')}</option>
              </select>
            </div>
            <div class="bsim-side-title">${t('battlesim161.ui.you')}</div>
            ${_numField(t('battlesim161.ui.stamina'), 'sim161-player-stamina')}
            ${_numField(t('battlesim161.ui.stamina_max'), 'sim161-player-stamina-max')}
            ${_numField(t('battlesim161.ui.medkit_amount'), 'sim161-medkit-amount')}
            <div class="inv-modal-ftr">
              <button id="sim161-medkit" class="inv-add-btn">${t('battlesim161.btn.medkit')}</button>
            </div>
          </div>
          <div id="sim161-horde-fields" class="bsim-side">
            <div class="bsim-side-title">${t('battlesim161.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim161.ui.pick')}</span>
              <select id="sim161-weapon-pick" class="inv-edit-input"></select>
            </div>
            <div id="sim161-custom-dice-row">
              ${_numField(t('battlesim161.ui.dice_n'), 'sim161-dice-n')}
              ${_numField(t('battlesim161.ui.dice_sides'), 'sim161-dice-sides')}
              ${_numField(t('battlesim161.ui.dice_mod'), 'sim161-dice-mod')}
            </div>
            ${_numField(t('battlesim161.ui.enemy_count'), 'sim161-enemy-count')}
            ${_numField(t('battlesim161.ui.retaliation'), 'sim161-retaliation')}
            <div class="inv-modal-ftr">
              <button id="sim161-grenade" class="inv-add-btn">${t('battlesim161.btn.grenade')}</button>
            </div>
          </div>
          <div id="sim161-duel-fields" class="bsim-side">
            <div class="bsim-side-title">${t('battlesim161.ui.duel_enemy')}</div>
            ${_numField(t('battlesim161.ui.stamina'), 'sim161-duel-enemy-stamina')}
            ${_numField(t('battlesim161.ui.stamina_max'), 'sim161-duel-enemy-stamina-max')}
            ${_numField(t('battlesim161.ui.your_mod'), 'sim161-duel-player-mod')}
            ${_numField(t('battlesim161.ui.enemy_mod'), 'sim161-duel-enemy-mod')}
          </div>
          <div id="sim161-status" class="bsim-status"></div>
          <div class="inv-modal-ftr bsim-action-grid">
            <button id="sim161-round" class="inv-add-btn bsim-action-primary">${t('battlesim161.btn.round')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim161-start" class="inv-add-btn">${t('battlesim161.btn.start')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim161-history-summary">${t('battlesim161.history.summary', { n: 0 })}</summary>
            <div id="sim161-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim161-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id = 'sim161-btn';
  btn.innerHTML = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim161);
  document.getElementById('sim161-close').addEventListener('click', closeSim161);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim161(); });
  registerPanelShortcut('KeyS', {
    getButton: () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim161-overlay'),
    open: openSim161,
    close: closeSim161,
  });

  document.getElementById('sim161-mode').addEventListener('change', e => _setMode(e.target.value));
  document.getElementById('sim161-weapon-pick').addEventListener('change', e => _pickWeapon(e.target.value));
  document.getElementById('sim161-start').addEventListener('click', _startBattle);
  document.getElementById('sim161-round').addEventListener('click', _round);
  document.getElementById('sim161-grenade').addEventListener('click', _throwGrenade);
  document.getElementById('sim161-medkit').addEventListener('click', _useMedkit);

  const fieldMap = {
    'sim161-player-stamina': (d, v) => { d.playerStamina = v; },
    'sim161-player-stamina-max': (d, v) => { d.playerStaminaMax = v; },
    'sim161-medkit-amount': (d, v) => { d.medkitAmount = v; },
    'sim161-dice-n': (d, v) => { d.diceN = v; },
    'sim161-dice-sides': (d, v) => { d.diceSides = v; },
    'sim161-dice-mod': (d, v) => { d.diceMod = v; },
    'sim161-enemy-count': (d, v) => { d.enemyCount = v; },
    'sim161-retaliation': (d, v) => { d.retaliation = v; },
    'sim161-duel-enemy-stamina': (d, v) => { d.duelEnemyStamina = v; },
    'sim161-duel-enemy-stamina-max': (d, v) => { d.duelEnemyStaminaMax = v; },
    'sim161-duel-player-mod': (d, v) => { d.duelPlayerDiceMod = v; },
    'sim161-duel-enemy-mod': (d, v) => { d.duelEnemyDiceMod = v; },
  };
  // Signed fields (dice modifiers can be negative, e.g. barehanded 1d6-3) get a
  // wider clamp than the plain non-negative qty fields the shared template uses.
  const signedFields = new Set(['sim161-dice-mod', 'sim161-duel-player-mod', 'sim161-duel-enemy-mod']);

  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d) return;
      const id = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const min = signedFields.has(id) ? -99 : 0;
      const val = Math.max(min, (parseInt(input.value, 10) || 0) + delta);
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
      const min = signedFields.has(input.id) ? -99 : 0;
      const val = Math.max(min, parseInt(input.value, 10) || 0);
      input.value = val;
      if (fieldMap[input.id]) fieldMap[input.id](d, val);
      saveState();
      _renderStatus();
    });
  });
}
