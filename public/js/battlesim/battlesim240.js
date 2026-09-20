// ── Battle Simulator (Legend of the Shadow Warriors, book 240) ──────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 240 only) by the caller in boot.js via
// setSim240Visible().
// To remove: delete this file, remove its import line and initSim240()/
// setSim240Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with every other battlesimNNN.js, so only remove it if all of them are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system (1d6+6/2d6+12/1d6+6),
// same combat core as book 198, plus five mechanics unique to this book:
//
// - Weapon choice: Sword (normal 2/4/1 wound-Lucky-Unlucky) vs Battle-axe
//   (sec. 82: 4/6/2, but -1 to the player's own Attack Strength roll while
//   wielding it).
// - Armour choice: None / Chainmail (sec. 82: player takes only 1/0/2
//   instead of 2/4/1 wound-Lucky-Unlucky since it can't be added to, only
//   reduced; 10 hits) / Plate (sec. 97: takes 0 damage from any hit, 5
//   hits). Either one becomes "None" automatically once its hit count is
//   exhausted.
// - Group fights ("fight more than one opponent at the same time", rules
//   text): up to 8 side enemies alongside the primary target. Each side
//   enemy gets its own independent Attack Strength exchange every round;
//   if the player's roll is higher, it's parried (no effect either way,
//   per the rules text - "you will not inflict a wound in this instance");
//   if lower, the player takes a wound (same weapon/armour-modified amount
//   as a normal hit, no Luck option per the rules text only mentioning it
//   for the chosen-target's own exchange). Side enemies are never
//   themselves damaged, matching the book's own rule.
// - Disarm fights (secs. 20 x2 simultaneous, 392 x1): no STAMINA score at
//   all - winning by a margin of 3+ on the Attack Strength roll disarms
//   that specific opponent (removing it from the fight) instead of
//   wounding it; losing still wounds the player normally.
// - Pan-Terric Behemoth (sec. 152): "your blows will not harm the
//   creature" - modeled as a per-fight "immune to wounds" toggle (a
//   winning round is logged as parried, not damaging) plus a separate
//   "Roll for the skull" 1d6 button per round (rolling a 6 wins outright).
//
// The Spear of Doom (found sec. 90, Life-force = 1d6+5) has two distinct
// uses, both modeled: (1) in ANY fight, spend 1 Life-force to auto-win
// instantly instead of rolling combat; (2) the unique Voivod-with-spear
// fight (sec. 171) fights defensively - winning a round does not wound
// Voivod at all - with a separate "Empower the Spear" 2d6-vs-current-
// Life-force roll each round (success ends the fight per sec. 400).
// Voivod "thrives on your death" (secs. 171 and 249 both state this): any
// STAMINA the player loses in a round is also ADDED to Voivod's current
// STAMINA (uncapped past staminaMax, per the text), modeled as a toggle
// since it applies to both of Voivod's fight variants.
//
// All state lives in pt.sim240, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const MAX_PROVISIONS = 10;
const PROVISIONS_HEAL = 4;

