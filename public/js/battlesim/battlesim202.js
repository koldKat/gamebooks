// ── Battle Simulator (Deathtrap Dungeon, book 202) ───────────────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 202 only) by the caller in boot.js via
// setSim202Visible().
// To remove: delete this file, remove its import line and initSim202()/
// setSim202Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with battlesim8.js/battlesim829.js/battlesim286.js/battlesim198.js/
// battlesim199.js/battlesim200.js/battlesim186.js/battlesim201.js, so only
// remove it if all nine are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system, same core numbers,
// Test Your Luck table, and single-dose potion-of-three-choices setup as
// book 201 - reused verbatim rather than reinvented.
//
// Four new generic knobs cover every special combat rule found in the
// third-pass verified reference, none of it hardcoded by encounter name:
// - instaKillEnemyAS (numeric, 0 = off): if the enemy's (or the paired side
//   enemy's) rolled Attack Strength ever equals this exact value, the player
//   dies instantly regardless of remaining STAMINA. Covers the Giant
//   Scorpion (sec.143): both SKILL-10 pincers attack independently every
//   round via the existing attackModifier-free pairedFight mechanic, and a
//   pincer roll of exactly 22 is an instant kill.
// - instaKillOnEnemyWin (checkbox): the enemy winning even a single Attack
//   Round is instant death, bypassing normal STAMINA loss entirely. Covers
//   the Mirror Demon (sec.327).
// - winAfterHits (numeric, 0 = off): once the player has landed this many
//   successful wounds in the current fight, the enemy is instantly
//   defeated instead of taking normal damage. Covers the Bloodbeast's
//   "weakness known" route (sec.172, win after the 2nd landed hit).
// - luckyKillOnWin (checkbox): every time the player lands a hit, instead of
//   the normal 2-STAMINA wound Test Your Luck is mandatory - Lucky finds the
//   weak point and ends the fight immediately, Unlucky undoes that hit's
//   damage entirely (no partial credit) and the fight continues. Covers the
//   Bloodbeast's "weakness unknown" route (sec.225).
// attackModifier/enemyWoundDamage/pairedFight/sideEnemy are reused exactly
// as book 200/201 built them - they already cover every "-N SKILL this
// fight" (bare-handed Orcs, fatigued vs the Dwarf Trialmaster, restricted-
// position Flying Guardians, dagger-route Bloodbeast) and "second attacker
// fights alongside, never woundable" (the two Goblins) case in the roster.
//
// Deliberately NOT modeled, same precedent as book 201: pre-battle one-off
// STAMINA/SKILL losses (Manticore tail hits, Ivy's grip, Orc weapon-knockaway,
// Imitator's opening fist) - apply those by hand with the stat steppers
// before starting the fight, same as any other narrative loss. Also not
// modeled: Escape options (auto -2 STAMINA, Luck-eligible) - rare enough,
// and easy enough to apply by hand, that a dedicated button isn't worth it,
// matching every other sim in this app. One-time permanent stat rewards
// (Amulet of Strength +1 SKILL/+1 STAMINA) are applied via the Initial
// SKILL/STAMINA fields directly, not tracked as items - only ongoing
// while-carried/while-worn bonuses get their own Items checkbox.
//
// All state lives in pt.sim202, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Choose exactly one bottle (sec.10). Each bottle contains one measure, same
// single-use rule as book 201's potions.
const POTIONS = [
  ['skill',    'battlesim202.potion.skill'],
  ['strength', 'battlesim202.potion.strength'],
  ['fortune',  'battlesim202.potion.fortune'],
];

const MAX_PROVISIONS = 10;
const PROVISIONS_HEAL = 4;
const SIDE_WOUND_DMG = 2;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim202) {
    pt.sim202 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        potionKey: 'skill', potionUsesLeft: 1,
        provisionsLeft: MAX_PROVISIONS,
        attackModifier: 0,
        enemyWoundDamage: 2,
        instaKillEnemyAS: 0,
        instaKillOnEnemyWin: false,
        winAfterHits: 0,
        luckyKillOnWin: false,
        hitsLandedThisFight: 0,
        hasChainmail: false,
        hasIronShield: false,
        hasNinjaSword: false,
        hasWingedHelmet: false,
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
  const d = pt.sim202;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.potionKey === undefined) d.player.potionKey = 'skill';
  if (d.player.potionUsesLeft === undefined) d.player.potionUsesLeft = 1;
  if (d.player.provisionsLeft === undefined) d.player.provisionsLeft = MAX_PROVISIONS;
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.instaKillEnemyAS === undefined) d.player.instaKillEnemyAS = 0;
  if (d.player.instaKillOnEnemyWin === undefined) d.player.instaKillOnEnemyWin = false;
  if (d.player.winAfterHits === undefined) d.player.winAfterHits = 0;
  if (d.player.luckyKillOnWin === undefined) d.player.luckyKillOnWin = false;
  if (d.player.hitsLandedThisFight === undefined) d.player.hitsLandedThisFight = 0;
  if (d.player.hasChainmail === undefined) d.player.hasChainmail = false;
  if (d.player.hasIronShield === undefined) d.player.hasIronShield = false;
  if (d.player.hasNinjaSword === undefined) d.player.hasNinjaSword = false;
  if (d.player.hasWingedHelmet === undefined) d.player.hasWingedHelmet = false;
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

