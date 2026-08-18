// ── Battle Simulator (Caverns of the Snow Witch, book 205) ──────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 205 only) by the caller in boot.js via
// setSim205Visible().
// To remove: delete this file, remove its import line and initSim205()/
// setSim205Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with battlesim8.js/battlesim829.js/battlesim286.js/battlesim198.js/
// battlesim199.js/battlesim200.js/battlesim186.js/battlesim201.js/
// battlesim202.js/battlesim203.js/battlesim204.js, so only remove it if all
// twelve are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system, same core numbers,
// Test Your Luck table, score ceilings, single-dose potion-of-three-choices
// starting item, and Provisions mechanic (10 meals, +4 STAMINA each, outside
// battle only) as books 201-203 - all reused verbatim, the reference gives
// every one of these explicitly (unlike book 204, which was missing the
// Provisions numbers entirely).
//
// attackModifier/enemyWoundDamage/pairedFight/sideEnemy/winAfterHits/
// enemyStaminaFloor are reused exactly as books 200-204 built them -
// enemyStaminaFloor covers the Mountain Elf (§17/§382), who stops at 2
// STAMINA rather than 0; pairedFight/sideEnemy covers the book's three
// simultaneous-pair encounters (Hill Trolls §13/§296, Zombies §262);
// attackModifier covers the book's several persistent per-fight SKILL/Attack
// Strength penalties (Night Stalker's -2 Attack Strength every round from
// darkness, bare-handed Goblins' -3 Attack Strength, the §357 Frost Giant
// variant's -2 Attack Strength every round) - apply those by hand with the
// stepper when starting the relevant fight.
//
// Three genuinely new mechanics, all recurring per-round effects rather than
// first-round-only or persistent-item ones:
// - bansheeFearCheck (per-encounter checkbox): before EVERY Attack Round
//   (not just the first), roll 2d6 against effective SKILL - fail (roll >
//   SKILL) auto-loses that round with no exchange rolled at all, matching
//   the Banshee's (§185) explicit "2d6 <= SKILL or automatically lose that
//   Attack Round" rule, which the reference is clear applies every round of
//   that fight, not once.
// - iceDemonGas (per-encounter checkbox): after every round resolves
//   (regardless of who won it), roll 1d6 - on 1-3 the freezing gas lands for
//   an extra -1 STAMINA. Covers both Ice Demon encounters (§108/§143), which
//   share the identical rule.
// - whiteDragonBreath (per-encounter checkbox, only meaningful for the
//   White Dragon §223): after every round resolves, roll 1d6 - on 1-2 the
//   freezing breath lands for an extra -2 STAMINA, unless hasGoldRing is on
//   (the ring's magic resistance to freezing cold blocks it entirely per the
//   item table).
//
// Seven persistent equipment toggles. Six give an ongoing SKILL bonus while
// worn/wielded (not a one-time score bump, which is applied by hand via the
// Initial fields like every other sim in this app): Sword of Speed and
// Troll's magnificent sword (+1 SKILL each, both weapons - the core
// one-weapon rule means don't enable both at once, same precedent as every
// other sim's weapon toggles), Copper Armband (§293, +4 SKILL), Amulet of
// Courage (+2 SKILL), Horned Centaur Helmet (+1 SKILL), and Shield (+1 SKILL). The
// seventh, Gold Ring, gives no SKILL bonus - it only gates whiteDragonBreath
// above; its own one-time +1 LUCK (also listed as a plain score change, like
// most of this book's item bonuses) goes through the Initial LUCK stepper by
// hand instead, same as every other one-off LUCK gain in this book.
//
// Deliberately NOT modeled, same precedent as every other sim in this app:
// the dozens of one-off SKILL/STAMINA/LUCK score changes in the reference's
// section 6 (Potion of Health, the Snow Witch anti-cold potion, the withered
// rose, and every other named or unnamed one-time gain/loss) - apply those
// by hand with the steppers when you reach them, same as Provisions/starting
// potion cover the two mechanics that actually repeat. Also not modeled: the
// Crystal Warrior's edged-weapons-useless gate (by the time you're fighting
// it you already have the war-hammer, so it's just a normal 11/13 fight),
// the Death Hawk's exactly-2-rounds-then-Ash-shoots resolution (stop the
// fight yourself after round 2 and continue in the book), the Snow Witch's
// Discs game and Vampire-form/globe endgame sequence (narrative branches and
// checks, not a stat battle), and every other Luck/SKILL/dice check listed
// in the reference that resolves a puzzle or narrative branch rather than
// combat.
//
// All state lives in pt.sim205, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=13';
import { showAlert } from '../play.js?v=143';
import { getPlayBtnRow } from '../charsheet.js?v=96';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=79';
import { t } from '../i18n.js?v=64';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Choose exactly one bottle (sec.10). Each bottle contains one measure, same
// single-use rule as books 201-203's potions.
const POTIONS = [
  ['skill',    'Potion of Skill'],
  ['strength', 'Potion of Strength'],
  ['fortune',  'Potion of Fortune'],
];

