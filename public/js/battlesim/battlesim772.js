// ── Battle Simulator (Бойците на Кунг-Фу, book 772) ─────────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 772 only) by the caller in boot.js via
// setSim772Visible().
// To remove: delete this file, remove its import line and initSim772()/
// setSim772Visible() calls from boot.js, remove 'sim772' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim772-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim772-btn selectors in
// battlesim.css.
//
// Unlike a single-protagonist sim, this book gives the reader 17
// point-based stats in a paper "дневник" (journal) that end up wildly
// different every playthrough depending on 100+ branching training
// choices during the story - there is no canonical starting build to
// hardcode. So this sim lets the player type in their OWN current stat
// values (read off their journal) once, then pick one of the book's named
// opponents (Ян Лучан excluded - every encounter with him is a scripted
// instant win/loss narrative branch, never a real stat-based fight) and
// run a round-based, 1d6-driven duel exactly as documented on the book's
// own "Правила за бой" rules page (see book_frontmatter.rules_text for
// book_id=772):
//
//   Player actions each round (player's free choice):
//     - "Удар с крак"  (leg attack):      1d6 + Удар с крак + Мощ на ударите
//     - "Удар с ръка"  (hand attack):     1d6 + Удар с ръка + Мощ на ударите
//     - "Комбинирана атака" (combined):   1d6 + Удар с крак + Удар с ръка + Мощ на ударите
//     - "Пасивна защита" (passive def.):  1d6 + Защита + Спокойствие + Бойна тактика
//         - cannot win the round outright, once per fight only; if the
//           total beats the attacker's roll, subtract 2 from every one of
//           the attacker's stats except "Отклоняване на получен удар"
//     - "Агресивна защита" (aggr. def.):  1d6 + Защита + Рефлекс + Бързина
//         - CAN win the round if it beats the attacker's total
//   Enemy has 3 attack stats (leg/hand/combined) and 3 matching defense
//   stats, compared against the player's matching action. Enemy AI action
//   sequence (attack vs defend, and which attack type) is opponent-
//   specific - see ROSTER's `pattern` function below, one per enemy,
//   implementing the documented behaviour rather than one generic AI.
//   "Отклоняване на получен удар" - when the PLAYER lands a hit on an
//   enemy that has specific numbers listed (not "не"), roll 1d6 again;
//   landing on one of those numbers negates the player's round win.
//   Higher total wins the round; ties are a draw (nobody wins).
//   Win 2 consecutive rounds OR 3 non-consecutive rounds -> victory.
//   Lose 2 consecutive OR 3 non-consecutive -> defeat.
//
// All state lives in pt.sim772, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Player stat keys (typed in by the reader from their own journal).
// Labels are i18n keys, resolved via t() at render time.
const PLAYER_STAT_KEYS = [
  ['leg',      'battlesim772.stat.leg'],
  ['hand',     'battlesim772.stat.hand'],
  ['power',    'battlesim772.stat.power'],
  ['defense',  'battlesim772.stat.defense'],
  ['calm',     'battlesim772.stat.calm'],
  ['tactics',  'battlesim772.stat.tactics'],
  ['reflex',   'battlesim772.stat.reflex'],
  ['speed',    'battlesim772.stat.speed'],
];