const WEAPONS = {
  sword: { normal: 2, lucky: 4, unlucky: 1, atkPenalty: 0 },
  axe:   { normal: 4, lucky: 6, unlucky: 2, atkPenalty: 1 },
};
const ARMOURS = {
  none:      { normal: 0, lucky: 0, unlucky: 0, hitsMax: 0, absorbAll: false },
  chainmail: { normal: 1, lucky: 0, unlucky: 2, hitsMax: 10, absorbAll: false },
  plate:     { normal: 0, lucky: 0, unlucky: 0, hitsMax: 5,  absorbAll: true  },
};
const SIDE_WOUND_DMG = 2;
const DISARM_MARGIN = 3;
const MAX_SIDE_ENEMIES = 8;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim240) {
    pt.sim240 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        provisionsLeft: MAX_PROVISIONS,
        weapon: 'sword', armour: 'none', armourHitsLeft: 0,
        hasSpear: false, spearLifeForce: 0, spearRolled: false,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      groupFight: false,
      sideEnemies: [],
      disarmMode: false,
      immuneToWounds: false,
      voivodThrives: false,
      voivodDefensive: false,
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim240;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.provisionsLeft === undefined) d.player.provisionsLeft = MAX_PROVISIONS;
  if (d.player.weapon === undefined) d.player.weapon = 'sword';
  if (d.player.armour === undefined) d.player.armour = 'none';
  if (d.player.armourHitsLeft === undefined) d.player.armourHitsLeft = 0;
  if (d.player.hasSpear === undefined) d.player.hasSpear = false;
  if (d.player.spearLifeForce === undefined) d.player.spearLifeForce = 0;
  if (d.player.spearRolled === undefined) d.player.spearRolled = false;
  if (d.groupFight === undefined) d.groupFight = false;
  if (!Array.isArray(d.sideEnemies)) d.sideEnemies = [];
  if (d.disarmMode === undefined) d.disarmMode = false;
  if (d.immuneToWounds === undefined) d.immuneToWounds = false;
  if (d.voivodThrives === undefined) d.voivodThrives = false;
  if (d.voivodDefensive === undefined) d.voivodDefensive = false;
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
function _sideEnemyNameSafe(s, i) { return escapeHtml(s.name.trim() || t('battlesim240.ui.side_default', { n: i + 1 })); }

function _effectiveSkill(d) {
  return d.player.skill - WEAPONS[d.player.weapon].atkPenalty;
}

function _woundValues() {
  return WEAPONS.sword; // dealt-damage table is weapon-based, applied where enemy is wounded
}

// Uncapped - the admin dashboard aggregates battle counts app-wide from this
// array, so per-user history needs to be a true lifetime total, not a
// rolling window.
function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerStamina: d.player.stamina, playerStaminaMax: d.player.staminaInitial,
    ts: Date.now(),
  });
}

// ── Armour absorption ───────────────────────────────────────────────────────

