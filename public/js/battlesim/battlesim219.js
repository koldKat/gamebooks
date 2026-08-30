// ── Battle Simulator (Masks of Mayhem, book 219) ─────────────────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 219 only) by the caller in boot.js via
// setSim219Visible().
// To remove: delete this file, remove its import line and initSim219()/
// setSim219Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with every other battlesimN.js, so only remove it if all of them are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system, same core numbers,
// Test Your Luck table, Provisions, and single-dose potion-of-three-choices
// setup as books 201/202/203 - confirmed against this book's own printed
// "How to Fight the Creatures of Khul" and "Equipment and Potions" rules
// pages (SKILL 1d6+6, STAMINA 2d6+12, LUCK 1d6+6; opposed 2d6+SKILL roll,
// ties = no effect, loser -2 STAMINA; Test Your Luck ±1/±2 STAMINA, costs
// 1 LUCK always; 10 Provisions, +4 STAMINA each, not mid-battle; choose
// exactly one of three single-dose potions - Skill/Strength/Fortune).
//
// attackModifier/enemyWoundDamage/pairedFight/sideEnemy are reused exactly
// as prior sims - they cover every generic "-N SKILL this fight" penalty and
// every "two attackers, choose one target, untargeted one can wound but
// can't be wounded that round" case (the paired Pygmy Orcs at §129/§220,
// paired Spriggans at §171, paired Blackhearts at §254, paired Tribesmen at
// §282/§318, paired Skeletons at §386).
//
// One genuinely new, generic field not present in earlier sims:
// - playerWoundDamage: the STAMINA the player deals to the enemy on a win,
//   defaulting to 2 (the book's standard) but editable per-fight. Needed
//   because three fights deal non-standard win damage: the Shadow Monster
//   (§55, 1 STAMINA per hit), the Hellfire Spirit (§93/§281, 1 STAMINA per
//   hit, 2 if using magical protection), and Morgana (§295, 1 STAMINA per
//   hit, 2 if a lucky Test Your Luck roll). Symmetric to the existing
//   enemyWoundDamage field, and reused by _testLuck()'s lucky-hit bonus too
//   so Morgana's own Luck-scaled damage can be approximated by setting this
//   field to 1 before the fight.
//
// The five-tentacle sequences (§207, §330, §379) and the two-Mordida fight
// (§375, which alternates attackers rather than striking simultaneously)
// are not modeled as special multi-enemy mechanics - they're fought as a
// sequence of ordinary single-target fights, resetting/re-picking the next
// enemy from the dropdown after each one falls, same as any other multi-
// enemy chain elsewhere in the app.
//
// Deliberately NOT modeled, same precedent as every other sim in this app:
// one-off narrative full-restores (the fountain at §308 letting you restore
// SKILL, STAMINA or LUCK to Initial), the Chimera's always-wounds-every-
// round-even-on-a-win effect (§145 - apply that STAMINA loss by hand with
// the stat stepper), and the Sabre-toothed Tiger's "if not defeated within
// four rounds, turn to 348" branch (§371 - a narrative check against the
// round counter already visible in the log, not a combat-mechanic change).
// The Cloak of Temporary Invisibility and Horn of Hever are one-time escape/
// avoidance items, not combat modifiers, and are likewise left to manual
// play rather than sim toggles.
//
// All state lives in pt.sim219, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Choose exactly one bottle. Each bottle contains one measure, single-use.
const POTIONS = [
  ['skill',    'battlesim219.potion.skill'],
  ['strength', 'battlesim219.potion.strength'],
  ['fortune',  'battlesim219.potion.fortune'],
];

const MAX_PROVISIONS = 10;
const PROVISIONS_HEAL = 4;
const SIDE_WOUND_DMG = 2;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim219) {
    pt.sim219 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        potionKey: 'skill', potionUsesLeft: 1,
        provisionsLeft: MAX_PROVISIONS,
        attackModifier: 0,
        enemyWoundDamage: 2,
        playerWoundDamage: 2,
        enemyAutoWinFirstRound: false,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      pairedFight: false,
      sideEnemy: { name: '', skill: 0, staminaMax: 0 },
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim219;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.potionKey === undefined) d.player.potionKey = 'skill';
  if (d.player.potionUsesLeft === undefined) d.player.potionUsesLeft = 1;
  if (d.player.provisionsLeft === undefined) d.player.provisionsLeft = MAX_PROVISIONS;
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.playerWoundDamage === undefined) d.player.playerWoundDamage = 2;
  if (d.player.enemyAutoWinFirstRound === undefined) d.player.enemyAutoWinFirstRound = false;
  if (d.pairedFight === undefined) d.pairedFight = false;
  if (!d.sideEnemy) d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
  return d;
}

