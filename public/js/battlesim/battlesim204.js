// ── Battle Simulator (Scorpion Swamp, book 204) ─────────────────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 204 only) by the caller in boot.js via
// setSim204Visible().
// To remove: delete this file, remove its import line and initSim204()/
// setSim204Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with battlesim8.js/battlesim829.js/battlesim286.js/battlesim198.js/
// battlesim199.js/battlesim200.js/battlesim186.js/battlesim201.js/
// battlesim202.js/battlesim203.js, so only remove it if all eleven are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system, same core numbers,
// Test Your Luck table and score ceilings as every other sim in this app -
// the reference's own initial-score formula (section 1, PDF pp.7-8) is
// SKILL 1d6+6, STAMINA 2d6+12, LUCK 1d6+6, the same default every other FF
// sim in this app already uses. Provisions are deliberately NOT modeled - the
// reference is explicit that the scan gives no starting quantity or meal-
// restoration rule for the Adventure Sheet's Provisions box, so inventing one
// would be a made up number, not an extracted one.
//
// attackModifier/enemyWoundDamage/pairedFight/sideEnemy/winAfterHits are
// reused exactly as books 200-203 built them - enemyWoundDamage covers the
// Giant's double-strength club (4) and Master of Spiders' poisoned wand (3);
// pairedFight/sideEnemy covers the two-simultaneous-attacker cases (Giant
// Frogs §146, Brigands §301).
//
// One genuinely new mechanic this book needed:
// - enemyStaminaFloor (numeric, 0 = off): the battle ends in a win once the
//   enemy's STAMINA reaches this floor rather than 0. Covers only the first
//   Giant fight (§12 - "If you reduce the Giant's STAMINA to 6, turn to
//   61", set the floor to 6 by hand for that encounter). The second Giant
//   fight (§211, after his beard's set alight) is a normal kill to 0 -
//   "If you kill the Giant, turn to 366" - leave the floor at 0 there.
// One extension to the existing paired-fight mechanic:
// - A third simultaneous attacker (sideEnemy2, only offered once pairedFight
//   is on) for the one three-way encounter in this book, the Swamp Orc trio
//   (§281) - all three attack every round, you choose one target, the other
//   two can wound you but can't be wounded that round.
//
// Two persistent SKILL toggles (Ranger's Helmet §219, Grimslade's gift Magic
// Sword §241) and one persistent weapon toggle that's mutually exclusive
// with the gift sword by story (Grimslade's looted jagged Magic Sword §140/
// §340, +2 instead of +1 - the core rule text is explicit only one weapon
// bonus ever applies at once, matching every other sim's precedent of
// noting this rather than enforcing it in code).
// Two single-use consumables, each modeled as an obtain-toggle plus a Use
// button rather than a numeric count, since the book only ever grants one of
// each: Healing Powder (§246/§67, +2 STAMINA) and the Mistress of Birds'
// potion (§164, restores any one chosen score to its Initial value - same
// shape as a Potion of Fortune/Strength/Skill choice, just single-dose).
//
// Deliberately NOT modeled, same precedent as every other sim in this app:
// pre-battle one-off SKILL/STAMINA losses (Master of Wolves' FIRE-route
// counterspell penalty, Grimslade's weakness CURSE, the Dwarf potion's next-
// combat-only SKILL penalty) - apply those by hand with the stat steppers
// before starting the fight. Also not modeled: the Unicorn's "exactly two
// Attack Rounds, then choose" limit (nothing stops you from choosing to
// reset after round 2 yourself), Poomchukker's narrative fatal guard
// intervention if he's reduced to 6 STAMINA or less (a scripted death, not a
// dice outcome), revisit-state rules (Bear/Ranger/Sword Trees/Slime healing
// or resetting between visits - re-enter the enemy's stats by hand), and
// every CURSE/FIRE/ICE/ILLUSION/FRIENDSHIP/GROWTH/WITHERING narrative-branch
// outcome that bypasses combat entirely rather than altering it. The Brigand
// Leader's §79 duel ("a duel to first blood only; the first successful wound
// ends it") is only half-covered: set winAfterHits to 1 for the case where
// you land first, same as any other early-stop fight, but there's no
// STAMINA-based analog for the enemy landing first - losing costs an item
// (a gem/jewel/magical artefact), not STAMINA, so that side has to be ended
// by hand rather than faked as a combat loss in the history log.
//
// All state lives in pt.sim204, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=13';
import { showAlert } from '../play.js?v=122';
import { getPlayBtnRow } from '../charsheet.js?v=89';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=72';
import { t } from '../i18n.js?v=59';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const SCORE_LABELS = { skill: 'SKILL', stamina: 'STAMINA', luck: 'LUCK' };

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim204) {
    pt.sim204 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        attackModifier: 0,
        enemyWoundDamage: 2,
        winAfterHits: 0,
        enemyStaminaFloor: 0,
        hitsLandedThisFight: 0,
        hasRangerHelmet: false,
        hasGiftSword: false,
        hasJaggedSword: false,
        hasHealingPowder: false,
        healingPowderUsed: false,
        hasMistressPotion: false,
        mistressPotionUsed: false,
        mistressPotionScore: 'stamina',
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      pairedFight: false,
      sideEnemy: { name: '', skill: 0, staminaMax: 0 },
      tripleFight: false,
      sideEnemy2: { name: '', skill: 0, staminaMax: 0 },
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim204;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.winAfterHits === undefined) d.player.winAfterHits = 0;
  if (d.player.enemyStaminaFloor === undefined) d.player.enemyStaminaFloor = 0;
  if (d.player.hitsLandedThisFight === undefined) d.player.hitsLandedThisFight = 0;
  if (d.player.hasRangerHelmet === undefined) d.player.hasRangerHelmet = false;
  if (d.player.hasGiftSword === undefined) d.player.hasGiftSword = false;
  if (d.player.hasJaggedSword === undefined) d.player.hasJaggedSword = false;
  if (d.player.hasHealingPowder === undefined) d.player.hasHealingPowder = false;
  if (d.player.healingPowderUsed === undefined) d.player.healingPowderUsed = false;
  if (d.player.hasMistressPotion === undefined) d.player.hasMistressPotion = false;
  if (d.player.mistressPotionUsed === undefined) d.player.mistressPotionUsed = false;
  if (d.player.mistressPotionScore === undefined) d.player.mistressPotionScore = 'stamina';
  if (d.pairedFight === undefined) d.pairedFight = false;
  if (!d.sideEnemy) d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
  if (d.tripleFight === undefined) d.tripleFight = false;
  if (!d.sideEnemy2) d.sideEnemy2 = { name: '', skill: 0, staminaMax: 0 };
  return d;
}