// Applies armour reduction to a wound the PLAYER is taking, decrementing the
// armour's remaining hit count. Returns the actual STAMINA lost.
function _absorbHit(d, rawDmg, isLucky, isUnlucky) {
  const a = ARMOURS[d.player.armour];
  if (d.player.armour === 'none' || d.player.armourHitsLeft <= 0) return rawDmg;
  d.player.armourHitsLeft--;
  const dmg = isLucky ? a.lucky : isUnlucky ? a.unlucky : a.normal;
  if (d.player.armourHitsLeft <= 0) {
    _appendLog(d, t('battlesim240.log.armour_broke', { armour: t(`battlesim240.armour.${d.player.armour}`) }));
    d.player.armour = 'none';
  }
  return dmg;
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _runRound() {
  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0) return;
  d.roundsThisBattle++;
  d.pendingLuckQueue = [];

  const w = WEAPONS[d.player.weapon];

  // Primary exchange
  const playerRoll = _roll2d6() + _effectiveSkill(d);
  const enemyRoll   = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim240.log.round', { round: d.roundsThisBattle, playerAS: playerRoll, enemy: _enemyNameSafe(d), enemyAS: enemyRoll }));
  if (playerRoll === enemyRoll) {
    _appendLog(d, t('battlesim240.log.both_avoided'));
  } else if (playerRoll > enemyRoll) {
    if (d.disarmMode) {
      if (playerRoll - enemyRoll >= DISARM_MARGIN) {
        _appendLog(d, `${SVG_TROPHY} ${t('battlesim240.log.disarmed', { enemy: _enemyNameSafe(d) })}`);
        d.enemy.stamina = 0;
      } else {
        _appendLog(d, t('battlesim240.log.disarm_no_margin', { enemy: _enemyNameSafe(d) }));
      }
    } else if (d.immuneToWounds) {
      _appendLog(d, t('battlesim240.log.no_effect', { enemy: _enemyNameSafe(d) }));
    } else {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - w.normal);
      _appendLog(d, t('battlesim240.log.you_wound', { enemy: _enemyNameSafe(d), n: w.normal, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
      if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
    }
  } else {
    let dmg = _absorbHit(d, w.normal, false, false);
    d.player.stamina = Math.max(0, d.player.stamina - dmg);
    if (d.voivodThrives && dmg > 0) d.enemy.stamina += dmg;
    _appendLog(d, t('battlesim240.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: dmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.voivodThrives && dmg > 0) _appendLog(d, t('battlesim240.log.voivod_thrives', { enemy: _enemyNameSafe(d), n: dmg, stamina: d.enemy.stamina }));
    if (d.player.stamina > 0 && dmg > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Side-enemy exchanges (group fights)
  if (d.groupFight) {
    for (let i = 0; i < d.sideEnemies.length; i++) {
      const s = d.sideEnemies[i];
      if (d.player.stamina <= 0) break;
      const sPlayerRoll = _roll2d6() + _effectiveSkill(d);
      const sRoll = _roll2d6() + s.skill;
      _appendLog(d, t('battlesim240.log.side_round', { enemy: _sideEnemyNameSafe(s, i), playerAS: sPlayerRoll, enemyAS: sRoll }));
      if (sPlayerRoll > sRoll) {
        _appendLog(d, t('battlesim240.log.side_fend', { enemy: _sideEnemyNameSafe(s, i) }));
      } else if (sPlayerRoll < sRoll) {
        // A side enemy losing to the player is always just parried, never
        // disarmed - disarmMode's margin rule only applies to the chosen
        // primary target (matches sec. 20's own text: only the one you
        // "attack" can be disarmed; the others just keep attacking).
        const dmg = _absorbHit(d, SIDE_WOUND_DMG, false, false);
        d.player.stamina = Math.max(0, d.player.stamina - dmg);
        _appendLog(d, t('battlesim240.log.side_wounds', { enemy: _sideEnemyNameSafe(s, i), n: dmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      } else {
        _appendLog(d, t('battlesim240.log.both_avoided'));
      }
    }
  }

  if (d.enemy.stamina <= 0) {
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim240.log.defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, `${SVG_SKULL} ${t('battlesim240.log.fallen')}`);
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

// Test Your Luck, processed one queued event at a time (primary hit first,
// then any side-enemy events would be added the same way in future - today
// only the primary exchange offers Luck, per the rules text).
function _testLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  const w = WEAPONS[d.player.weapon];
  if (event.kind === 'player-hit') {
    const extra = lucky ? (w.lucky - w.normal) : -(w.normal - w.unlucky);
    d.enemy.stamina = Math.max(0, d.enemy.stamina - extra);
    const key = lucky ? 'battlesim240.log.luck_player_hit_lucky' : 'battlesim240.log.luck_player_hit_unlucky';
    _appendLog(d, t(key, { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.enemy.stamina <= 0) { _appendLog(d, `${SVG_TROPHY} ${t('battlesim240.log.defeated', { enemy: _enemyNameSafe(d) })}`); _recordOutcome(d, 'win'); }
  } else {
    // Luck on a wound taken: Lucky -> 1 STAMINA lost total, Unlucky -> 3 total.
    // The base hit already deducted the armour/weapon-modified amount; here
    // we adjust toward the Lucky/Unlucky totals defined by the base rules
    // (armour doesn't further modify the Luck adjustment itself).
    const before = d.player.stamina;
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      if (d.voivodThrives) d.enemy.stamina += 1;
    }
    const key = lucky ? 'battlesim240.log.luck_hit_lucky' : 'battlesim240.log.luck_hit_unlucky';
    _appendLog(d, t(key, { roll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (!lucky && d.voivodThrives) _appendLog(d, t('battlesim240.log.voivod_thrives', { enemy: _enemyNameSafe(d), n: 1, stamina: d.enemy.stamina }));
    if (d.player.stamina <= 0) { _appendLog(d, `${SVG_SKULL} ${t('battlesim240.log.fallen')}`); _recordOutcome(d, 'loss'); }
  }
  saveState();
  _renderAll();
}

function _skipLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length) return;
  d.pendingLuckQueue.shift();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.stamina = d.enemy.staminaMax;
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim240.log.reset_sep'));
  _appendLog(d, t('battlesim240.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Behemoth "roll for the skull" ───────────────────────────────────────────

function _rollForSkull() {
  const d = _data();
  if (!d || _notReady(d) || !d.immuneToWounds || d.player.stamina <= 0 || d.enemy.stamina <= 0) return;
  const roll = _roll1d6();
  if (roll === 6) {
    _appendLog(d, t('battlesim240.log.skull_hit', { roll }));
    d.enemy.stamina = 0;
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim240.log.defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  } else {
    _appendLog(d, t('battlesim240.log.skull_miss', { roll }));
  }
  saveState();
  _renderAll();
}

// ── Spear of Doom ────────────────────────────────────────────────────────────

function _rollSpearLifeForce() {
  const d = _data();
  if (!d || d.player.spearRolled) return;
  d.player.spearLifeForce = _roll1d6() + 5;
  d.player.spearRolled = true;
  d.player.hasSpear = true;
  _appendLog(d, t('battlesim240.log.spear_rolled', { n: d.player.spearLifeForce }));
  saveState();
  _renderAll();
}

// General-purpose: spend 1 Life-force to auto-win the current fight instantly.
function _useSpearAutoWin() {
  const d = _data();
  if (!d || _notReady(d) || !d.player.hasSpear || d.player.spearLifeForce <= 0) return;
  if (d.player.stamina <= 0 || d.enemy.stamina <= 0) return;
  d.player.spearLifeForce--;
  d.enemy.stamina = 0;
  _appendLog(d, t('battlesim240.log.spear_autowin', { enemy: _enemyNameSafe(d), n: d.player.spearLifeForce }));
  _appendLog(d, `${SVG_TROPHY} ${t('battlesim240.log.defeated', { enemy: _enemyNameSafe(d) })}`);
  _recordOutcome(d, 'win');
  saveState();
  _renderAll();
}

// Voivod-with-spear (sec. 171) specific: 2d6 vs current Life-force each
// round; success ends the fight outright (sec. 400).
function _empowerSpear() {
  const d = _data();
  if (!d || _notReady(d) || !d.voivodDefensive || !d.player.hasSpear || d.player.spearLifeForce <= 0) return;
  if (d.player.stamina <= 0 || d.enemy.stamina <= 0) return;
  const roll = _roll2d6();
  if (roll <= d.player.spearLifeForce) {
    _appendLog(d, t('battlesim240.log.spear_empower_success', { roll, n: d.player.spearLifeForce }));
    d.enemy.stamina = 0;
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim240.log.defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  } else {
    d.player.spearLifeForce--;
    _appendLog(d, t('battlesim240.log.spear_empower_fail', { roll, n: d.player.spearLifeForce }));
    if (d.player.spearLifeForce <= 0) _appendLog(d, t('battlesim240.log.spear_spent'));
  }
  saveState();
  _renderAll();
}

// ── Provisions ───────────────────────────────────────────────────────────────

function _eatProvisions() {
  const d = _data();
  if (!d || _notReady(d)) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim240.alert.provisions_midfight'));
    return;
  }
  if (d.player.provisionsLeft <= 0) return;
  if (d.player.stamina >= d.player.staminaInitial) {
    showAlert(t('battlesim240.alert.stamina_full'));
    return;
  }
  d.player.provisionsLeft--;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + PROVISIONS_HEAL);
  _appendLog(d, t('battlesim240.log.provisions', { before, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  saveState();
  _renderAll();
}

// ── Side enemies (group fights) ─────────────────────────────────────────────

function _addSideEnemy() {
  const d = _data();
  if (!d || d.sideEnemies.length >= MAX_SIDE_ENEMIES) return;
  d.sideEnemies.push({ name: '', skill: 6 });
  saveState();
  _renderAll();
}

function _removeSideEnemy(idx) {
  const d = _data();
  if (!d) return;
  d.sideEnemies.splice(idx, 1);
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim240-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0 || d.disarmMode;
  if (notReady)                                     el.innerHTML = t('battlesim240.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = `${SVG_SKULL} ${t('battlesim240.status.fallen')}`;
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = `${SVG_TROPHY} ${t('battlesim240.status.victory')}`;
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  const pending = d.pendingLuckQueue.length > 0;
  document.getElementById('sim240-round').disabled = over || pending;
  document.getElementById('sim240-luck-yes').disabled = notReady || !pending || d.player.luck <= 0;
  document.getElementById('sim240-luck-no').disabled  = notReady || !pending;
  document.getElementById('sim240-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
  document.getElementById('sim240-skull-roll').disabled = notReady || over || !d.immuneToWounds || pending;
  document.getElementById('sim240-spear-autowin').disabled = notReady || over || !d.player.hasSpear || d.player.spearLifeForce <= 0 || pending;
  document.getElementById('sim240-spear-empower').disabled = notReady || over || !d.voivodDefensive || !d.player.hasSpear || d.player.spearLifeForce <= 0 || pending;
  document.getElementById('sim240-spear-roll').disabled = d.player.spearRolled;
}

function _renderSideEnemiesHtml(d) {
  if (!d.groupFight) return '';
  return `
    <div class="bsim-side-title">${t('battlesim240.ui.side_enemies')}</div>
    ${d.sideEnemies.map((s, i) => `
      <div class="inv-edit-row bsim-ae-row">
        <input type="text" class="inv-edit-input bsim-side-name" data-idx="${i}" placeholder="${t('battlesim240.ui.side_default', { n: i + 1 })}" value="${escapeHtml(s.name)}">
        <input type="text" class="inv-edit-input inv-qty-input bsim-side-skill" data-idx="${i}" inputmode="numeric" value="${s.skill}" style="max-width:4rem">
        <button class="inv-edit-done bsim-tech-btn" data-idx="${i}" id="sim240-side-remove-${i}">${t('battlesim240.btn.remove')}</button>
      </div>`).join('')}
    <button id="sim240-side-add" class="inv-edit-done bsim-ae-roll-btn" type="button" ${d.sideEnemies.length >= MAX_SIDE_ENEMIES ? 'disabled' : ''}>${t('battlesim240.btn.add_side_enemy')}</button>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim240-history-summary');
  const listEl = document.getElementById('sim240-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim240.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim240.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim240.history.won') : t('battlesim240.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim240-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim240-player-skill').value      = d.player.skill;
  document.getElementById('sim240-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim240-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim240-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim240-player-luck').value       = d.player.luck;
  document.getElementById('sim240-player-luckmax').value    = d.player.luckInitial;

  const rollBtn = document.getElementById('sim240-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim240.btn.rolled') : t('battlesim240.btn.roll');

  document.getElementById('sim240-weapon').value = d.player.weapon;
  document.getElementById('sim240-armour').value = d.player.armour;
  document.getElementById('sim240-armour-hits').textContent =
    d.player.armour === 'none' ? '' : t('battlesim240.ui.armour_hits_left', { n: d.player.armourHitsLeft, max: ARMOURS[d.player.armour].hitsMax });

  document.getElementById('sim240-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim240-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim240-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim240-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim240-enemy-staminamax').value = d.enemy.staminaMax;

  document.getElementById('sim240-group-fight').checked = d.groupFight;
  document.getElementById('sim240-side-list').innerHTML = _renderSideEnemiesHtml(d);
  document.getElementById('sim240-disarm-mode').checked = d.disarmMode;
  document.getElementById('sim240-immune').checked = d.immuneToWounds;
  document.getElementById('sim240-voivod-thrives').checked = d.voivodThrives;
  document.getElementById('sim240-voivod-defensive').checked = d.voivodDefensive;

  document.getElementById('sim240-spear-lifeforce').textContent =
    d.player.spearRolled ? String(d.player.spearLifeForce) : t('battlesim240.ui.spear_not_rolled');

  const pendingEl = document.getElementById('sim240-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim240() {
  const overlay = document.getElementById('sim240-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim240(); return; }
  _renderAll();
}

function openSim240() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim240-overlay').classList.add('active');
}

function closeSim240() {
  document.getElementById('sim240-overlay')?.classList.remove('active');
}

export function setSim240Visible(visible) {
  const btn = document.getElementById('sim240-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim240();
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

function _setupEnemyAutocomplete() {
  const input    = document.getElementById('sim240-enemy-pick');
  const dropdown = document.getElementById('sim240-enemy-pick-dropdown');
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
      `<li role="option" id="sim240-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">SKILL:${e.attack ?? '?'} STAMINA:${e.hp ?? '?'}</span></li>`
    ).join('');
    activeIdx = -1;
    dropdown.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
  }

  function select(enemy) {
    const d = _data();
    if (!d || !enemy) return;
    input.value = enemy.name;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.skill = enemy.attack;
    if (enemy.hp != null)     { d.enemy.stamina = enemy.hp; d.enemy.staminaMax = enemy.hp; }
    d.roundsThisBattle = 0;
    d.pendingLuckQueue = [];
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

export function initSim240() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim240-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim240-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim240.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim240-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim240.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim240.ui.skill'), 'sim240-player-skill')}
            ${_numField(t('battlesim240.ui.skill_initial'), 'sim240-player-skillmax')}
            ${_numField(t('battlesim240.ui.stamina'), 'sim240-player-stamina')}
            ${_numField(t('battlesim240.ui.stamina_initial'), 'sim240-player-staminamax')}
            ${_numField(t('battlesim240.ui.luck'), 'sim240-player-luck')}
            ${_numField(t('battlesim240.ui.luck_initial'), 'sim240-player-luckmax')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim240.ui.weapon')}</span>
              <select id="sim240-weapon" class="inv-edit-input bsim-select">
                <option value="sword">${t('battlesim240.weapon.sword')}</option>
                <option value="axe">${t('battlesim240.weapon.axe')}</option>
              </select>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim240.ui.armour')}</span>
              <select id="sim240-armour" class="inv-edit-input bsim-select">
                <option value="none">${t('battlesim240.armour.none')}</option>
                <option value="chainmail">${t('battlesim240.armour.chainmail')}</option>
                <option value="plate">${t('battlesim240.armour.plate')}</option>
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span id="sim240-armour-hits" class="bsim-ae-display"></span>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim240.ui.provisions')}</span>
              <span id="sim240-provisions-left" class="bsim-ae-display"></span>
              <button id="sim240-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim240.btn.provisions_eat', { n: PROVISIONS_HEAL })}</button>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim240.ui.spear_lifeforce')}</span>
              <span id="sim240-spear-lifeforce" class="bsim-ae-display"></span>
              <button id="sim240-spear-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim240.btn.spear_roll')}</button>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <button id="sim240-spear-autowin" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim240.btn.spear_autowin')}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim240.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim240.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim240-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim240-enemy-pick-dropdown">
                <ul id="sim240-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim240.ui.skill'), 'sim240-enemy-skill')}
            ${_numField(t('battlesim240.ui.stamina'), 'sim240-enemy-stamina')}
            ${_numField(t('battlesim240.ui.stamina_max'), 'sim240-enemy-staminamax')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim240-group-fight" class="inv-edit-check"> ${t('battlesim240.ui.group_fight')}</label>
            </div>
            <div id="sim240-side-list"></div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim240-disarm-mode" class="inv-edit-check"> ${t('battlesim240.ui.disarm_mode')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim240-immune" class="inv-edit-check"> ${t('battlesim240.ui.immune_mode')}</label>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <button id="sim240-skull-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim240.btn.skull_roll')}</button>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim240-voivod-thrives" class="inv-edit-check"> ${t('battlesim240.ui.voivod_thrives')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim240-voivod-defensive" class="inv-edit-check"> ${t('battlesim240.ui.voivod_defensive')}</label>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <button id="sim240-spear-empower" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim240.btn.spear_empower')}</button>
            </div>
          </div>
          <div id="sim240-status" class="bsim-status"></div>
          <div id="sim240-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim240.btn.luck_prompt')}</span>
            <button id="sim240-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim240.btn.luck_yes')}</button>
            <button id="sim240-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim240.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim240-round" class="inv-add-btn bsim-action-primary">${t('battlesim240.btn.round')}</button>
            <button id="sim240-reset" class="inv-add-btn">${t('battlesim240.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim240-history-summary">${t('battlesim240.history.summary', { n: 0 })}</summary>
            <div id="sim240-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim240-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim240-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim240);
  document.getElementById('sim240-close').addEventListener('click', closeSim240);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim240(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim240-overlay'),
    open:  openSim240,
    close: closeSim240,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim240();
  });

  document.getElementById('sim240-round').addEventListener('click', _runRound);
  document.getElementById('sim240-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim240-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim240-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim240-provisions').addEventListener('click', _eatProvisions);
  document.getElementById('sim240-skull-roll').addEventListener('click', _rollForSkull);
  document.getElementById('sim240-spear-roll').addEventListener('click', _rollSpearLifeForce);
  document.getElementById('sim240-spear-autowin').addEventListener('click', _useSpearAutoWin);
  document.getElementById('sim240-spear-empower').addEventListener('click', _empowerSpear);

  document.getElementById('sim240-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim240.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim240-weapon').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.weapon = e.target.value;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim240-armour').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.armour = e.target.value;
    d.player.armourHitsLeft = ARMOURS[e.target.value].hitsMax;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim240-group-fight').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.groupFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim240-disarm-mode').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.disarmMode = e.target.checked;
    saveState();
  });

  document.getElementById('sim240-immune').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.immuneToWounds = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim240-voivod-thrives').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.voivodThrives = e.target.checked;
    saveState();
  });

  document.getElementById('sim240-voivod-defensive').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.voivodDefensive = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim240-side-list').addEventListener('click', e => {
    if (e.target.id === 'sim240-side-add') { _addSideEnemy(); return; }
    if (e.target.id.startsWith('sim240-side-remove-')) { _removeSideEnemy(+e.target.dataset.idx); return; }
  });
  document.getElementById('sim240-side-list').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    const idx = +e.target.dataset.idx;
    if (Number.isNaN(idx) || !d.sideEnemies[idx]) return;
    if (e.target.classList.contains('bsim-side-name')) {
      d.sideEnemies[idx].name = e.target.value;
    } else if (e.target.classList.contains('bsim-side-skill')) {
      const raw = String(e.target.value).replace(/[^0-9]/g, '');
      if (raw !== e.target.value) e.target.value = raw;
      d.sideEnemies[idx].skill = Number(raw) || 0;
    }
    saveState();
  });

  document.getElementById('sim240-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim240-player-skill':      ['player', 'skill'],
    'sim240-player-skillmax':   ['player', 'skillInitial'],
    'sim240-player-stamina':    ['player', 'stamina'],
    'sim240-player-staminamax': ['player', 'staminaInitial'],
    'sim240-player-luck':       ['player', 'luck'],
    'sim240-player-luckmax':    ['player', 'luckInitial'],
    'sim240-enemy-skill':       ['enemy', 'skill'],
    'sim240-enemy-stamina':        ['enemy', 'stamina'],
    'sim240-enemy-staminamax':     ['enemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = Math.max(0, val);
    if (id === 'sim240-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim240-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim240-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim240-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim240-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim240-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim240-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim240-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim240-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim240-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete();
}