function _notReady(d) { return !d.rolled; }

function _roll2d6() { return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }
function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }
function _sideEnemyNameSafe(d) { return escapeHtml(d.sideEnemy.name.trim() || 'the second attacker'); }

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.playerWoundDamage = 2;
  d.player.enemyAutoWinFirstRound = false;
  d.pairedFight = false;
  d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
}

// Uncapped (was previously trimmed to the last 100) - the admin dashboard
// aggregates battle counts app-wide from this array, so per-user history needs
// to be a true lifetime total, not a rolling window.
function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerStamina: d.player.stamina, playerStaminaMax: d.player.staminaInitial,
    ts: Date.now(),
  });
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _runRound() {
  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  const isFirstRound = d.roundsThisBattle === 0;
  d.roundsThisBattle++;

  const enemyWoundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const playerWoundDmg = Math.max(1, d.player.playerWoundDamage || 2);

  let playerWins = false, tie = false;
  if (isFirstRound && d.player.enemyAutoWinFirstRound) {
    playerWins = false;
    _appendLog(d, t('battlesim219.log.enemy_firststrike', { enemy: _enemyNameSafe(d) }));
  } else {
    const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const enemyAS  = _roll2d6() + d.enemy.skill;
    _appendLog(d, t('battlesim219.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
    if (playerAS === enemyAS) tie = true;
    else playerWins = playerAS > enemyAS;
  }

  if (tie) {
    _appendLog(d, t('battlesim219.log.both_avoided'));
  } else if (playerWins) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - playerWoundDmg);
    _appendLog(d, t('battlesim219.log.you_wound', { enemy: _enemyNameSafe(d), n: playerWoundDmg, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - enemyWoundDmg);
    _appendLog(d, t('battlesim219.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: enemyWoundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Paired fight: a second, independent exchange with its own fresh player
  // roll every round - covers the paired Pygmy Orcs/Spriggans/Blackhearts/
  // Tribesmen/Skeletons. The side attacker is never wounded through this
  // path, matching the literal "untargeted one can wound but cannot be
  // wounded that round" rule.
  if (d.pairedFight && d.sideEnemy.staminaMax > 0 && d.player.stamina > 0) {
    const sidePlayerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    _appendLog(d, t('battlesim219.log.side_round', { enemy: _sideEnemyNameSafe(d), playerAS: sidePlayerAS, enemyAS: sideAS }));
    if (sideAS > sidePlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim219.log.side_wounds', { enemy: _sideEnemyNameSafe(d), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side-hit' });
    } else {
      _appendLog(d, t('battlesim219.log.side_fend', { enemy: _sideEnemyNameSafe(d) }));
    }
  }

  if (d.enemy.stamina <= 0) {
    _appendLog(d, t('battlesim219.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim219.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome.
// Same Lucky/Unlucky table as every other FF sim in this app.
function _testLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    const extra = Math.max(1, d.player.playerWoundDamage || 2);
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - extra);
      _appendLog(d, t('battlesim219.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim219.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= 0) { _appendLog(d, t('battlesim219.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim219.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim219.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim219.log.fallen', { skull: SVG_SKULL }));
      _recordOutcome(d, 'loss');
      d.pendingLuckQueue = [];
    }
  }
  saveState();
  _renderAll();
}

function _skipLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length) return;
  d.pendingLuckQueue.shift();
  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.stamina = d.enemy.staminaMax;
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim219.log.reset_sep'));
  _appendLog(d, t('battlesim219.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Provisions / Potions ────────────────────────────────────────────────────

function _eatProvisions() {
  const d = _data();
  if (!d || _notReady(d)) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim219.alert.provisions_midfight'));
    return;
  }
  if (d.player.provisionsLeft <= 0) return;
  if (d.player.stamina >= d.player.staminaInitial) {
    showAlert(t('battlesim219.alert.stamina_full'));
    return;
  }
  d.player.provisionsLeft--;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + PROVISIONS_HEAL);
  _appendLog(d, t('battlesim219.log.provisions', { before, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  saveState();
  _renderAll();
}

function _usePotion() {
  const d = _data();
  if (!d || _notReady(d) || d.player.potionUsesLeft <= 0) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim219.alert.potion_midfight'));
    return;
  }
  d.player.potionUsesLeft--;
  if (d.player.potionKey === 'skill') {
    d.player.skill = d.player.skillInitial;
    _appendLog(d, t('battlesim219.log.potion_skill', { n: d.player.skillInitial }));
  } else if (d.player.potionKey === 'strength') {
    d.player.stamina = d.player.staminaInitial;
    _appendLog(d, t('battlesim219.log.potion_strength', { n: d.player.staminaInitial }));
  } else {
    d.player.luckInitial += 1;
    d.player.luck = d.player.luckInitial;
    _appendLog(d, t('battlesim219.log.potion_fortune', { n: d.player.luckInitial }));
  }
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim219-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim219.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim219.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = t('battlesim219.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim219-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim219-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim219-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim219-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim219-history-summary');
  const listEl = document.getElementById('sim219-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim219.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim219.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim219.history.won') : t('battlesim219.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim219-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim219-player-skill').value      = d.player.skill;
  document.getElementById('sim219-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim219-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim219-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim219-player-luck').value       = d.player.luck;
  document.getElementById('sim219-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim219-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim219-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim219.btn.rolled') : t('battlesim219.btn.roll');

  const potionSel = document.getElementById('sim219-potion');
  potionSel.value = d.player.potionKey;
  potionSel.disabled = d.rolled;
  document.getElementById('sim219-potion-uses').textContent = t('battlesim219.ui.uses_left', { n: d.player.potionUsesLeft });
  document.getElementById('sim219-potion-use').disabled =
    _notReady(d) || d.player.potionUsesLeft <= 0 ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);

  document.getElementById('sim219-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim219-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim219-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim219-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim219-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim219-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim219-player-wounddmg').value  = d.player.playerWoundDamage;
  document.getElementById('sim219-enemy-firstwin').checked = d.player.enemyAutoWinFirstRound;

  document.getElementById('sim219-paired').checked = d.pairedFight;
  document.getElementById('sim219-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim219-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim219-side-staminamax').value = d.sideEnemy.staminaMax;
  document.getElementById('sim219-side-fields').style.display = d.pairedFight ? '' : 'none';

  const pendingEl = document.getElementById('sim219-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim219() {
  const overlay = document.getElementById('sim219-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim219(); return; }
  _renderAll();
}

function openSim219() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim219-overlay').classList.add('active');
}

function closeSim219() {
  document.getElementById('sim219-overlay')?.classList.remove('active');
}

export function setSim219Visible(visible) {
  const btn = document.getElementById('sim219-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim219();
}

// ── Enemy autocomplete (fed by book_enemies, seeded per book_id) ───────────

let _enemyList = null;
async function _loadEnemyList() {
  if (_enemyList) return _enemyList;
  try {
    const res = await apiFetch(`/api/books/${currentBookId}/enemies`);
    _enemyList = res.ok ? await res.json() : [];
  } catch (_) {
    _enemyList = [];
  }
  return _enemyList;
}

function _setupEnemyAutocomplete(inputId, dropdownId, onSelect) {
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  let matches   = [];
  let activeIdx = -1;

  function closeDropdown() {
    dropdown.classList.remove('open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function render(q) {
    const list = _enemyList || [];
    const ql = q.trim().toLowerCase();
    matches = ql ? list.filter(e => e.name.toLowerCase().includes(ql)) : list;
    if (!matches.length) { closeDropdown(); return; }
    dropdown.innerHTML = matches.map((e, i) =>
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">SKILL:${e.attack ?? '?'} STAMINA:${e.hp ?? '?'}</span></li>`
    ).join('');
    activeIdx = -1;
    dropdown.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
  }

  function select(enemy) {
    if (!enemy) return;
    input.value = enemy.name;
    onSelect(enemy);
    closeDropdown();
  }

  dropdown.addEventListener('mousedown', e => {
    const li = e.target.closest('li');
    if (!li) return;
    select(matches[+li.dataset.idx]);
    e.preventDefault();
  });

  input.addEventListener('focus', async () => { input.removeAttribute('readonly'); await _loadEnemyList(); render(input.value); });
  input.addEventListener('input', async () => { await _loadEnemyList(); render(input.value); });
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

// ── Init ──────────────────────────────────────────────────────────────────────

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

export function initSim219() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim219-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim219-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim219.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim219-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim219.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim219.ui.skill'), 'sim219-player-skill')}
            ${_numField(t('battlesim219.ui.skill_initial'), 'sim219-player-skillmax')}
            ${_numField(t('battlesim219.ui.stamina'), 'sim219-player-stamina')}
            ${_numField(t('battlesim219.ui.stamina_initial'), 'sim219-player-staminamax')}
            ${_numField(t('battlesim219.ui.luck'), 'sim219-player-luck')}
            ${_numField(t('battlesim219.ui.luck_initial'), 'sim219-player-luckmax')}
            ${_numField(t('battlesim219.ui.atkmod'), 'sim219-player-atkmod')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim219.ui.potion')}</span>
              <select id="sim219-potion" class="inv-edit-input bsim-select">
                ${POTIONS.map(p => `<option value="${p[0]}">${escapeHtml(t(p[1]))}</option>`).join('')}
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span id="sim219-potion-uses" class="bsim-ae-display"></span>
              <button id="sim219-potion-use" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim219.btn.drink')}</button>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim219.ui.provisions')}</span>
              <span id="sim219-provisions-left" class="bsim-ae-display"></span>
              <button id="sim219-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim219.btn.provisions_eat', { n: PROVISIONS_HEAL })}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim219.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim219.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim219-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim219-enemy-pick-dropdown">
                <ul id="sim219-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim219.ui.skill'), 'sim219-enemy-skill')}
            ${_numField(t('battlesim219.ui.stamina'), 'sim219-enemy-stamina')}
            ${_numField(t('battlesim219.ui.stamina_max'), 'sim219-enemy-staminamax')}
            ${_numField(t('battlesim219.ui.wound_dmg'), 'sim219-enemy-wounddmg')}
            ${_numField(t('battlesim219.ui.player_wound_dmg'), 'sim219-player-wounddmg')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim219-enemy-firstwin" class="inv-edit-check"> ${t('battlesim219.ui.enemy_firstwin_toggle')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim219-paired" class="inv-edit-check"> ${t('battlesim219.ui.paired_toggle')}</label>
            </div>
            <div id="sim219-side-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim219.ui.pick')}</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim219-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim219-side-pick-dropdown">
                  <ul id="sim219-side-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField(t('battlesim219.ui.skill'), 'sim219-side-skill')}
              ${_numField(t('battlesim219.ui.stamina_max'), 'sim219-side-staminamax')}
            </div>
          </div>
          <div id="sim219-status" class="bsim-status"></div>
          <div id="sim219-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim219.btn.luck_prompt')}</span>
            <button id="sim219-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim219.btn.luck_yes')}</button>
            <button id="sim219-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim219.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim219-round" class="inv-add-btn bsim-action-primary">${t('battlesim219.btn.round')}</button>
            <button id="sim219-reset" class="inv-add-btn">${t('battlesim219.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim219-history-summary">${t('battlesim219.history.summary', { n: 0 })}</summary>
            <div id="sim219-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim219-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim219-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim219);
  document.getElementById('sim219-close').addEventListener('click', closeSim219);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim219(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim219-overlay'),
    open:  openSim219,
    close: closeSim219,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim219();
  });

  document.getElementById('sim219-round').addEventListener('click', _runRound);
  document.getElementById('sim219-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim219-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim219-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim219-provisions').addEventListener('click', _eatProvisions);
  document.getElementById('sim219-potion-use').addEventListener('click', _usePotion);

  document.getElementById('sim219-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim219.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim219-potion').addEventListener('change', e => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.potionKey = e.target.value;
    saveState();
  });

  document.getElementById('sim219-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim219-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim219-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim219-enemy-firstwin').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.enemyAutoWinFirstRound = e.target.checked;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim219-player-skill':      ['player', 'skill'],
    'sim219-player-skillmax':   ['player', 'skillInitial'],
    'sim219-player-stamina':    ['player', 'stamina'],
    'sim219-player-staminamax': ['player', 'staminaInitial'],
    'sim219-player-luck':       ['player', 'luck'],
    'sim219-player-luckmax':    ['player', 'luckInitial'],
    'sim219-player-atkmod':     ['player', 'attackModifier'],
    'sim219-enemy-skill':       ['enemy', 'skill'],
    'sim219-enemy-stamina':        ['enemy', 'stamina'],
    'sim219-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim219-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim219-player-wounddmg':      ['player', 'playerWoundDamage'],
    'sim219-side-skill':        ['sideEnemy', 'skill'],
    'sim219-side-staminamax':   ['sideEnemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Attack modifier is the one field allowed to go negative (bare-handed/
    // disarmed/fatigue penalties are always a subtraction) - every other
    // field stays clamped to 0 or above.
    val = id === 'sim219-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim219-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim219-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim219-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim219-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim219-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim219-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim219-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim219-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim219-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim219-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim219-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim219-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim219-enemy-pick', 'sim219-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.skill = enemy.attack;
    if (enemy.hp != null)     { d.enemy.stamina = enemy.hp; d.enemy.staminaMax = enemy.hp; }
    d.roundsThisBattle = 0;
    d.pendingLuckQueue = [];
    _resetEncounterKnobs(d);
    saveState();
    _renderAll();
  });
  _setupEnemyAutocomplete('sim219-side-pick', 'sim219-side-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy.staminaMax = enemy.hp;
    saveState();
    _renderAll();
  });
}