// Enemy AI: given round index (0-based) and history of own past actions,
// return the action to take this round: one of
// 'leg' | 'hand' | 'combined' | 'passive' | 'aggressive'.
// (Enemies never use "passive"/"aggressive" defense distinction in the
// book text - they just "defend"; we resolve enemy defense as aggressive
// defense, since the book never grants NPCs the passive-defense stat
// drain effect - only the player has access to that special rule.)
const ROSTER = [
  {
    id: 'li_xiao', name: 'Ли Сяо',
    defLeg: 19, atkLeg: 22, defHand: 17, atkHand: 22, defComb: 24, atkComb: 24,
    dodge: null,
    pattern(i) {
      const cycle = ['combined', 'combined', 'leg', 'hand'];
      return { type: 'attack', move: cycle[i % cycle.length] };
    },
  },
  {
    id: 'tun_tsin', name: 'Тун Цзин',
    defLeg: null, atkLeg: null, defHand: null, atkHand: 24, defComb: null, atkComb: 25,
    dodge: [4],
    pattern(i) {
      const cycle = ['hand', 'combined'];
      return { type: 'attack', move: cycle[i % cycle.length] };
    },
  },
  {
    id: 'dupont_early', name: 'Жак Дюпон, ранна среща',
    defLeg: 17, atkLeg: 23, defHand: 16, atkHand: null, defComb: 22, atkComb: null,
    dodge: null,
    pattern() {
      return { type: 'attack', move: 'leg' };
    },
  },
  {
    id: 'dupont_tournament', name: 'Жак Дюпон, турнир',
    defLeg: 25, atkLeg: 29, defHand: 23, atkHand: null, defComb: 31, atkComb: null,
    dodge: null,
    pattern(i) {
      return i === 0 ? { type: 'defend', move: 'aggressive' } : { type: 'attack', move: 'leg' };
    },
  },
  {
    id: 'steve_train', name: 'Стив Трейн',
    defLeg: null, atkLeg: null, defHand: 30, atkHand: 41, defComb: 41, atkComb: 39,
    dodge: null,
    pattern(i) {
      // First attack is hands (i=0), then alternates hand/combined.
      return { type: 'attack', move: i % 2 === 0 ? 'hand' : 'combined' };
    },
  },
  {
    id: 'lin_bao_tournament', name: 'Лин Бао, турнир',
    defLeg: 33, atkLeg: 38, defHand: 31, atkHand: 40, defComb: 44, atkComb: 42,
    dodge: [2, 5],
    pattern(i) {
      const cycle = ['leg', 'hand', 'combined'];
      return { type: 'attack', move: cycle[i % cycle.length] };
    },
  },
  {
    id: 'lin_bao_rescue', name: 'Лин Бао, спасяване',
    defLeg: 31, atkLeg: null, defHand: 30, atkHand: 37, defComb: null, atkComb: null,
    dodge: [2, 5],
    pattern(i) {
      return i < 2 ? { type: 'attack', move: 'hand' } : { type: 'defend', move: 'aggressive' };
    },
  },
  {
    id: 'mac_stone', name: 'Мак Стоун',
    defLeg: 34, atkLeg: 43, defHand: 34, atkHand: 43, defComb: 46, atkComb: 43,
    dodge: [1, 3, 5],
    pattern(i) {
      if (i === 0) return { type: 'defend', move: 'aggressive' };
      const moves = ['leg', 'hand', 'combined'];
      return { type: 'attack', move: moves[Math.floor(Math.random() * moves.length)] };
    },
  },
  {
    id: 'arena_guards', name: 'Охрана на арената',
    defLeg: 28, atkLeg: null, defHand: 26, atkHand: null, defComb: 36, atkComb: null,
    dodge: null,
    pattern() {
      return { type: 'defend', move: 'passive' };
    },
  },
];

function _enemy(id) { return ROSTER.find(e => e.id === id) || ROSTER[0]; }

function _defaultPlayerStats() {
  const s = {};
  PLAYER_STAT_KEYS.forEach(([k]) => { s[k] = 0; });
  return s;
}

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim772) {
    pt.sim772 = {
      enemyId: 'li_xiao',
      player: _defaultPlayerStats(),
      started: false,
      roundIdx: 0,          // rounds fought so far (for enemy pattern index)
      playerPassiveUsed: false,
      playerResults: [],    // array of 'win' | 'loss' | 'draw', most recent last
      enemyResults: [],
      log: [],
      history: [],
    };
  }
  const d = pt.sim772;
  if (!d.enemyId) d.enemyId = 'li_xiao';
  if (!d.player) d.player = _defaultPlayerStats();
  PLAYER_STAT_KEYS.forEach(([k]) => { if (typeof d.player[k] !== 'number') d.player[k] = 0; });
  if (d.started === undefined) d.started = false;
  if (typeof d.roundIdx !== 'number') d.roundIdx = 0;
  if (d.playerPassiveUsed === undefined) d.playerPassiveUsed = false;
  if (!d.playerResults) d.playerResults = [];
  if (!d.enemyResults) d.enemyResults = [];
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return _enemy(d.enemyId).name; }

// Count wins: true if 2 consecutive wins, or 3 total wins (non-consecutive
// counts fine since 2 consecutive is already covered separately).
function _hasWon(results) {
  if (results.length >= 2 && results[results.length - 1] === 'win' && results[results.length - 2] === 'win') return true;
  return results.filter(r => r === 'win').length >= 3;
}

function _playerWon(d) { return _hasWon(d.playerResults); }
function _playerLost(d) { return _hasWon(d.enemyResults); }
function _battleOver(d) { return _playerWon(d) || _playerLost(d); }

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
}