// Persistent while-carried/while-worn items found in the reference (one-time
// permanent stat gains like the Amulet of Strength are applied via the
// Initial SKILL/STAMINA fields directly, not tracked here):
// - Dwarf Chainmail (sec.28): +1 SKILL while worn.
// - Iron Shield (sec.95): +1 SKILL while carried (also blocks the
//   Manticore's tail volley entirely on that route - no STAMINA loss to
//   apply by hand in that case).
// - Ninja Curved Sword (sec.286): +4 SKILL while wielded. Only one weapon
//   bonus applies at a time per the core rules, so don't also enable
//   Chainmail's sword-independent bonus alongside a different magic weapon
//   if the book ever adds one - not a conflict for this book's roster today.
// - Winged Helmet (sec.218): +1 SKILL while worn.
function _effectiveSkill(d) {
  let skill = d.player.skill;
  if (d.player.hasChainmail)    skill += 1;
  if (d.player.hasIronShield)   skill += 1;
  if (d.player.hasNinjaSword)   skill += 4;
  if (d.player.hasWingedHelmet) skill += 1;
  return skill;
}

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.instaKillEnemyAS = 0;
  d.player.instaKillOnEnemyWin = false;
  d.player.winAfterHits = 0;
  d.player.luckyKillOnWin = false;
  d.player.hitsLandedThisFight = 0;
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
  d.roundsThisBattle++;

  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const playerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim202.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));

  const enemyInstaKill = d.player.instaKillEnemyAS > 0 && enemyAS === d.player.instaKillEnemyAS;
  if (enemyInstaKill) {
    _appendLog(d, t('battlesim202.log.insta_fatal', { enemy: _enemyNameSafe(d), n: enemyAS }));
    d.player.stamina = 0;
    _appendLog(d, t('battlesim202.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
    saveState();
    _renderAll();
    return;
  }

  if (playerAS === enemyAS) {
    _appendLog(d, t('battlesim202.log.both_avoided'));
  } else if (playerAS > enemyAS) {
    if (d.player.luckyKillOnWin) {
      // Mandatory Test Your Luck instead of a normal wound: Lucky finds the
      // weak point and ends the fight, Unlucky means this hit did nothing.
      d.pendingLuckQueue.push({ kind: 'weakpoint-hit' });
      _appendLog(d, t('battlesim202.log.weakpoint_hit', { enemy: _enemyNameSafe(d) }));
    } else {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
      d.player.hitsLandedThisFight++;
      _appendLog(d, t('battlesim202.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
      if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.stamina > 0) {
        d.enemy.stamina = 0;
        _appendLog(d, t('battlesim202.log.weakpoint_found'));
      }
      if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
    }
  } else if (d.player.instaKillOnEnemyWin) {
    _appendLog(d, t('battlesim202.log.enemy_insta_win', { enemy: _enemyNameSafe(d) }));
    d.player.stamina = 0;
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
    _appendLog(d, t('battlesim202.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Paired fight: a second, independent exchange with its own fresh player
  // roll - covers the two-attacker encounters (Goblins choosing a target
  // each round, the Giant Scorpion's second pincer). The side attacker is
  // never wounded through this path, matching the literal rule for both.
  if (d.pairedFight && d.sideEnemy.staminaMax > 0 && d.player.stamina > 0) {
    const sidePlayerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    _appendLog(d, t('battlesim202.log.side_round', { enemy: _sideEnemyNameSafe(d), playerAS: sidePlayerAS, enemyAS: sideAS }));
    const sideInstaKill = d.player.instaKillEnemyAS > 0 && sideAS === d.player.instaKillEnemyAS;
    if (sideInstaKill) {
      _appendLog(d, t('battlesim202.log.side_insta_fatal', { enemy: _sideEnemyNameSafe(d), n: sideAS }));
      d.player.stamina = 0;
    } else if (sideAS > sidePlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim202.log.side_wounds', { enemy: _sideEnemyNameSafe(d), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side-hit' });
    } else {
      _appendLog(d, t('battlesim202.log.side_fend', { enemy: _sideEnemyNameSafe(d) }));
    }
  }

  if (d.enemy.stamina <= 0) {
    _appendLog(d, t('battlesim202.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim202.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome. Same
// table as book 201's, plus a new 'weakpoint-hit' kind for luckyKillOnWin
// fights - Lucky ends the fight outright, Unlucky means the hit did nothing.
function _testLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'weakpoint-hit') {
    if (lucky) {
      d.enemy.stamina = 0;
      _appendLog(d, t('battlesim202.log.weakpoint_lucky', { roll, enemy: _enemyNameSafe(d) }));
      _appendLog(d, t('battlesim202.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
      _recordOutcome(d, 'win');
    } else {
      _appendLog(d, t('battlesim202.log.weakpoint_unlucky', { roll, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
  } else if (event.kind === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
      _appendLog(d, t('battlesim202.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim202.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= 0) { _appendLog(d, t('battlesim202.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim202.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim202.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim202.log.fallen', { skull: SVG_SKULL }));
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
  const event = d.pendingLuckQueue.shift();
  // Skipping a mandatory weak-point check still needs a resolution - treat a
  // skip as declining to press the advantage, i.e. the same as Unlucky (no
  // effect), rather than leaving the hit's damage in limbo.
  if (event.kind === 'weakpoint-hit') {
    _appendLog(d, t('battlesim202.log.weakpoint_decline', { stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
  }
  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.stamina = d.enemy.staminaMax;
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.player.hitsLandedThisFight = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim202.log.reset_sep'));
  _appendLog(d, t('battlesim202.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Provisions / Potions ────────────────────────────────────────────────────

function _eatProvisions() {
  const d = _data();
  if (!d || _notReady(d)) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim202.alert.provisions_midfight'));
    return;
  }
  if (d.player.provisionsLeft <= 0) return;
  if (d.player.stamina >= d.player.staminaInitial) {
    showAlert(t('battlesim202.alert.stamina_full'));
    return;
  }
  d.player.provisionsLeft--;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + PROVISIONS_HEAL);
  _appendLog(d, t('battlesim202.log.provisions', { before, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  saveState();
  _renderAll();
}

function _usePotion() {
  const d = _data();
  if (!d || _notReady(d) || d.player.potionUsesLeft <= 0) return;
  // "A potion may be used at any time except during battle" (sec.10) - same
  // mid-fight guard as Provisions.
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim202.alert.potion_midfight'));
    return;
  }
  d.player.potionUsesLeft--;
  if (d.player.potionKey === 'skill') {
    d.player.skill = d.player.skillInitial;
    _appendLog(d, t('battlesim202.log.potion_skill', { n: d.player.skillInitial }));
  } else if (d.player.potionKey === 'strength') {
    d.player.stamina = d.player.staminaInitial;
    _appendLog(d, t('battlesim202.log.potion_strength', { n: d.player.staminaInitial }));
  } else {
    d.player.luckInitial += 1;
    d.player.luck = d.player.luckInitial;
    _appendLog(d, t('battlesim202.log.potion_fortune', { n: d.player.luckInitial }));
  }
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim202-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim202.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim202.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = t('battlesim202.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim202-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim202-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim202-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim202-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
}

function _renderItemsHtml(d) {
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim202.ui.item_chainmail_name')} <span class="bsim-tech-uses">(sec. 28)</span></div>
      <div class="bsim-tech-desc">${t('battlesim202.ui.item_chainmail_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim202-item-chainmail" class="inv-edit-check" ${d.player.hasChainmail ? 'checked' : ''}> ${t('battlesim202.ui.have_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim202.ui.item_ironshield_name')} <span class="bsim-tech-uses">(sec. 95)</span></div>
      <div class="bsim-tech-desc">${t('battlesim202.ui.item_ironshield_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim202-item-ironshield" class="inv-edit-check" ${d.player.hasIronShield ? 'checked' : ''}> ${t('battlesim202.ui.have_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim202.ui.item_ninjasword_name')} <span class="bsim-tech-uses">(sec. 286)</span></div>
      <div class="bsim-tech-desc">${t('battlesim202.ui.item_ninjasword_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim202-item-ninjasword" class="inv-edit-check" ${d.player.hasNinjaSword ? 'checked' : ''}> ${t('battlesim202.ui.have_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim202.ui.item_wingedhelmet_name')} <span class="bsim-tech-uses">(sec. 218)</span></div>
      <div class="bsim-tech-desc">${t('battlesim202.ui.item_wingedhelmet_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim202-item-wingedhelmet" class="inv-edit-check" ${d.player.hasWingedHelmet ? 'checked' : ''}> ${t('battlesim202.ui.have_it')}</label></div>
    </div>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim202-history-summary');
  const listEl = document.getElementById('sim202-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim202.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim202.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim202.history.won') : t('battlesim202.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim202-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim202-player-skill').value      = d.player.skill;
  document.getElementById('sim202-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim202-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim202-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim202-player-luck').value       = d.player.luck;
  document.getElementById('sim202-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim202-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim202-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim202.btn.rolled') : t('battlesim202.btn.roll');

  const potionSel = document.getElementById('sim202-potion');
  potionSel.value = d.player.potionKey;
  potionSel.disabled = d.rolled;
  document.getElementById('sim202-potion-uses').textContent = t('battlesim202.ui.uses_left', { n: d.player.potionUsesLeft });
  document.getElementById('sim202-potion-use').disabled =
    _notReady(d) || d.player.potionUsesLeft <= 0 ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);

  document.getElementById('sim202-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim202-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim202-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim202-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim202-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim202-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim202-enemy-askill').value     = d.player.instaKillEnemyAS;
  document.getElementById('sim202-enemy-winhits').value    = d.player.winAfterHits;
  document.getElementById('sim202-insta-win').checked      = d.player.instaKillOnEnemyWin;
  document.getElementById('sim202-lucky-kill').checked     = d.player.luckyKillOnWin;

  document.getElementById('sim202-paired').checked = d.pairedFight;
  document.getElementById('sim202-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim202-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim202-side-staminamax').value = d.sideEnemy.staminaMax;
  document.getElementById('sim202-side-fields').style.display = d.pairedFight ? '' : 'none';

  document.getElementById('sim202-item-list').innerHTML = _renderItemsHtml(d);

  const pendingEl = document.getElementById('sim202-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim202() {
  const overlay = document.getElementById('sim202-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim202(); return; }
  _renderAll();
}

function openSim202() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim202-overlay').classList.add('active');
}

function closeSim202() {
  document.getElementById('sim202-overlay')?.classList.remove('active');
}

export function setSim202Visible(visible) {
  const btn = document.getElementById('sim202-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim202();
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

export function initSim202() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim202-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim202-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim202.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim202-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim202.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim202.ui.skill'), 'sim202-player-skill')}
            ${_numField(t('battlesim202.ui.skill_initial'), 'sim202-player-skillmax')}
            ${_numField(t('battlesim202.ui.stamina'), 'sim202-player-stamina')}
            ${_numField(t('battlesim202.ui.stamina_initial'), 'sim202-player-staminamax')}
            ${_numField(t('battlesim202.ui.luck'), 'sim202-player-luck')}
            ${_numField(t('battlesim202.ui.luck_initial'), 'sim202-player-luckmax')}
            ${_numField(t('battlesim202.ui.atkmod'), 'sim202-player-atkmod')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim202.ui.potion')}</span>
              <select id="sim202-potion" class="inv-edit-input bsim-select">
                ${POTIONS.map(p => `<option value="${p[0]}">${escapeHtml(t(p[1]))}</option>`).join('')}
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span id="sim202-potion-uses" class="bsim-ae-display"></span>
              <button id="sim202-potion-use" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim202.btn.drink')}</button>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim202.ui.provisions')}</span>
              <span id="sim202-provisions-left" class="bsim-ae-display"></span>
              <button id="sim202-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim202.btn.provisions_eat', { n: PROVISIONS_HEAL })}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim202.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim202.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim202-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim202-enemy-pick-dropdown">
                <ul id="sim202-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim202.ui.skill'), 'sim202-enemy-skill')}
            ${_numField(t('battlesim202.ui.stamina'), 'sim202-enemy-stamina')}
            ${_numField(t('battlesim202.ui.stamina_max'), 'sim202-enemy-staminamax')}
            ${_numField(t('battlesim202.ui.wound_dmg'), 'sim202-enemy-wounddmg')}
            ${_numField(t('battlesim202.ui.insta_death_as'), 'sim202-enemy-askill')}
            ${_numField(t('battlesim202.ui.win_after_hits'), 'sim202-enemy-winhits')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim202-insta-win" class="inv-edit-check"> ${t('battlesim202.ui.insta_win_toggle')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim202-lucky-kill" class="inv-edit-check"> ${t('battlesim202.ui.lucky_kill_toggle')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim202-paired" class="inv-edit-check"> ${t('battlesim202.ui.paired_toggle')}</label>
            </div>
            <div id="sim202-side-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim202.ui.pick')}</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim202-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim202-side-pick-dropdown">
                  <ul id="sim202-side-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField(t('battlesim202.ui.skill'), 'sim202-side-skill')}
              ${_numField(t('battlesim202.ui.stamina_max'), 'sim202-side-staminamax')}
            </div>
          </div>
          <div id="sim202-status" class="bsim-status"></div>
          <div id="sim202-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim202.btn.luck_prompt')}</span>
            <button id="sim202-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim202.btn.luck_yes')}</button>
            <button id="sim202-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim202.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim202-round" class="inv-add-btn bsim-action-primary">${t('battlesim202.btn.round')}</button>
            <button id="sim202-reset" class="inv-add-btn">${t('battlesim202.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>${t('battlesim202.ui.items')}</summary>
            <div id="sim202-item-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim202-history-summary">${t('battlesim202.history.summary', { n: 0 })}</summary>
            <div id="sim202-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim202-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim202-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim202);
  document.getElementById('sim202-close').addEventListener('click', closeSim202);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim202(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim202-overlay'),
    open:  openSim202,
    close: closeSim202,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim202();
  });

  document.getElementById('sim202-round').addEventListener('click', _runRound);
  document.getElementById('sim202-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim202-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim202-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim202-provisions').addEventListener('click', _eatProvisions);
  document.getElementById('sim202-potion-use').addEventListener('click', _usePotion);

  document.getElementById('sim202-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim202.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim202-potion').addEventListener('change', e => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.potionKey = e.target.value;
    saveState();
  });

  document.getElementById('sim202-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim202-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim202-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim202-insta-win').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.instaKillOnEnemyWin = e.target.checked;
    saveState();
  });

  document.getElementById('sim202-lucky-kill').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.luckyKillOnWin = e.target.checked;
    saveState();
  });

  const ITEM_CHECKBOX_MAP = {
    'sim202-item-chainmail':    'hasChainmail',
    'sim202-item-ironshield':   'hasIronShield',
    'sim202-item-ninjasword':   'hasNinjaSword',
    'sim202-item-wingedhelmet': 'hasWingedHelmet',
  };
  document.getElementById('sim202-item-list').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    const key = ITEM_CHECKBOX_MAP[e.target.id];
    if (!key) return;
    d.player[key] = e.target.checked;
    saveState();
    _renderInputs();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim202-player-skill':      ['player', 'skill'],
    'sim202-player-skillmax':   ['player', 'skillInitial'],
    'sim202-player-stamina':    ['player', 'stamina'],
    'sim202-player-staminamax': ['player', 'staminaInitial'],
    'sim202-player-luck':       ['player', 'luck'],
    'sim202-player-luckmax':    ['player', 'luckInitial'],
    'sim202-player-atkmod':     ['player', 'attackModifier'],
    'sim202-enemy-skill':       ['enemy', 'skill'],
    'sim202-enemy-stamina':        ['enemy', 'stamina'],
    'sim202-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim202-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim202-enemy-askill':         ['player', 'instaKillEnemyAS'],
    'sim202-enemy-winhits':        ['player', 'winAfterHits'],
    'sim202-side-skill':        ['sideEnemy', 'skill'],
    'sim202-side-staminamax':   ['sideEnemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Attack modifier is the one field allowed to go negative (bare-handed/
    // disarmed/fatigue penalties are always a subtraction) - every other
    // field stays clamped to 0 or above.
    val = id === 'sim202-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim202-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim202-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim202-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim202-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim202-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim202-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim202-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim202-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim202-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim202-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim202-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim202-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim202-enemy-pick', 'sim202-enemy-pick-dropdown', enemy => {
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
  _setupEnemyAutocomplete('sim202-side-pick', 'sim202-side-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy.staminaMax = enemy.hp;
    saveState();
    _renderAll();
  });
}