const MAX_PROVISIONS = 10;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim205) {
    pt.sim205 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        potionKey: 'skill', potionUsesLeft: 1,
        provisionsLeft: MAX_PROVISIONS,
        attackModifier: 0,
        enemyWoundDamage: 2,
        winAfterHits: 0,
        enemyStaminaFloor: 0,
        hitsLandedThisFight: 0,
        bansheeFearCheck: false,
        iceDemonGas: false,
        whiteDragonBreath: false,
        hasGoldRing: false,
        hasSwordOfSpeed: false,
        hasTrollSword: false,
        hasCopperArmband: false,
        hasAmuletOfCourage: false,
        hasHornedHelmet: false,
        hasShield: false,
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
  const d = pt.sim205;
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
  if (d.player.enemyStaminaFloor === undefined) d.player.enemyStaminaFloor = 0;
  if (d.player.hitsLandedThisFight === undefined) d.player.hitsLandedThisFight = 0;
  if (d.player.bansheeFearCheck === undefined) d.player.bansheeFearCheck = false;
  if (d.player.iceDemonGas === undefined) d.player.iceDemonGas = false;
  if (d.player.whiteDragonBreath === undefined) d.player.whiteDragonBreath = false;
  if (d.player.hasGoldRing === undefined) d.player.hasGoldRing = false;
  if (d.player.hasSwordOfSpeed === undefined) d.player.hasSwordOfSpeed = false;
  if (d.player.hasTrollSword === undefined) d.player.hasTrollSword = false;
  if (d.player.hasCopperArmband === undefined) d.player.hasCopperArmband = false;
  if (d.player.hasAmuletOfCourage === undefined) d.player.hasAmuletOfCourage = false;
  if (d.player.hasHornedHelmet === undefined) d.player.hasHornedHelmet = false;
  if (d.player.hasShield === undefined) d.player.hasShield = false;
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

function _effectiveSkill(d) {
  let skill = d.player.skill;
  if (d.player.hasSwordOfSpeed)     skill += 1;
  if (d.player.hasTrollSword)       skill += 1;
  if (d.player.hasCopperArmband)    skill += 4;
  if (d.player.hasAmuletOfCourage)  skill += 2;
  if (d.player.hasHornedHelmet)     skill += 1;
  if (d.player.hasShield)           skill += 1;
  return skill;
}

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.winAfterHits = 0;
  d.player.enemyStaminaFloor = 0;
  d.player.hitsLandedThisFight = 0;
  d.player.bansheeFearCheck = false;
  d.player.iceDemonGas = false;
  d.player.whiteDragonBreath = false;
  d.pairedFight = false;
  d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
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

// Banshee (§185): before EVERY Attack Round, 2d6 <= SKILL or automatically
// lose that round with no exchange rolled at all. Returns true if the round
// was auto-lost (caller skips the normal roll).
function _bansheeCheck(d) {
  if (!d.player.bansheeFearCheck) return false;
  const roll = _roll2d6();
  const skill = _effectiveSkill(d);
  if (roll <= skill) {
    _appendLog(d, `Banshee fear check: ${roll} vs SKILL ${skill} - you hold your nerve.`);
    return false;
  }
  _appendLog(d, `Banshee fear check: ${roll} vs SKILL ${skill} - fear grips you, automatically losing this Attack Round.`);
  return true;
}

// Ice Demon (§108/§143) and White Dragon (§223): an extra per-round damage
// roll independent of the normal exchange's outcome, applied after it
// resolves (as long as the player is still standing).
function _extraRoundEffects(d) {
  if (d.player.iceDemonGas && d.player.stamina > 0) {
    const roll = _roll1d6();
    if (roll <= 3) {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, `Freezing gas: ${roll} - it hits you for an extra 1 STAMINA. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
    } else {
      _appendLog(d, `Freezing gas: ${roll} - it misses.`);
    }
  }
  if (d.player.whiteDragonBreath && d.player.stamina > 0) {
    const roll = _roll1d6();
    if (roll <= 2 && !d.player.hasGoldRing) {
      d.player.stamina = Math.max(0, d.player.stamina - 2);
      _appendLog(d, `Freezing breath: ${roll} - it hits you for an extra 2 STAMINA. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
    } else if (roll <= 2) {
      _appendLog(d, `Freezing breath: ${roll} - your gold ring's resistance blocks it.`);
    } else {
      _appendLog(d, `Freezing breath: ${roll} - it misses.`);
    }
  }
}

function _runRound() {
  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const floor    = _enemyFloor(d);
  const bansheeLoss = _bansheeCheck(d);

  let playerWins = false, tie = false;
  if (bansheeLoss) {
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

  // Simultaneous side attacker: fresh independent exchange every round,
  // never woundable itself (choose-one-target rule, §13/§262/§296).
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

  if (d.player.stamina > 0) _extraRoundEffects(d);

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
  const el = document.getElementById('sim205-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  const floor = _enemyFloor(d);
  if (notReady)                                    el.innerHTML = 'Roll your starting SKILL, STAMINA and LUCK to begin.';
  else if (d.player.stamina <= 0)                   el.innerHTML = `${SVG_SKULL} You have fallen in battle.`;
  else if (hasEnemy && d.enemy.stamina <= floor)     el.innerHTML = `${SVG_TROPHY} Victory!`;
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= floor);
  document.getElementById('sim205-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim205-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim205-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim205-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
}

function _renderItemsHtml(d) {
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Gold Ring <span class="bsim-tech-uses">(sec. 21/223)</span></div>
      <div class="bsim-tech-desc">Magic resistance to freezing cold - blocks the White Dragon's extra breath damage below. Its one-time +1 LUCK isn't applied by this toggle - add it to Initial LUCK by hand when you find it.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim205-item-goldring" class="inv-edit-check" ${d.player.hasGoldRing ? 'checked' : ''}> Wearing it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Sword of Speed <span class="bsim-tech-uses">(sec. 237)</span></div>
      <div class="bsim-tech-desc">+1 SKILL while wielded - only one weapon bonus applies at a time, don't also enable the Troll's sword.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim205-item-swordofspeed" class="inv-edit-check" ${d.player.hasSwordOfSpeed ? 'checked' : ''}> Wielding it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Troll's Magnificent Sword <span class="bsim-tech-uses">(sec. 164)</span></div>
      <div class="bsim-tech-desc">+1 SKILL while wielded - only one weapon bonus applies at a time, don't also enable the Sword of Speed.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim205-item-trollsword" class="inv-edit-check" ${d.player.hasTrollSword ? 'checked' : ''}> Wielding it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Copper Armband <span class="bsim-tech-uses">(sec. 293)</span></div>
      <div class="bsim-tech-desc">"Strength is Power": +4 SKILL while worn.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim205-item-armband" class="inv-edit-check" ${d.player.hasCopperArmband ? 'checked' : ''}> Wearing it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Amulet of Courage <span class="bsim-tech-uses">(sec. 327)</span></div>
      <div class="bsim-tech-desc">+2 SKILL while worn. Also protects against the Brain Slayer's hypnosis.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim205-item-amulet" class="inv-edit-check" ${d.player.hasAmuletOfCourage ? 'checked' : ''}> Wearing it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Horned Centaur Helmet <span class="bsim-tech-uses">(sec. 362)</span></div>
      <div class="bsim-tech-desc">+1 SKILL while worn. Also prevents a fatal fall injury.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim205-item-helmet" class="inv-edit-check" ${d.player.hasHornedHelmet ? 'checked' : ''}> Wearing it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Shield <span class="bsim-tech-uses">(various)</span></div>
      <div class="bsim-tech-desc">+1 SKILL while carried.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim205-item-shield" class="inv-edit-check" ${d.player.hasShield ? 'checked' : ''}> Carrying it</label></div>
    </div>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim205-history-summary');
  const listEl = document.getElementById('sim205-history-list');
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
  const el = document.getElementById('sim205-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim205-player-skill').value      = d.player.skill;
  document.getElementById('sim205-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim205-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim205-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim205-player-luck').value       = d.player.luck;
  document.getElementById('sim205-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim205-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim205-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? 'Rolled' : 'Roll starting SKILL/STAMINA/LUCK';

  const potionSel = document.getElementById('sim205-potion');
  potionSel.value = d.player.potionKey;
  potionSel.disabled = d.rolled;
  document.getElementById('sim205-potion-uses').textContent = `${d.player.potionUsesLeft} use(s) left`;
  document.getElementById('sim205-potion-use').disabled =
    _notReady(d) || d.player.potionUsesLeft <= 0 ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);

  document.getElementById('sim205-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim205-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim205-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim205-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim205-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim205-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim205-enemy-winhits').value    = d.player.winAfterHits;
  document.getElementById('sim205-enemy-floor').value      = d.player.enemyStaminaFloor;
  document.getElementById('sim205-enemy-banshee').checked  = d.player.bansheeFearCheck;
  document.getElementById('sim205-enemy-icedemon').checked = d.player.iceDemonGas;
  document.getElementById('sim205-enemy-dragon').checked   = d.player.whiteDragonBreath;

  document.getElementById('sim205-paired').checked = d.pairedFight;
  document.getElementById('sim205-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim205-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim205-side-staminamax').value = d.sideEnemy.staminaMax;
  document.getElementById('sim205-side-fields').style.display = d.pairedFight ? '' : 'none';

  document.getElementById('sim205-item-list').innerHTML = _renderItemsHtml(d);

  const pendingEl = document.getElementById('sim205-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim205() {
  const overlay = document.getElementById('sim205-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim205(); return; }
  _renderAll();
}

function openSim205() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim205-overlay').classList.add('active');
}

function closeSim205() {
  document.getElementById('sim205-overlay')?.classList.remove('active');
}

export function setSim205Visible(visible) {
  const btn = document.getElementById('sim205-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim205();
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

export function initSim205() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim205-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">Battle Simulator</span>
        <button id="sim205-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">You</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim205-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">Roll starting SKILL/STAMINA/LUCK</button>
            </div>
            ${_numField('SKILL', 'sim205-player-skill')}
            ${_numField('Initial SKILL', 'sim205-player-skillmax')}
            ${_numField('STAMINA', 'sim205-player-stamina')}
            ${_numField('Initial STAMINA', 'sim205-player-staminamax')}
            ${_numField('LUCK', 'sim205-player-luck')}
            ${_numField('Initial LUCK', 'sim205-player-luckmax')}
            ${_numField('Attack modifier', 'sim205-player-atkmod')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Potion</span>
              <select id="sim205-potion" class="inv-edit-input bsim-select">
                ${POTIONS.map(p => `<option value="${p[0]}">${escapeHtml(p[1])}</option>`).join('')}
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span id="sim205-potion-uses" class="bsim-ae-display"></span>
              <button id="sim205-potion-use" class="inv-edit-done bsim-ae-roll-btn" type="button">Drink</button>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">Provisions</span>
              <span id="sim205-provisions-left" class="bsim-ae-display"></span>
              <button id="sim205-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">Eat (+4 STAMINA)</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">Enemy</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Pick</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim205-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim205-enemy-pick-dropdown">
                <ul id="sim205-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField('SKILL', 'sim205-enemy-skill')}
            ${_numField('STAMINA', 'sim205-enemy-stamina')}
            ${_numField('Max STAMINA', 'sim205-enemy-staminamax')}
            ${_numField('Wound damage', 'sim205-enemy-wounddmg')}
            ${_numField('Win after N landed hits (0=off)', 'sim205-enemy-winhits')}
            ${_numField('Battle ends at N STAMINA (0=normal)', 'sim205-enemy-floor')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim205-enemy-banshee" class="inv-edit-check"> Banshee fear check every round (2d6 &le; SKILL or auto-lose)</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim205-enemy-icedemon" class="inv-edit-check"> Ice Demon freezing gas (1d6 each round, 1-3 = extra -1 STAMINA)</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim205-enemy-dragon" class="inv-edit-check"> White Dragon freezing breath (1d6 each round, 1-2 = extra -2 STAMINA)</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim205-paired" class="inv-edit-check"> Second attacker fights alongside (never woundable)</label>
            </div>
            <div id="sim205-side-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">Pick</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim205-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim205-side-pick-dropdown">
                  <ul id="sim205-side-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField('SKILL', 'sim205-side-skill')}
              ${_numField('Max STAMINA', 'sim205-side-staminamax')}
            </div>
          </div>
          <div id="sim205-status" class="bsim-status"></div>
          <div id="sim205-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">Test Your Luck?</span>
            <button id="sim205-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">Test Luck</button>
            <button id="sim205-luck-no" class="inv-edit-done bsim-heal-btn" type="button">Skip</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim205-round" class="inv-add-btn bsim-action-primary">Round</button>
            <button id="sim205-reset" class="inv-add-btn">Reset</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>Items</summary>
            <div id="sim205-item-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim205-history-summary">Battle History (0)</summary>
            <div id="sim205-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim205-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim205-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim205);
  document.getElementById('sim205-close').addEventListener('click', closeSim205);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim205(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim205-overlay'),
    open:  openSim205,
    close: closeSim205,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim205();
  });

  document.getElementById('sim205-round').addEventListener('click', _runRound);
  document.getElementById('sim205-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim205-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim205-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim205-provisions').addEventListener('click', _eatProvisions);
  document.getElementById('sim205-potion-use').addEventListener('click', _usePotion);

  document.getElementById('sim205-roll').addEventListener('click', () => {
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

  document.getElementById('sim205-potion').addEventListener('change', e => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.potionKey = e.target.value;
    saveState();
  });

  document.getElementById('sim205-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim205-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim205-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim205-enemy-banshee').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.bansheeFearCheck = e.target.checked;
    saveState();
  });
  document.getElementById('sim205-enemy-icedemon').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.iceDemonGas = e.target.checked;
    saveState();
  });
  document.getElementById('sim205-enemy-dragon').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.whiteDragonBreath = e.target.checked;
    saveState();
  });

  const ITEM_CHECKBOX_MAP = {
    'sim205-item-goldring':     'hasGoldRing',
    'sim205-item-swordofspeed': 'hasSwordOfSpeed',
    'sim205-item-trollsword':   'hasTrollSword',
    'sim205-item-armband':      'hasCopperArmband',
    'sim205-item-amulet':       'hasAmuletOfCourage',
    'sim205-item-helmet':       'hasHornedHelmet',
    'sim205-item-shield':       'hasShield',
  };
  document.getElementById('sim205-item-list').addEventListener('change', e => {
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
    'sim205-player-skill':      ['player', 'skill'],
    'sim205-player-skillmax':   ['player', 'skillInitial'],
    'sim205-player-stamina':    ['player', 'stamina'],
    'sim205-player-staminamax': ['player', 'staminaInitial'],
    'sim205-player-luck':       ['player', 'luck'],
    'sim205-player-luckmax':    ['player', 'luckInitial'],
    'sim205-player-atkmod':     ['player', 'attackModifier'],
    'sim205-enemy-skill':       ['enemy', 'skill'],
    'sim205-enemy-stamina':        ['enemy', 'stamina'],
    'sim205-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim205-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim205-enemy-winhits':        ['player', 'winAfterHits'],
    'sim205-enemy-floor':          ['player', 'enemyStaminaFloor'],
    'sim205-side-skill':        ['sideEnemy', 'skill'],
    'sim205-side-staminamax':   ['sideEnemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Attack modifier is the one field allowed to go negative (bare-handed/
    // darkness/fatigue penalties are always a subtraction) - every other
    // field stays clamped to 0 or above.
    val = id === 'sim205-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim205-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim205-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim205-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim205-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim205-enemy-floor') val = Math.min(val, d.enemy.staminaMax || 9999);
    d[map[0]][map[1]] = val;
    if (id === 'sim205-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim205-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim205-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim205-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim205-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim205-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim205-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim205-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim205-enemy-pick', 'sim205-enemy-pick-dropdown', enemy => {
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
  _setupEnemyAutocomplete('sim205-side-pick', 'sim205-side-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy.staminaMax = enemy.hp;
    saveState();
    _renderAll();
  });
}