function _notReady(d) { return !d.rolled; }

function _roll2d6() { return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || 'the enemy'; }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }
function _sideEnemyNameSafe(d) { return escapeHtml(d.sideEnemy.name.trim() || 'the second attacker'); }
function _sideEnemy2NameSafe(d) { return escapeHtml(d.sideEnemy2.name.trim() || 'the third attacker'); }

function _effectiveSkill(d) {
  let skill = d.player.skill;
  if (d.player.hasRangerHelmet) skill += 1;
  if (d.player.hasGiftSword)    skill += 1;
  if (d.player.hasJaggedSword)  skill += 2;
  return skill;
}

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.winAfterHits = 0;
  d.player.enemyStaminaFloor = 0;
  d.player.hitsLandedThisFight = 0;
  d.pairedFight = false;
  d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
  d.tripleFight = false;
  d.sideEnemy2 = { name: '', skill: 0, staminaMax: 0 };
}

// Uncapped lifetime log - the admin dashboard aggregates battle counts
// app-wide from this array, so per-user history needs to be a true lifetime
// total, not a rolling window.
function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerStamina: d.player.stamina, playerStaminaMax: d.player.staminaInitial,
    ts: Date.now(),
  });
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _enemyFloor(d) { return Math.max(0, d.player.enemyStaminaFloor || 0); }

