// ── Battle Simulator (Island of the Lizard King, book 203) ──────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 203 only) by the caller in boot.js via
// setSim203Visible().
// To remove: delete this file, remove its import line and initSim203()/
// setSim203Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with battlesim8.js/battlesim829.js/battlesim286.js/battlesim198.js/
// battlesim199.js/battlesim200.js/battlesim186.js/battlesim201.js/
// battlesim202.js, so only remove it if all ten are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system, same core numbers,
// Test Your Luck table, and single-dose potion-of-three-choices setup as
// books 201/202 - reused verbatim. The fourth-pass verified reference notes
// the scan is missing the printed page with the initial dice-generation
// formula, so this uses the same default every other FF sim in this app
// uses (SKILL 1d6+6, STAMINA 2d6+12, LUCK 1d6+6).
//
// attackModifier/enemyWoundDamage/pairedFight/sideEnemy/winAfterHits are
// reused exactly as book 200/201/202 built them - they already cover every
// "-N SKILL/Attack Strength this fight" (Slime Sucker, Spit Toad, Cave
// Woman, Giant Water-Snake), every "two attackers, choose one target,
// untargeted one can wound but can't be wounded that round" case (Hydra's
// two heads, paired Lizard Men, the two Pirates), and the Lizard Man §262
// "win as soon as you land your first hit" limited encounter (winAfterHits
// = 1).
//
// Three genuinely new mechanics, all first-round-of-battle effects:
// - hasSogsHelmet (persistent item toggle): automatically win the first
//   Attack Round of ANY battle - no roll happens that round. Per the
//   reference this also cancels the Hill Troll's and Razorjaw's own
//   "lose the first round without the helmet" penalty, which falls out
//   naturally from the precedence order below (helmet is checked first).
// - enemyAutoWinFirstRound (per-encounter checkbox): the enemy automatically
//   wins the first Attack Round - no roll happens that round. Covers the
//   Hill Troll (§30) directly; if hasSogsHelmet is also on, the helmet
//   takes precedence and the round proceeds as an automatic player win
//   instead, matching "prevents the Hill Troll opening disadvantage."
// - hasClumsinessCurse (persistent item toggle, Potion of Clumsiness §311):
//   before the first Attack Round of every future battle, roll 1d6 - on a
//   1, drop the sword and automatically lose that round (same shape as
//   enemyAutoWinFirstRound, but randomized and persistent for the rest of
//   the game once triggered). Checked after the helmet (which still
//   overrides) but before the plain enemyAutoWinFirstRound knob.
// Precedence when more than one could apply on round 1: Sog's helmet wins
// outright (unconditional per the text) > Clumsiness roll > plain
// enemyAutoWinFirstRound > normal opposed roll.
//
// Two more persistent item toggles, both ongoing while-worn/wielded effects
// per the reference (not one-time score bumps, which are applied by hand
// via the Initial fields the same as every other sim in this app):
// - hasBoneCharm (Sama's bone charm, §323): LUCK can never be reduced below
//   7 by a Test Your Luck roll (or by the stat stepper, for consistency).
// - hasRingOfConfusion (§297): -2 SKILL while worn (a curse), despite also
//   being required for two narrative bypasses (Shaman Revulsion test,
//   Shape Changer trap) that this sim doesn't otherwise model.
// Two weapon toggles (Fire Sword §275, Magic Sword §392), each +2 SKILL
// while wielded - kept as toggles rather than baked into Initial SKILL like
// the book's flat one-time item rewards, since the core rules explicitly
// say only one weapon's SKILL bonus can apply at a time (same reasoning as
// book 202's Ninja Curved Sword) and a route only ever grants one of these
// two, never both. The Fire Sword's own +2 LUCK is a one-time acquisition
// bonus (no stacking-exclusivity concern for LUCK), applied via the Initial
// LUCK field by hand instead.
//
// Deliberately NOT modeled, same precedent as every other sim in this app:
// pre-battle one-off STAMINA/SKILL losses (Razorjaw's opening bite without
// the helmet, Cave Woman's failed-dodge penalty, Spit Toad's opening bite,
// the Delirious Prisoner's bare-handed penalty is covered by attackModifier
// instead since it's an ongoing per-round penalty, not a one-off loss) -
// apply those by hand with the stat steppers before starting the fight.
// Also not modeled: the post-boss Gonchong sequence (§153/188/54/244/260/
// 384) - it's a narrative branch-and-skill-check chain, not a stat battle,
// and the Shaman's 6-test gate (§397) - none of the six tests are combat
// either. Escape options are likewise left to manual stat edits.
//
// All state lives in pt.sim203, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=13';
import { showAlert } from '../play.js?v=105';
import { getPlayBtnRow } from '../charsheet.js?v=78';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=61';
import { t } from '../i18n.js?v=49';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Choose exactly one bottle (sec.9). Each bottle contains one measure, same
// single-use rule as books 201/202's potions.
const POTIONS = [
  ['skill',    'Potion of Skill'],
  ['strength', 'Potion of Strength'],
  ['fortune',  'Potion of Fortune'],
];