// ── Combat ───────────────────────────────────────────────────────────────

function _playerAttackTotal(d, move) {
  const p = d.player;
  const roll = _roll1d6();
  let total;
  if (move === 'leg')      total = roll + p.leg + p.power;
  else if (move === 'hand') total = roll + p.hand + p.power;
  else                      total = roll + p.leg + p.hand + p.power; // combined
  return { roll, total };
}

function _playerDefenseTotal(d, style) {
  const p = d.player;
  const roll = _roll1d6();
  const total = style === 'passive'
    ? roll + p.defense + p.calm + p.tactics
    : roll + p.defense + p.reflex + p.speed;
  return { roll, total };
}

function _enemyAttackTotal(e, move) {
  const roll = _roll1d6();
  const stat = move === 'leg' ? e.atkLeg : move === 'hand' ? e.atkHand : e.atkComb;
  return { roll, total: roll + (stat || 0) };
}

// Enemy always resolves defense as aggressive-style (single relevant
// defense stat for the matching attack type); the book never gives NPCs
// the passive-defense stat-drain rule, only the player has it.
function _enemyDefenseTotal(e, move) {
  const roll = _roll1d6();
  const stat = move === 'leg' ? e.defLeg : move === 'hand' ? e.defHand : e.defComb;
  return { roll, total: roll + (stat || 0) };
}

function _moveLabelKey(move) {
  return { leg: 'battlesim772.move.leg', hand: 'battlesim772.move.hand', combined: 'battlesim772.move.combined' }[move];
}

function _applyPassivePenalty(d, e) {
  // Subtract 2 from every attacker (enemy) stat except dodge.
  ['defLeg', 'atkLeg', 'defHand', 'atkHand', 'defComb', 'atkComb'].forEach(k => {
    if (typeof e[k] === 'number') e[k] = Math.max(0, e[k] - 2);
  });
}

function _checkDodge(d, e) {
  if (!e.dodge) return false;
  const roll = _roll1d6();
  const dodged = e.dodge.includes(roll);
  _appendLog(d, t('battlesim772.log.dodge_roll', { name: _enemyName(d), roll, dodged: dodged ? t('battlesim772.log.dodge_yes') : t('battlesim772.log.dodge_no') }));
  return dodged;
}