function _runRound() {
  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const floor    = _enemyFloor(d);

  const playerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, `Round ${d.roundsThisBattle}: you ${playerAS} vs ${_enemyNameSafe(d)} ${enemyAS}.`);

  if (playerAS === enemyAS) {
    _appendLog(d, 'Both blows are avoided.');
  } else if (playerAS > enemyAS) {
    d.enemy.stamina = Math.max(floor, d.enemy.stamina - 2);
    d.player.hitsLandedThisFight++;
    _appendLog(d, `You wound ${_enemyNameSafe(d)} for 2. STAMINA: ${d.enemy.stamina}/${d.enemy.staminaMax}.`);
    if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.stamina > floor) {
      d.enemy.stamina = floor;
      _appendLog(d, `You've landed enough blows to press your advantage - the fight ends here.`);
    }
    if (d.enemy.stamina > floor) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
    _appendLog(d, `${_enemyNameSafe(d)} wounds you for ${woundDmg}. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Simultaneous side attackers: fresh independent exchanges every round,
  // never woundable themselves (choose-one-target rule, §146/§281/§301).
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
  if (d.pairedFight && d.tripleFight && d.sideEnemy2.staminaMax > 0 && d.player.stamina > 0) {
    const side2PlayerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const side2AS = _roll2d6() + d.sideEnemy2.skill;
    _appendLog(d, `${_sideEnemy2NameSafe(d)} attacks separately: you ${side2PlayerAS} vs ${side2AS}.`);
    if (side2AS > side2PlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - 2);
      _appendLog(d, `${_sideEnemy2NameSafe(d)} wounds you for 2. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side2-hit' });
    } else {
      _appendLog(d, `You fend off ${_sideEnemy2NameSafe(d)}'s blow.`);
    }
  }

  if (d.enemy.stamina <= floor) {
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

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome. Same
// Lucky/Unlucky table as every other FF sim in this app.
function _testLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  const floor = _enemyFloor(d);
  if (event.kind === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(floor, d.enemy.stamina - 2);
      _appendLog(d, `Test Your Luck: ${roll} (Lucky) - the wound is worse. ${_enemyNameSafe(d)} STAMINA: ${d.enemy.stamina}/${d.enemy.staminaMax}.`);
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, `Test Your Luck: ${roll} (Unlucky) - the wound is less severe. ${_enemyNameSafe(d)} STAMINA: ${d.enemy.stamina}/${d.enemy.staminaMax}.`);
    }
    if (d.enemy.stamina <= floor) { _appendLog(d, `${SVG_TROPHY} ${_enemyNameSafe(d)} is defeated!`); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : event.kind === 'side2-hit' ? _sideEnemy2NameSafe(d) : _enemyNameSafe(d);
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

// ── Consumables ─────────────────────────────────────────────────────────────

function _useHealingPowder() {
  const d = _data();
  if (!d || _notReady(d) || !d.player.hasHealingPowder || d.player.healingPowderUsed) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert('You cannot use the Healing Powder in the middle of a fight.');
    return;
  }
  d.player.healingPowderUsed = true;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 2);
  _appendLog(d, `You test the Healing Powder on your wounds: STAMINA ${before} → ${d.player.stamina}/${d.player.staminaInitial}.`);
  saveState();
  _renderAll();
}

function _useMistressPotion() {
  const d = _data();
  if (!d || _notReady(d) || !d.player.hasMistressPotion || d.player.mistressPotionUsed) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert('You cannot drink a potion in the middle of a fight.');
    return;
  }
  d.player.mistressPotionUsed = true;
  const key   = d.player.mistressPotionScore;
  const label = SCORE_LABELS[key];
  const initialKey = `${key}Initial`;
  d.player[key] = d.player[initialKey];
  _appendLog(d, `You drink the Mistress of Birds' potion: ${label} restored to ${d.player[initialKey]}.`);
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim204-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  const floor = _enemyFloor(d);
  if (notReady)                                    el.innerHTML = 'Roll your starting SKILL, STAMINA and LUCK to begin.';
  else if (d.player.stamina <= 0)                   el.innerHTML = `${SVG_SKULL} You have fallen in battle.`;
  else if (hasEnemy && d.enemy.stamina <= floor)     el.innerHTML = `${SVG_TROPHY} Victory!`;
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= floor);
  document.getElementById('sim204-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim204-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim204-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
}