const MAX_PROVISIONS = 10;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim203) {
    pt.sim203 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        potionKey: 'skill', potionUsesLeft: 1,
        provisionsLeft: MAX_PROVISIONS,
        attackModifier: 0,
        enemyWoundDamage: 2,
        winAfterHits: 0,
        enemyAutoWinFirstRound: false,
        hitsLandedThisFight: 0,
        hasSogsHelmet: false,
        hasBoneCharm: false,
        hasClumsinessCurse: false,
        hasRingOfConfusion: false,
        hasFireSword: false,
        hasMagicSword: false,
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
  const d = pt.sim203;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.potionKey === undefined) d.player.potionKey = 'skill';
  if (d.player.potionUsesLeft === undefined) d.player.potionUsesLeft = 1;
  if (d.player.provisionsLeft === undefined) d.player.provisionsLeft = MAX_PROVISIONS;
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.winAfterHits === undefined) d.player.winAfterHits = 0;
  if (d.player.enemyAutoWinFirstRound === undefined) d.player.enemyAutoWinFirstRound = false;
  if (d.player.hitsLandedThisFight === undefined) d.player.hitsLandedThisFight = 0;
  if (d.player.hasSogsHelmet === undefined) d.player.hasSogsHelmet = false;
  if (d.player.hasBoneCharm === undefined) d.player.hasBoneCharm = false;
  if (d.player.hasClumsinessCurse === undefined) d.player.hasClumsinessCurse = false;
  if (d.player.hasRingOfConfusion === undefined) d.player.hasRingOfConfusion = false;
  if (d.player.hasFireSword === undefined) d.player.hasFireSword = false;
  if (d.player.hasMagicSword === undefined) d.player.hasMagicSword = false;
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

function _enemyName(d) { return d.enemy.name.trim() || 'the enemy'; }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }
function _sideEnemyNameSafe(d) { return escapeHtml(d.sideEnemy.name.trim() || 'the second attacker'); }

function _luckFloor(d) { return d.player.hasBoneCharm ? 7 : 0; }

function _effectiveSkill(d) {
  let skill = d.player.skill;
  if (d.player.hasRingOfConfusion) skill -= 2;
  if (d.player.hasFireSword)       skill += 2;
  if (d.player.hasMagicSword)      skill += 2;
  return skill;
}

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.winAfterHits = 0;
  d.player.enemyAutoWinFirstRound = false;
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

// Only ever called on round 1 of a battle. Returns 'player' (auto-win),
// 'enemy' (auto-lose), or null (roll normally) - see the header comment for
// the precedence order and why.
function _firstRoundOverride(d) {
  if (d.player.hasSogsHelmet) {
    _appendLog(d, "Sog's helmet strikes fear into your foe - you automatically win this Attack Round.");
    return 'player';
  }
  if (d.player.hasClumsinessCurse) {
    const roll = _roll1d6();
    if (roll === 1) {
      _appendLog(d, `Potion of Clumsiness: you roll ${roll} - you drop your sword and automatically lose this Attack Round.`);
      return 'enemy';
    }
    _appendLog(d, `Potion of Clumsiness: you roll ${roll} - your grip holds.`);
  }
  if (d.player.enemyAutoWinFirstRound) {
    _appendLog(d, `${_enemyNameSafe(d)}'s opening strike is too fast - it automatically wins this Attack Round.`);
    return 'enemy';
  }
  return null;
}