function _runRound(playerAction) {
  const d = _data();
  if (!d || _battleOver(d)) return;
  if (playerAction.move === 'passive' && d.playerPassiveUsed) return;
  if (playerAction.move === 'passive') d.playerPassiveUsed = true;
  const staticEnemy = _enemy(d.enemyId);
  // Preserve any passive-penalty mutation across rounds within one fight
  // by storing a live copy on d once the fight starts (stats used for
  // totals come from this copy so passive-defense penalties persist).
  const liveEnemy = d._liveEnemy || (d._liveEnemy = { ...staticEnemy, pattern: undefined });

  const enemyAction = staticEnemy.pattern(d.roundIdx);

  let playerOutcome = null; // 'win' | 'loss' | 'draw'
  let enemyOutcome = null;

  const isPlayerAttack = playerAction.type === 'attack';
  const isEnemyAttack  = enemyAction.type === 'attack';

  if (isPlayerAttack && isEnemyAttack) {
    // Both attack - book rule 6: round is won by whoever has the higher
    // attack score, regardless of move type (no lane matching needed).
    const pa = _playerAttackTotal(d, playerAction.move);
    const ea = _enemyAttackTotal(liveEnemy, enemyAction.move);
    _appendLog(d, t('battlesim772.log.both_attack', {
      pmove: t(_moveLabelKey(playerAction.move)), proll: pa.roll, ptotal: pa.total,
      ename: _enemyName(d), emove: t(_moveLabelKey(enemyAction.move)), eroll: ea.roll, etotal: ea.total,
    }));
    if (pa.total > ea.total) {
      let negated = false;
      if (liveEnemy.dodge) negated = _checkDodge(d, liveEnemy);
      if (negated) { playerOutcome = 'draw'; enemyOutcome = 'draw'; }
      else { playerOutcome = 'win'; enemyOutcome = 'loss'; }
    } else if (ea.total > pa.total) {
      playerOutcome = 'loss'; enemyOutcome = 'win';
    } else {
      playerOutcome = 'draw'; enemyOutcome = 'draw';
    }
  } else if (isPlayerAttack && !isEnemyAttack) {
    // Player attacks, enemy defends.
    const pa = _playerAttackTotal(d, playerAction.move);
    const defMove = playerAction.move; // matching defense lane
    const ed = _enemyDefenseTotal(liveEnemy, defMove);
    _appendLog(d, t('battlesim772.log.player_attacks', {
      pmove: t(_moveLabelKey(playerAction.move)), proll: pa.roll, ptotal: pa.total,
      ename: _enemyName(d), eroll: ed.roll, etotal: ed.total,
    }));
    if (pa.total > ed.total) {
      let negated = false;
      if (liveEnemy.dodge) negated = _checkDodge(d, liveEnemy);
      if (negated) { playerOutcome = 'draw'; enemyOutcome = 'draw'; }
      else { playerOutcome = 'win'; enemyOutcome = 'loss'; }
    } else if (ed.total > pa.total) {
      playerOutcome = 'loss'; enemyOutcome = 'win';
    } else {
      playerOutcome = 'draw'; enemyOutcome = 'draw';
    }
  } else if (!isPlayerAttack && isEnemyAttack) {
    // Player defends, enemy attacks.
    const defMove = playerAction.move; // 'passive' | 'aggressive'
    const pd = _playerDefenseTotal(d, defMove);
    const ea = _enemyAttackTotal(liveEnemy, enemyAction.move);
    _appendLog(d, t('battlesim772.log.player_defends', {
      style: t(defMove === 'passive' ? 'battlesim772.move.passive' : 'battlesim772.move.aggressive'),
      proll: pd.roll, ptotal: pd.total,
      ename: _enemyName(d), emove: t(_moveLabelKey(enemyAction.move)), eroll: ea.roll, etotal: ea.total,
    }));
    if (defMove === 'aggressive') {
      if (pd.total > ea.total) {
        let negated = false;
        if (liveEnemy.dodge) negated = _checkDodge(d, liveEnemy);
        if (negated) { playerOutcome = 'draw'; enemyOutcome = 'draw'; }
        else { playerOutcome = 'win'; enemyOutcome = 'loss'; }
      } else if (ea.total > pd.total) { playerOutcome = 'loss'; enemyOutcome = 'win'; }
      else { playerOutcome = 'draw'; enemyOutcome = 'draw'; }
    } else {
      // Passive: never wins the round outright, but if it beats the
      // attack, the attacker (enemy) loses 2 from every stat except dodge.
      if (pd.total > ea.total) {
        _applyPassivePenalty(d, liveEnemy);
        _appendLog(d, t('battlesim772.log.passive_success', { ename: _enemyName(d) }));
        playerOutcome = 'draw'; enemyOutcome = 'draw';
      } else if (ea.total > pd.total) {
        playerOutcome = 'loss'; enemyOutcome = 'win';
      } else {
        playerOutcome = 'draw'; enemyOutcome = 'draw';
      }
    }
  } else {
    // Both defend - nobody wins.
    _appendLog(d, t('battlesim772.log.both_defend'));
    playerOutcome = 'draw'; enemyOutcome = 'draw';
  }

  if (playerOutcome === 'win')       _appendLog(d, t('battlesim772.log.round_win'));
  else if (playerOutcome === 'loss') _appendLog(d, t('battlesim772.log.round_loss'));
  else                                _appendLog(d, t('battlesim772.log.round_draw'));

  d.playerResults.push(playerOutcome);
  d.enemyResults.push(enemyOutcome);
  d.roundIdx += 1;
  // Persist any live-enemy stat mutations (passive-defense penalty) back
  // onto the plain object stored in state.
  d._liveEnemy = { ...liveEnemy };

  if (_playerWon(d)) {
    _appendLog(d, t('battlesim772.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyName(d) }));
    _recordOutcome(d, 'win');
  } else if (_playerLost(d)) {
    _appendLog(d, t('battlesim772.log.fallen', { skull: SVG_SKULL, enemy: _enemyName(d) }));
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.started = false;
  d.roundIdx = 0;
  d.playerPassiveUsed = false;
  d.playerResults = [];
  d.enemyResults = [];
  d._liveEnemy = null;
  if (d.log.length) _appendLog(d, t('battlesim772.log.reset_sep'));
  _appendLog(d, t('battlesim772.log.reset', { enemy: _enemyName(d) }));
  saveState();
  _renderAll();
}

function _pickEnemy(id) {
  const d = _data();
  if (!d) return;
  d.enemyId = id;
  _resetBattle();
}

// ── Render ───────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim772-status');
  if (!d || !el) return;
  if (_playerLost(d))      el.innerHTML = t('battlesim772.status.fallen', { skull: SVG_SKULL });
  else if (_playerWon(d))  el.innerHTML = t('battlesim772.status.victory', { trophy: SVG_TROPHY });
  else                     el.innerHTML = '';
  const over = _battleOver(d);
  ['sim772-atk-leg', 'sim772-atk-hand', 'sim772-atk-combined', 'sim772-def-passive', 'sim772-def-aggressive'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    let disabled = over;
    if (id === 'sim772-def-passive' && d.playerPassiveUsed) disabled = true;
    btn.disabled = disabled;
  });
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim772-history-summary');
  const listEl = document.getElementById('sim772-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim772.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim772.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim772.history.won') : t('battlesim772.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${t('battlesim772.history.you')} ${t('battlesim772.history.vs')} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim772-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _enemyOptions(selectedId) {
  return ROSTER.map(e => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim772-enemy-pick').innerHTML = _enemyOptions(d.enemyId);

  PLAYER_STAT_KEYS.forEach(([k]) => {
    const el = document.getElementById(`sim772-player-${k}`);
    if (el) el.value = d.player[k];
  });

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim772() {
  const overlay = document.getElementById('sim772-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim772(); return; }
  _renderAll();
}

function openSim772() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim772-overlay').classList.add('active');
}

function closeSim772() {
  document.getElementById('sim772-overlay')?.classList.remove('active');
}

export function setSim772Visible(visible) {
  const btn = document.getElementById('sim772-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim772();
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

export function initSim772() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim772-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim772.ui.title')}</span>
        <button id="sim772-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim772.ui.you')}</div>
            ${PLAYER_STAT_KEYS.map(([k, labelKey]) => _numField(t(labelKey), `sim772-player-${k}`)).join('')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim772.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim772.ui.pick')}</span>
              <select id="sim772-enemy-pick" class="inv-edit-input"></select>
            </div>
          </div>
          <div id="sim772-status" class="bsim-status"></div>
          <div class="inv-modal-ftr bsim-action-grid">
            <button id="sim772-atk-leg"        class="inv-add-btn bsim-action-primary">${t('battlesim772.btn.atk_leg')}</button>
            <button id="sim772-atk-hand"       class="inv-add-btn bsim-action-primary">${t('battlesim772.btn.atk_hand')}</button>
            <button id="sim772-atk-combined"   class="inv-add-btn bsim-action-primary">${t('battlesim772.btn.atk_combined')}</button>
            <button id="sim772-def-passive"    class="inv-add-btn">${t('battlesim772.btn.def_passive')}</button>
            <button id="sim772-def-aggressive" class="inv-add-btn">${t('battlesim772.btn.def_aggressive')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim772-reset" class="inv-add-btn">${t('battlesim772.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim772-history-summary">${t('battlesim772.history.summary', { n: 0 })}</summary>
            <div id="sim772-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim772-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim772-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim772);
  document.getElementById('sim772-close').addEventListener('click', closeSim772);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim772(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim772-overlay'),
    open:  openSim772,
    close: closeSim772,
  });

  document.getElementById('sim772-enemy-pick').addEventListener('change', e => _pickEnemy(e.target.value));
  document.getElementById('sim772-atk-leg').addEventListener('click', () => _runRound({ type: 'attack', move: 'leg' }));
  document.getElementById('sim772-atk-hand').addEventListener('click', () => _runRound({ type: 'attack', move: 'hand' }));
  document.getElementById('sim772-atk-combined').addEventListener('click', () => _runRound({ type: 'attack', move: 'combined' }));
  document.getElementById('sim772-def-passive').addEventListener('click', () => _runRound({ type: 'defend', move: 'passive' }));
  document.getElementById('sim772-def-aggressive').addEventListener('click', () => _runRound({ type: 'defend', move: 'aggressive' }));
  document.getElementById('sim772-reset').addEventListener('click', _resetBattle);

  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d) return;
      const id    = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const val   = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
      input.value = val;
      const key = id.replace('sim772-player-', '');
      if (Object.prototype.hasOwnProperty.call(d.player, key)) d.player[key] = val;
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
      const key = input.id.replace('sim772-player-', '');
      if (Object.prototype.hasOwnProperty.call(d.player, key)) d.player[key] = val;
      saveState();
      _renderStatus();
    });
  });
}