function _renderItemsHtml(d) {
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Ranger's Helmet <span class="bsim-tech-uses">(sec. 219)</span></div>
      <div class="bsim-tech-desc">Finely made helmet: +1 SKILL while retained.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim204-item-helmet" class="inv-edit-check" ${d.player.hasRangerHelmet ? 'checked' : ''}> Have it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Grimslade's Magic Sword (gift) <span class="bsim-tech-uses">(sec. 241)</span></div>
      <div class="bsim-tech-desc">+1 SKILL while wielded - only one weapon bonus applies at a time, don't also enable the jagged sword below.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim204-item-giftsword" class="inv-edit-check" ${d.player.hasGiftSword ? 'checked' : ''}> Wielding it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Grimslade's jagged Magic Sword (looted) <span class="bsim-tech-uses">(sec. 140/340)</span></div>
      <div class="bsim-tech-desc">+2 SKILL while wielded - only one weapon bonus applies at a time, don't also enable the gift sword above.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim204-item-jaggedsword" class="inv-edit-check" ${d.player.hasJaggedSword ? 'checked' : ''}> Wielding it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Healing Powder <span class="bsim-tech-uses">(sec. 246/67)</span></div>
      <div class="bsim-tech-desc">Single use: restores 2 STAMINA.</div>
      <div class="bsim-tech-footer">
        <label class="inv-edit-check-label"><input type="checkbox" id="sim204-item-powder" class="inv-edit-check" ${d.player.hasHealingPowder ? 'checked' : ''}> Have it</label>
        <button id="sim204-use-powder" class="inv-edit-done bsim-ae-roll-btn" type="button" ${(!d.player.hasHealingPowder || d.player.healingPowderUsed) ? 'disabled' : ''}>${d.player.healingPowderUsed ? 'Used' : 'Use'}</button>
      </div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Mistress of Birds' Potion <span class="bsim-tech-uses">(sec. 164)</span></div>
      <div class="bsim-tech-desc">Single use: restores any one chosen score to its Initial value.</div>
      <div class="bsim-tech-footer">
        <label class="inv-edit-check-label"><input type="checkbox" id="sim204-item-mistress" class="inv-edit-check" ${d.player.hasMistressPotion ? 'checked' : ''}> Have it</label>
        <select id="sim204-mistress-score" class="inv-edit-input bsim-select" ${(!d.player.hasMistressPotion || d.player.mistressPotionUsed) ? 'disabled' : ''}>
          <option value="skill" ${d.player.mistressPotionScore === 'skill' ? 'selected' : ''}>SKILL</option>
          <option value="stamina" ${d.player.mistressPotionScore === 'stamina' ? 'selected' : ''}>STAMINA</option>
          <option value="luck" ${d.player.mistressPotionScore === 'luck' ? 'selected' : ''}>LUCK</option>
        </select>
        <button id="sim204-use-mistress" class="inv-edit-done bsim-ae-roll-btn" type="button" ${(!d.player.hasMistressPotion || d.player.mistressPotionUsed) ? 'disabled' : ''}>${d.player.mistressPotionUsed ? 'Used' : 'Drink'}</button>
      </div>
    </div>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim204-history-summary');
  const listEl = document.getElementById('sim204-history-list');
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
  const el = document.getElementById('sim204-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim204-player-skill').value      = d.player.skill;
  document.getElementById('sim204-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim204-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim204-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim204-player-luck').value       = d.player.luck;
  document.getElementById('sim204-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim204-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim204-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? 'Rolled' : 'Roll starting SKILL/STAMINA/LUCK';

  document.getElementById('sim204-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim204-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim204-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim204-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim204-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim204-enemy-winhits').value    = d.player.winAfterHits;
  document.getElementById('sim204-enemy-floor').value      = d.player.enemyStaminaFloor;

  document.getElementById('sim204-paired').checked = d.pairedFight;
  document.getElementById('sim204-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim204-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim204-side-staminamax').value = d.sideEnemy.staminaMax;
  document.getElementById('sim204-side-fields').style.display = d.pairedFight ? '' : 'none';

  document.getElementById('sim204-triple').checked = d.tripleFight;
  document.getElementById('sim204-triple-row').style.display = d.pairedFight ? '' : 'none';
  document.getElementById('sim204-side2-pick').value = d.sideEnemy2.name;
  document.getElementById('sim204-side2-skill').value = d.sideEnemy2.skill;
  document.getElementById('sim204-side2-staminamax').value = d.sideEnemy2.staminaMax;
  document.getElementById('sim204-side2-fields').style.display = (d.pairedFight && d.tripleFight) ? '' : 'none';

  document.getElementById('sim204-item-list').innerHTML = _renderItemsHtml(d);

  const pendingEl = document.getElementById('sim204-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim204() {
  const overlay = document.getElementById('sim204-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim204(); return; }
  _renderAll();
}

function openSim204() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim204-overlay').classList.add('active');
}

function closeSim204() {
  document.getElementById('sim204-overlay')?.classList.remove('active');
}

export function setSim204Visible(visible) {
  const btn = document.getElementById('sim204-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim204();
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

export function initSim204() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim204-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">Battle Simulator</span>
        <button id="sim204-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">You</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim204-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">Roll starting SKILL/STAMINA/LUCK</button>
            </div>
            ${_numField('SKILL', 'sim204-player-skill')}
            ${_numField('Initial SKILL', 'sim204-player-skillmax')}
            ${_numField('STAMINA', 'sim204-player-stamina')}
            ${_numField('Initial STAMINA', 'sim204-player-staminamax')}
            ${_numField('LUCK', 'sim204-player-luck')}
            ${_numField('Initial LUCK', 'sim204-player-luckmax')}
            ${_numField('Attack modifier', 'sim204-player-atkmod')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">Enemy</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Pick</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim204-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim204-enemy-pick-dropdown">
                <ul id="sim204-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField('SKILL', 'sim204-enemy-skill')}
            ${_numField('STAMINA', 'sim204-enemy-stamina')}
            ${_numField('Max STAMINA', 'sim204-enemy-staminamax')}
            ${_numField('Wound damage', 'sim204-enemy-wounddmg')}
            ${_numField('Win after N landed hits (0=off)', 'sim204-enemy-winhits')}
            ${_numField('Battle ends at N STAMINA (0=normal)', 'sim204-enemy-floor')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim204-paired" class="inv-edit-check"> Second attacker fights alongside (never woundable)</label>
            </div>
            <div id="sim204-side-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">Pick</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim204-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim204-side-pick-dropdown">
                  <ul id="sim204-side-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField('SKILL', 'sim204-side-skill')}
              ${_numField('Max STAMINA', 'sim204-side-staminamax')}
              <div id="sim204-triple-row" class="inv-edit-row" style="display:none">
                <label class="inv-edit-check-label"><input type="checkbox" id="sim204-triple" class="inv-edit-check"> Third attacker also fights alongside (Swamp Orcs)</label>
              </div>
              <div id="sim204-side2-fields" style="display:none">
                <div class="inv-edit-row">
                  <span class="inv-edit-label bsim-stat-label">Pick</span>
                  <div class="autocomplete-wrap bsim-enemy-ac">
                    <input id="sim204-side2-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim204-side2-pick-dropdown">
                    <ul id="sim204-side2-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                  </div>
                </div>
                ${_numField('SKILL', 'sim204-side2-skill')}
                ${_numField('Max STAMINA', 'sim204-side2-staminamax')}
              </div>
            </div>
          </div>
          <div id="sim204-status" class="bsim-status"></div>
          <div id="sim204-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">Test Your Luck?</span>
            <button id="sim204-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">Test Luck</button>
            <button id="sim204-luck-no" class="inv-edit-done bsim-heal-btn" type="button">Skip</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim204-round" class="inv-add-btn bsim-action-primary">Round</button>
            <button id="sim204-reset" class="inv-add-btn">Reset</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>Items</summary>
            <div id="sim204-item-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim204-history-summary">Battle History (0)</summary>
            <div id="sim204-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim204-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim204-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim204);
  document.getElementById('sim204-close').addEventListener('click', closeSim204);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim204(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim204-overlay'),
    open:  openSim204,
    close: closeSim204,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim204();
  });

  document.getElementById('sim204-round').addEventListener('click', _runRound);
  document.getElementById('sim204-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim204-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim204-luck-no').addEventListener('click', _skipLuck);

  document.getElementById('sim204-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = 1 + Math.floor(Math.random() * 6) + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = 1 + Math.floor(Math.random() * 6) + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, `Starting stats rolled: SKILL ${d.player.skillInitial}, STAMINA ${d.player.staminaInitial}, LUCK ${d.player.luckInitial}.`);
    saveState();
    _renderAll();
  });

  document.getElementById('sim204-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim204-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim204-side2-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy2.name = e.target.value;
    saveState();
  });

  document.getElementById('sim204-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    if (!d.pairedFight) d.tripleFight = false;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim204-triple').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.tripleFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim204-item-list').addEventListener('click', e => {
    if (e.target.id === 'sim204-use-powder') _useHealingPowder();
    else if (e.target.id === 'sim204-use-mistress') _useMistressPotion();
  });

  const ITEM_CHECKBOX_MAP = {
    'sim204-item-helmet':      'hasRangerHelmet',
    'sim204-item-giftsword':   'hasGiftSword',
    'sim204-item-jaggedsword': 'hasJaggedSword',
    'sim204-item-powder':      'hasHealingPowder',
    'sim204-item-mistress':    'hasMistressPotion',
  };
  document.getElementById('sim204-item-list').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    if (e.target.id === 'sim204-mistress-score') {
      d.player.mistressPotionScore = e.target.value;
      saveState();
      return;
    }
    const key = ITEM_CHECKBOX_MAP[e.target.id];
    if (!key) return;
    d.player[key] = e.target.checked;
    saveState();
    _renderInputs();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim204-player-skill':      ['player', 'skill'],
    'sim204-player-skillmax':   ['player', 'skillInitial'],
    'sim204-player-stamina':    ['player', 'stamina'],
    'sim204-player-staminamax': ['player', 'staminaInitial'],
    'sim204-player-luck':       ['player', 'luck'],
    'sim204-player-luckmax':    ['player', 'luckInitial'],
    'sim204-player-atkmod':     ['player', 'attackModifier'],
    'sim204-enemy-skill':       ['enemy', 'skill'],
    'sim204-enemy-stamina':        ['enemy', 'stamina'],
    'sim204-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim204-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim204-enemy-winhits':        ['player', 'winAfterHits'],
    'sim204-enemy-floor':          ['player', 'enemyStaminaFloor'],
    'sim204-side-skill':        ['sideEnemy', 'skill'],
    'sim204-side-staminamax':   ['sideEnemy', 'staminaMax'],
    'sim204-side2-skill':       ['sideEnemy2', 'skill'],
    'sim204-side2-staminamax':  ['sideEnemy2', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Attack modifier is the one field allowed to go negative (bare-handed/
    // disarmed/fatigue penalties are always a subtraction) - every other
    // field stays clamped to 0 or above.
    val = id === 'sim204-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim204-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim204-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim204-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim204-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim204-enemy-floor') val = Math.min(val, d.enemy.staminaMax || 9999);
    d[map[0]][map[1]] = val;
    if (id === 'sim204-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim204-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim204-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim204-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim204-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim204-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim204-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim204-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim204-enemy-pick', 'sim204-enemy-pick-dropdown', enemy => {
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
  _setupEnemyAutocomplete('sim204-side-pick', 'sim204-side-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy.staminaMax = enemy.hp;
    saveState();
    _renderAll();
  });
  _setupEnemyAutocomplete('sim204-side2-pick', 'sim204-side2-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy2.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy2.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy2.staminaMax = enemy.hp;
    saveState();
    _renderAll();
  });
}