function _runRound() {
  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  const isFirstRound = d.roundsThisBattle === 0;
  d.roundsThisBattle++;

  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const override = isFirstRound ? _firstRoundOverride(d) : null;

  let playerWins = false, tie = false;
  if (override === 'player') {
    playerWins = true;
  } else if (override === 'enemy') {
    playerWins = false;
  } else {
    const playerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const enemyAS  = _roll2d6() + d.enemy.skill;
    _appendLog(d, `Round ${d.roundsThisBattle}: you ${playerAS} vs ${_enemyNameSafe(d)} ${enemyAS}.`);
    if (playerAS === enemyAS) tie = true;
    else playerWins = playerAS > enemyAS;
  }

  if (tie) {
    _appendLog(d, 'Both blows are avoided.');
  } else if (playerWins) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
    d.player.hitsLandedThisFight++;
    _appendLog(d, `You wound ${_enemyNameSafe(d)} for 2. STAMINA: ${d.enemy.stamina}/${d.enemy.staminaMax}.`);
    if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.stamina > 0) {
      d.enemy.stamina = 0;
      _appendLog(d, `You've landed enough blows to press your advantage - the fight ends here.`);
    }
    if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
    _appendLog(d, `${_enemyNameSafe(d)} wounds you for ${woundDmg}. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Paired fight: a second, independent exchange with its own fresh player
  // roll every round (including round 1 - the first-round override above
  // only ever applies to the main exchange) - covers the Hydra's two heads,
  // paired Lizard Men, and the two Pirates. The side attacker is never
  // wounded through this path, matching the literal "untargeted one can
  // wound but cannot be wounded that round" rule.
  if (d.pairedFight && d.sideEnemy.staminaMax > 0 && d.player.stamina > 0) {
    const sidePlayerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    _appendLog(d, `${_sideEnemyNameSafe(d)} attacks separately: you ${sidePlayerAS} vs ${sideAS}.`);
    if (sideAS > sidePlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - 2);
      _appendLog(d, `${_sideEnemyNameSafe(d)} wounds you for 2. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side-hit' });
    } else {
      _appendLog(d, `You fend off ${_sideEnemyNameSafe(d)}'s blow.`);
    }
  }

  if (d.enemy.stamina <= 0) {
    _appendLog(d, `${SVG_TROPHY} ${_enemyNameSafe(d)} is defeated!`);
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, `${SVG_SKULL} You have fallen in battle.`);
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome
// (floored at 7 instead of 0 if Sama's bone charm is carried). Same
// Lucky/Unlucky table as every other FF sim in this app.
function _testLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(_luckFloor(d), d.player.luck - 1);
  if (event.kind === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
      _appendLog(d, `Test Your Luck: ${roll} (Lucky) - the wound is worse. ${_enemyNameSafe(d)} STAMINA: ${d.enemy.stamina}/${d.enemy.staminaMax}.`);
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, `Test Your Luck: ${roll} (Unlucky) - the wound is less severe. ${_enemyNameSafe(d)} STAMINA: ${d.enemy.stamina}/${d.enemy.staminaMax}.`);
    }
    if (d.enemy.stamina <= 0) { _appendLog(d, `${SVG_TROPHY} ${_enemyNameSafe(d)} is defeated!`); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, `Test Your Luck: ${roll} (Lucky) - ${source}'s wound is less severe. Your STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, `Test Your Luck: ${roll} (Unlucky) - ${source}'s wound is worse. Your STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, `${SVG_SKULL} You have fallen in battle.`);
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
  d.player.hitsLandedThisFight = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, '──────────');
  _appendLog(d, `Battle reset. ${_enemyNameSafe(d)}'s STAMINA and yours are restored.`);
  saveState();
  _renderAll();
}

// ── Provisions / Potions ────────────────────────────────────────────────────

function _eatProvisions() {
  const d = _data();
  if (!d || _notReady(d)) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert('You cannot eat Provisions in the middle of a fight.');
    return;
  }
  if (d.player.provisionsLeft <= 0) return;
  if (d.player.stamina >= d.player.staminaInitial) {
    showAlert('Your STAMINA is already full.');
    return;
  }
  d.player.provisionsLeft--;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 4);
  _appendLog(d, `You eat some Provisions: STAMINA ${before} → ${d.player.stamina}/${d.player.staminaInitial}.`);
  saveState();
  _renderAll();
}

function _usePotion() {
  const d = _data();
  if (!d || _notReady(d) || d.player.potionUsesLeft <= 0) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert('You cannot drink a potion in the middle of a fight.');
    return;
  }
  d.player.potionUsesLeft--;
  if (d.player.potionKey === 'skill') {
    d.player.skill = d.player.skillInitial;
    _appendLog(d, `You drink the Potion of Skill: SKILL restored to ${d.player.skillInitial}.`);
  } else if (d.player.potionKey === 'strength') {
    d.player.stamina = d.player.staminaInitial;
    _appendLog(d, `You drink the Potion of Strength: STAMINA restored to ${d.player.staminaInitial}.`);
  } else {
    d.player.luckInitial += 1;
    d.player.luck = d.player.luckInitial;
    _appendLog(d, `You drink the Potion of Fortune: Initial LUCK is now ${d.player.luckInitial}, LUCK refilled.`);
  }
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim203-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = 'Roll your starting SKILL, STAMINA and LUCK to begin.';
  else if (d.player.stamina <= 0)                   el.innerHTML = `${SVG_SKULL} You have fallen in battle.`;
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = `${SVG_TROPHY} Victory!`;
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim203-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim203-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim203-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim203-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
}

function _renderItemsHtml(d) {
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Sog's Golden Winged Helmet <span class="bsim-tech-uses">(sec. 5)</span></div>
      <div class="bsim-tech-desc">Automatically win the first Attack Round of every battle. Also cancels the Hill Troll's and Razorjaw's own opening-round penalty.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim203-item-helmet" class="inv-edit-check" ${d.player.hasSogsHelmet ? 'checked' : ''}> Have it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Sama's Bone Charm <span class="bsim-tech-uses">(sec. 323)</span></div>
      <div class="bsim-tech-desc">Permanent effect: your LUCK score will never fall below 7.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim203-item-charm" class="inv-edit-check" ${d.player.hasBoneCharm ? 'checked' : ''}> Have it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Potion of Clumsiness <span class="bsim-tech-uses">(sec. 311)</span></div>
      <div class="bsim-tech-desc">Cursed for the rest of the game: before the first Attack Round of every future battle, roll 1 die - on a 1, you drop your sword and automatically lose that round.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim203-item-clumsy" class="inv-edit-check" ${d.player.hasClumsinessCurse ? 'checked' : ''}> Cursed</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Ring of Confusion <span class="bsim-tech-uses">(sec. 297)</span></div>
      <div class="bsim-tech-desc">Cursed: -2 SKILL while worn.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim203-item-ring" class="inv-edit-check" ${d.player.hasRingOfConfusion ? 'checked' : ''}> Wearing it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Fire Sword <span class="bsim-tech-uses">(sec. 275)</span></div>
      <div class="bsim-tech-desc">+2 SKILL while wielded - only one weapon bonus applies at a time, don't also enable Magic Sword. (Its own +2 LUCK is a one-time bonus - add that to Initial LUCK by hand instead.)</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim203-item-firesword" class="inv-edit-check" ${d.player.hasFireSword ? 'checked' : ''}> Wielding it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Magic Sword <span class="bsim-tech-uses">(sec. 392)</span></div>
      <div class="bsim-tech-desc">+2 SKILL while wielded - only one weapon bonus applies at a time, don't also enable Fire Sword.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim203-item-magicsword" class="inv-edit-check" ${d.player.hasMagicSword ? 'checked' : ''}> Wielding it</label></div>
    </div>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim203-history-summary');
  const listEl = document.getElementById('sim203-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = `Battle History (${d.history.length})`;
  if (!d.history.length) {
    listEl.innerHTML = '<div class="bsim-history-empty">No finished battles yet.</div>';
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? 'won' : 'lost';
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim203-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim203-player-skill').value      = d.player.skill;
  document.getElementById('sim203-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim203-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim203-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim203-player-luck').value       = d.player.luck;
  document.getElementById('sim203-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim203-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim203-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? 'Rolled' : 'Roll starting SKILL/STAMINA/LUCK';

  const potionSel = document.getElementById('sim203-potion');
  potionSel.value = d.player.potionKey;
  potionSel.disabled = d.rolled;
  document.getElementById('sim203-potion-uses').textContent = `${d.player.potionUsesLeft} use(s) left`;
  document.getElementById('sim203-potion-use').disabled =
    _notReady(d) || d.player.potionUsesLeft <= 0 ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);

  document.getElementById('sim203-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim203-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim203-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim203-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim203-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim203-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim203-enemy-winhits').value    = d.player.winAfterHits;
  document.getElementById('sim203-enemy-firstwin').checked = d.player.enemyAutoWinFirstRound;

  document.getElementById('sim203-paired').checked = d.pairedFight;
  document.getElementById('sim203-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim203-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim203-side-staminamax').value = d.sideEnemy.staminaMax;
  document.getElementById('sim203-side-fields').style.display = d.pairedFight ? '' : 'none';

  document.getElementById('sim203-item-list').innerHTML = _renderItemsHtml(d);

  const pendingEl = document.getElementById('sim203-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim203() {
  const overlay = document.getElementById('sim203-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim203(); return; }
  _renderAll();
}

function openSim203() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim203-overlay').classList.add('active');
}

function closeSim203() {
  document.getElementById('sim203-overlay')?.classList.remove('active');
}

export function setSim203Visible(visible) {
  const btn = document.getElementById('sim203-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim203();
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

export function initSim203() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim203-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">Battle Simulator</span>
        <button id="sim203-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">You</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim203-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">Roll starting SKILL/STAMINA/LUCK</button>
            </div>
            ${_numField('SKILL', 'sim203-player-skill')}
            ${_numField('Initial SKILL', 'sim203-player-skillmax')}
            ${_numField('STAMINA', 'sim203-player-stamina')}
            ${_numField('Initial STAMINA', 'sim203-player-staminamax')}
            ${_numField('LUCK', 'sim203-player-luck')}
            ${_numField('Initial LUCK', 'sim203-player-luckmax')}
            ${_numField('Attack modifier', 'sim203-player-atkmod')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Potion</span>
              <select id="sim203-potion" class="inv-edit-input bsim-select">
                ${POTIONS.map(p => `<option value="${p[0]}">${escapeHtml(p[1])}</option>`).join('')}
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span id="sim203-potion-uses" class="bsim-ae-display"></span>
              <button id="sim203-potion-use" class="inv-edit-done bsim-ae-roll-btn" type="button">Drink</button>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">Provisions</span>
              <span id="sim203-provisions-left" class="bsim-ae-display"></span>
              <button id="sim203-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">Eat (+4 STAMINA)</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">Enemy</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Pick</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim203-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim203-enemy-pick-dropdown">
                <ul id="sim203-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField('SKILL', 'sim203-enemy-skill')}
            ${_numField('STAMINA', 'sim203-enemy-stamina')}
            ${_numField('Max STAMINA', 'sim203-enemy-staminamax')}
            ${_numField('Wound damage', 'sim203-enemy-wounddmg')}
            ${_numField('Win after N landed hits (0=off)', 'sim203-enemy-winhits')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim203-enemy-firstwin" class="inv-edit-check"> Enemy automatically wins the first Attack Round</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim203-paired" class="inv-edit-check"> Second attacker fights alongside (never woundable)</label>
            </div>
            <div id="sim203-side-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">Pick</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim203-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim203-side-pick-dropdown">
                  <ul id="sim203-side-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField('SKILL', 'sim203-side-skill')}
              ${_numField('Max STAMINA', 'sim203-side-staminamax')}
            </div>
          </div>
          <div id="sim203-status" class="bsim-status"></div>
          <div id="sim203-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">Test Your Luck?</span>
            <button id="sim203-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">Test Luck</button>
            <button id="sim203-luck-no" class="inv-edit-done bsim-heal-btn" type="button">Skip</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim203-round" class="inv-add-btn bsim-action-primary">Round</button>
            <button id="sim203-reset" class="inv-add-btn">Reset</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>Items</summary>
            <div id="sim203-item-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim203-history-summary">Battle History (0)</summary>
            <div id="sim203-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim203-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim203-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim203);
  document.getElementById('sim203-close').addEventListener('click', closeSim203);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim203(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim203-overlay'),
    open:  openSim203,
    close: closeSim203,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim203();
  });

  document.getElementById('sim203-round').addEventListener('click', _runRound);
  document.getElementById('sim203-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim203-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim203-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim203-provisions').addEventListener('click', _eatProvisions);
  document.getElementById('sim203-potion-use').addEventListener('click', _usePotion);

  document.getElementById('sim203-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, `Starting stats rolled: SKILL ${d.player.skillInitial}, STAMINA ${d.player.staminaInitial}, LUCK ${d.player.luckInitial}.`);
    saveState();
    _renderAll();
  });

  document.getElementById('sim203-potion').addEventListener('change', e => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.potionKey = e.target.value;
    saveState();
  });

  document.getElementById('sim203-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim203-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim203-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim203-enemy-firstwin').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.enemyAutoWinFirstRound = e.target.checked;
    saveState();
  });

  const ITEM_CHECKBOX_MAP = {
    'sim203-item-helmet':     'hasSogsHelmet',
    'sim203-item-charm':      'hasBoneCharm',
    'sim203-item-clumsy':     'hasClumsinessCurse',
    'sim203-item-ring':       'hasRingOfConfusion',
    'sim203-item-firesword':  'hasFireSword',
    'sim203-item-magicsword': 'hasMagicSword',
  };
  document.getElementById('sim203-item-list').addEventListener('change', e => {
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
    'sim203-player-skill':      ['player', 'skill'],
    'sim203-player-skillmax':   ['player', 'skillInitial'],
    'sim203-player-stamina':    ['player', 'stamina'],
    'sim203-player-staminamax': ['player', 'staminaInitial'],
    'sim203-player-luck':       ['player', 'luck'],
    'sim203-player-luckmax':    ['player', 'luckInitial'],
    'sim203-player-atkmod':     ['player', 'attackModifier'],
    'sim203-enemy-skill':       ['enemy', 'skill'],
    'sim203-enemy-stamina':        ['enemy', 'stamina'],
    'sim203-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim203-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim203-enemy-winhits':        ['player', 'winAfterHits'],
    'sim203-side-skill':        ['sideEnemy', 'skill'],
    'sim203-side-staminamax':   ['sideEnemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Attack modifier is the one field allowed to go negative (bare-handed/
    // disarmed/fatigue penalties are always a subtraction) - every other
    // field stays clamped to 0 or above (LUCK's own floor is Sama's bone
    // charm's 7-instead-of-0, same as the automatic Test Your Luck clamp).
    val = id === 'sim203-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim203-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim203-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim203-player-luck') val = Math.max(_luckFloor(d), Math.min(val, d.player.luckInitial));
    if (id === 'sim203-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim203-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim203-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim203-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim203-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim203-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim203-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim203-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim203-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim203-enemy-pick', 'sim203-enemy-pick-dropdown', enemy => {
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
  _setupEnemyAutocomplete('sim203-side-pick', 'sim203-side-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy.staminaMax = enemy.hp;
    saveState();
    _renderAll();
  });
}
