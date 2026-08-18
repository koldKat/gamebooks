// ── Battle Simulator (City of Thieves, book 201) ─────────────────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 201 only) by the caller in boot.js via
// setSim201Visible().
// To remove: delete this file, remove its import line and initSim201()/
// setSim201Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with battlesim8.js/battlesim829.js/battlesim286.js/battlesim198.js/
// battlesim199.js/battlesim200.js/battlesim186.js, so only remove it if all
// eight are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system, same core numbers and
// Test Your Luck table as book 198 (SKILL 1d6+6, STAMINA 2d6+12, LUCK 1d6+6,
// normal wound 2 STAMINA). Potions here are single-dose ("each bottle
// contains one measure"), unlike book 198's two-dose potions.
//
// Two mechanics reused from book 200 rather than invented fresh, because
// this book's own rules ask for exactly the same shapes:
// - attackModifier: a plain +/- Attack Strength knob, covering the several
//   "fight bare-handed/disarmed" encounters (subtract 2 or 3 every round).
// - pairedFight/sideEnemy: a second enemy that attacks every round via its
//   own independent roll but can never be wounded back - covers the several
//   "two guards attack together, you can only fight one" and "both dogs
//   attack, pick a target" encounters.
//
// One new knob unique to this book: enemyWoundDamage (default 2) overrides
// how much STAMINA a landed enemy hit costs this fight, covering the
// Snakes' poison (4 instead of 2) and the Blacksmith's heated iron bar (3
// instead of 2) without hardcoding either by name.
//
// One new per-round side-effect, modeled the same way book 200 modeled the
// Fire Demon's whip: a toggleable item that rolls 1d6 every round in
// addition to normal combat - the Lizardine's fiery breath (1-3 hits for 1
// STAMINA, Luck-eligible; 4-6 dodges).
//
// Deliberately NOT modeled: pre-battle "entry strike" penalties (Serpent
// Queen's bite before battle) - these are a one-off STAMINA/SKILL loss the
// player can already apply by hand with the existing stat steppers before
// starting the fight, same as any other narrative stat loss elsewhere in
// the book. Also not modeled: the non-standard Luck-gated encounters with
// no SKILL/STAMINA stat block at all (Spirit Stalker, Vampire, Animated
// Suit of Armour) and the Zanbar Bone ingredient-compound puzzle - none of
// these are battles a sim has anything to calculate.
//
// All state lives in pt.sim201, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=13';
import { showAlert } from '../play.js?v=139';
import { getPlayBtnRow } from '../charsheet.js?v=94';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=77';
import { t } from '../i18n.js?v=63';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Choose exactly one bottle (sec.10). Each bottle contains one measure, so
// unlike book 198's two-dose potions these are single-use.
const POTIONS = [
  ['skill',    'Potion of Skill'],
  ['strength', 'Potion of Strength'],
  ['fortune',  'Potion of Fortune'],
];

const MAX_PROVISIONS = 10;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim201) {
    pt.sim201 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        potionKey: 'skill', potionUsesLeft: 1,
        provisionsLeft: MAX_PROVISIONS,
        attackModifier: 0,
        enemyWoundDamage: 2,
        lizardineBreath: false,
        hasHealingBrooch: false,
        hasChainmail: false,
        hasMagicShield: false,
        hasUnicornShield: false,
        hasMagicHelmet: false,
        hasCursedShield: false,
        hasCursedBrooch: false,
        hasElvenBoots: false,
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
  const d = pt.sim201;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.potionKey === undefined) d.player.potionKey = 'skill';
  if (d.player.potionUsesLeft === undefined) d.player.potionUsesLeft = 1;
  if (d.player.provisionsLeft === undefined) d.player.provisionsLeft = MAX_PROVISIONS;
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.lizardineBreath === undefined) d.player.lizardineBreath = false;
  if (d.player.hasHealingBrooch === undefined) d.player.hasHealingBrooch = false;
  if (d.player.hasChainmail === undefined) d.player.hasChainmail = false;
  if (d.player.hasMagicShield === undefined) d.player.hasMagicShield = false;
  if (d.player.hasUnicornShield === undefined) d.player.hasUnicornShield = false;
  if (d.player.hasMagicHelmet === undefined) d.player.hasMagicHelmet = false;
  if (d.player.hasCursedShield === undefined) d.player.hasCursedShield = false;
  if (d.player.hasCursedBrooch === undefined) d.player.hasCursedBrooch = false;
  if (d.player.hasElvenBoots === undefined) d.player.hasElvenBoots = false;
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

// Persistent combat modifiers found in the full-audit pass - all fold into
// the same roll the way book 198's item bonuses do (a +1 to Attack Strength
// is equivalent to a +1 SKILL for combat purposes, so both are added here
// rather than tracked as two separate mechanisms):
// - Chainmail Coat (sec 46): +2 SKILL while worn
// - Magic Shield (sec 340): +1 Attack Strength while using it
// - Unicorn-Crest Shield (sec 374): +1 SKILL
// - Magic Helmet (smoke ball smashed at sec 45, worn/effect at sec 376):
//   +1 to Attack Strength while worn (its one-time +1 LUCK on pickup is a
//   narrative reward, not modeled - same as every other one-time LUCK/
//   STAMINA pickup in this book, apply by hand)
// - Cursed Shield (sec 125): -1 SKILL, forced and not removable on that route
// - Cursed/copper scorpion Brooch (sec 387): -1 SKILL while carried
// - Magic Elven Boots (sec 362): +1 SKILL while worn - missed in the original
//   audit pass, corrected in a later re-verification (that pass had first
//   mislabeled it as a one-time +1 LUCK reward, which is why it was never
//   added as a toggle in the first place).
function _effectiveSkill(d) {
  let skill = d.player.skill;
  if (d.player.hasChainmail) skill += 2;
  if (d.player.hasMagicShield) skill += 1;
  if (d.player.hasUnicornShield) skill += 1;
  if (d.player.hasMagicHelmet) skill += 1;
  if (d.player.hasElvenBoots) skill += 1;
  if (d.player.hasCursedShield) skill -= 1;
  if (d.player.hasCursedBrooch) skill -= 1;
  return skill;
}

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.pairedFight = false;
  d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
}

// Uncapped (was previously trimmed to the last 100) - the admin dashboard
// aggregates battle counts app-wide from this array, so per-user history needs
// to be a true lifetime total, not a rolling window.
function _recordOutcome(d, outcome) {
  // Healing Brooch (sec 13/132): "after any battle survived, immediately
  // restore 1 STAMINA" - only applied if the player is still standing, so a
  // loss doesn't get quietly patched up. Not the same item as the unrelated
  // "Golden scorpion" lucky charm (sec 273, one-time +2 LUCK) or the cursed
  // copper scorpion brooch (sec 387, -1 SKILL) - three different items that
  // happen to share "scorpion brooch" imagery.
  if (d.player.hasHealingBrooch && d.player.stamina > 0) {
    const before = d.player.stamina;
    d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
    if (d.player.stamina !== before) _appendLog(d, `The Healing Brooch restores 1 STAMINA. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
  }
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
  _appendLog(d, `Round ${d.roundsThisBattle}: you ${playerAS} vs ${_enemyNameSafe(d)} ${enemyAS}.`);
  if (playerAS === enemyAS) {
    _appendLog(d, 'Both blows are avoided.');
  } else if (playerAS > enemyAS) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
    _appendLog(d, `You wound ${_enemyNameSafe(d)} for 2. STAMINA: ${d.enemy.stamina}/${d.enemy.staminaMax}.`);
    if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
    _appendLog(d, `${_enemyNameSafe(d)} wounds you for ${woundDmg}. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Paired fight: "Both roll Attack Strength; choose one target. The other
  // may wound you, but you cannot wound him that round" - a second,
  // independent exchange with its own fresh player roll. Covers the several
  // simultaneous two-attacker encounters (City Guard reinforcements, Wild
  // Dogs) - the side enemy is never woundable, matching the literal rule.
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

  // Lizardine's fiery breath (sec 392): in addition to normal combat, roll
  // 1 die every Attack Round. 1-3 costs 1 STAMINA from fire (Luck-eligible),
  // 4-6 dodges.
  if (d.player.lizardineBreath && d.player.stamina > 0) {
    const fireRoll = _roll1d6();
    if (fireRoll <= 3) {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, `Fiery breath scorches you (roll ${fireRoll}): -1 STAMINA. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'fire-hit' });
    } else {
      _appendLog(d, `You dodge the fiery breath (roll ${fireRoll}).`);
    }
  }

  if (d.enemy.stamina <= 0) {
    _appendLog(d, `${SVG_TROPHY} ${_enemyNameSafe(d)} is defeated!`);
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, `${SVG_SKULL} You have fallen in battle.`);
    _recordOutcome(d, 'loss');
    // Once you're down, any hit queued earlier this same round (side
    // attacker or fire breath wounding you before the killing blow landed)
    // is moot - clear it so a dead battle can't still offer a Luck prompt.
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome. On
// your own hit, Lucky deals 2 extra STAMINA damage (4 total), Unlucky gives
// back 1 (only 1 total). On a hit you took (from any source), Lucky gives
// back 1 STAMINA, Unlucky costs 1 extra - same table as book 198, applied on
// top of whatever this fight's enemyWoundDamage was. Processes one queued
// event at a time.
function _testLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
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
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : event.kind === 'fire-hit' ? 'the fiery breath' : _enemyNameSafe(d);
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
  // "A potion may be used at any time except during battle" (sec.10) - same
  // mid-fight guard as Provisions.
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
  const el = document.getElementById('sim201-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = 'Roll your starting SKILL, STAMINA and LUCK to begin.';
  else if (d.player.stamina <= 0)                   el.innerHTML = `${SVG_SKULL} You have fallen in battle.`;
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = `${SVG_TROPHY} Victory!`;
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim201-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim201-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim201-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim201-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
}

function _renderItemsHtml(d) {
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Healing Brooch <span class="bsim-tech-uses">(sec. 13/132)</span></div>
      <div class="bsim-tech-desc">While carried: restores 1 STAMINA immediately after every battle survived. Same effect on the scorpion brooch and the purchased silver brooch.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim201-item-brooch" class="inv-edit-check" ${d.player.hasHealingBrooch ? 'checked' : ''}> Have it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Chainmail Coat <span class="bsim-tech-uses">(sec. 46)</span></div>
      <div class="bsim-tech-desc">+2 SKILL while worn.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim201-item-chainmail" class="inv-edit-check" ${d.player.hasChainmail ? 'checked' : ''}> Have it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Magic Shield <span class="bsim-tech-uses">(sec. 340)</span></div>
      <div class="bsim-tech-desc">+1 to your Attack Strength every round while using it. Also grants +1 LUCK once when the chest is opened - add that to your LUCK fields by hand, checking this box only applies the ongoing Attack Strength bonus.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim201-item-magicshield" class="inv-edit-check" ${d.player.hasMagicShield ? 'checked' : ''}> Have it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Unicorn-Crest Shield <span class="bsim-tech-uses">(sec. 374)</span></div>
      <div class="bsim-tech-desc">+1 SKILL.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim201-item-unicornshield" class="inv-edit-check" ${d.player.hasUnicornShield ? 'checked' : ''}> Have it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Magic Helmet <span class="bsim-tech-uses">(sec. 45/376)</span></div>
      <div class="bsim-tech-desc">+1 to your Attack Strength every round while worn. Also grants +1 LUCK once when obtained - add that to your LUCK fields by hand, checking this box only applies the ongoing Attack Strength bonus.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim201-item-magichelmet" class="inv-edit-check" ${d.player.hasMagicHelmet ? 'checked' : ''}> Have it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Cursed Shield <span class="bsim-tech-uses">(sec. 125)</span></div>
      <div class="bsim-tech-desc">-1 SKILL. Forced by the story on that route, not removable.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim201-item-cursedshield" class="inv-edit-check" ${d.player.hasCursedShield ? 'checked' : ''}> Have it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Cursed Brooch <span class="bsim-tech-uses">(sec. 387)</span></div>
      <div class="bsim-tech-desc">-1 SKILL while carried (the copper scorpion brooch).</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim201-item-cursedbrooch" class="inv-edit-check" ${d.player.hasCursedBrooch ? 'checked' : ''}> Have it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Magic Elven Boots <span class="bsim-tech-uses">(sec. 362)</span></div>
      <div class="bsim-tech-desc">+1 SKILL while worn.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim201-item-elvenboots" class="inv-edit-check" ${d.player.hasElvenBoots ? 'checked' : ''}> Have it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Lizardine's Fiery Breath <span class="bsim-tech-uses">(sec. 392)</span></div>
      <div class="bsim-tech-desc">Extra 1d6 roll every round: 1-3 costs 1 STAMINA (Luck-eligible), 4-6 dodges.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim201-item-lizardine" class="inv-edit-check" ${d.player.lizardineBreath ? 'checked' : ''}> This fight</label></div>
    </div>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim201-history-summary');
  const listEl = document.getElementById('sim201-history-list');
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
  const el = document.getElementById('sim201-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim201-player-skill').value      = d.player.skill;
  document.getElementById('sim201-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim201-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim201-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim201-player-luck').value       = d.player.luck;
  document.getElementById('sim201-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim201-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim201-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? 'Rolled' : 'Roll starting SKILL/STAMINA/LUCK';

  const potionSel = document.getElementById('sim201-potion');
  potionSel.value = d.player.potionKey;
  potionSel.disabled = d.rolled;
  document.getElementById('sim201-potion-uses').textContent = `${d.player.potionUsesLeft} use(s) left`;
  document.getElementById('sim201-potion-use').disabled =
    _notReady(d) || d.player.potionUsesLeft <= 0 ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);

  document.getElementById('sim201-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim201-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim201-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim201-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim201-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim201-enemy-wounddmg').value   = d.player.enemyWoundDamage;

  document.getElementById('sim201-paired').checked = d.pairedFight;
  document.getElementById('sim201-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim201-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim201-side-staminamax').value = d.sideEnemy.staminaMax;
  document.getElementById('sim201-side-fields').style.display = d.pairedFight ? '' : 'none';

  document.getElementById('sim201-item-list').innerHTML = _renderItemsHtml(d);

  const pendingEl = document.getElementById('sim201-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim201() {
  const overlay = document.getElementById('sim201-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim201(); return; }
  _renderAll();
}

function openSim201() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim201-overlay').classList.add('active');
}

function closeSim201() {
  document.getElementById('sim201-overlay')?.classList.remove('active');
}

export function setSim201Visible(visible) {
  const btn = document.getElementById('sim201-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim201();
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

export function initSim201() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim201-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">Battle Simulator</span>
        <button id="sim201-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">You</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim201-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">Roll starting SKILL/STAMINA/LUCK</button>
            </div>
            ${_numField('SKILL', 'sim201-player-skill')}
            ${_numField('Initial SKILL', 'sim201-player-skillmax')}
            ${_numField('STAMINA', 'sim201-player-stamina')}
            ${_numField('Initial STAMINA', 'sim201-player-staminamax')}
            ${_numField('LUCK', 'sim201-player-luck')}
            ${_numField('Initial LUCK', 'sim201-player-luckmax')}
            ${_numField('Attack modifier', 'sim201-player-atkmod')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Potion</span>
              <select id="sim201-potion" class="inv-edit-input bsim-select">
                ${POTIONS.map(p => `<option value="${p[0]}">${escapeHtml(p[1])}</option>`).join('')}
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span id="sim201-potion-uses" class="bsim-ae-display"></span>
              <button id="sim201-potion-use" class="inv-edit-done bsim-ae-roll-btn" type="button">Drink</button>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">Provisions</span>
              <span id="sim201-provisions-left" class="bsim-ae-display"></span>
              <button id="sim201-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">Eat (+4 STAMINA)</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">Enemy</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Pick</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim201-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim201-enemy-pick-dropdown">
                <ul id="sim201-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField('SKILL', 'sim201-enemy-skill')}
            ${_numField('STAMINA', 'sim201-enemy-stamina')}
            ${_numField('Max STAMINA', 'sim201-enemy-staminamax')}
            ${_numField('Wound damage', 'sim201-enemy-wounddmg')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim201-paired" class="inv-edit-check"> Second attacker fights alongside (never woundable)</label>
            </div>
            <div id="sim201-side-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">Pick</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim201-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim201-side-pick-dropdown">
                  <ul id="sim201-side-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField('SKILL', 'sim201-side-skill')}
              ${_numField('Max STAMINA', 'sim201-side-staminamax')}
            </div>
          </div>
          <div id="sim201-status" class="bsim-status"></div>
          <div id="sim201-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">Test Your Luck?</span>
            <button id="sim201-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">Test Luck</button>
            <button id="sim201-luck-no" class="inv-edit-done bsim-heal-btn" type="button">Skip</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim201-round" class="inv-add-btn bsim-action-primary">Round</button>
            <button id="sim201-reset" class="inv-add-btn">Reset</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>Items</summary>
            <div id="sim201-item-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim201-history-summary">Battle History (0)</summary>
            <div id="sim201-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim201-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim201-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim201);
  document.getElementById('sim201-close').addEventListener('click', closeSim201);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim201(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim201-overlay'),
    open:  openSim201,
    close: closeSim201,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim201();
  });

  document.getElementById('sim201-round').addEventListener('click', _runRound);
  document.getElementById('sim201-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim201-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim201-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim201-provisions').addEventListener('click', _eatProvisions);
  document.getElementById('sim201-potion-use').addEventListener('click', _usePotion);

  document.getElementById('sim201-roll').addEventListener('click', () => {
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

  document.getElementById('sim201-potion').addEventListener('change', e => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.potionKey = e.target.value;
    saveState();
  });

  document.getElementById('sim201-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim201-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim201-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  const ITEM_CHECKBOX_MAP = {
    'sim201-item-lizardine':     'lizardineBreath',
    'sim201-item-brooch':        'hasHealingBrooch',
    'sim201-item-chainmail':     'hasChainmail',
    'sim201-item-magicshield':   'hasMagicShield',
    'sim201-item-unicornshield': 'hasUnicornShield',
    'sim201-item-magichelmet':   'hasMagicHelmet',
    'sim201-item-cursedshield':  'hasCursedShield',
    'sim201-item-cursedbrooch':  'hasCursedBrooch',
    'sim201-item-elvenboots':    'hasElvenBoots',
  };
  document.getElementById('sim201-item-list').addEventListener('change', e => {
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
    'sim201-player-skill':      ['player', 'skill'],
    'sim201-player-skillmax':   ['player', 'skillInitial'],
    'sim201-player-stamina':    ['player', 'stamina'],
    'sim201-player-staminamax': ['player', 'staminaInitial'],
    'sim201-player-luck':       ['player', 'luck'],
    'sim201-player-luckmax':    ['player', 'luckInitial'],
    'sim201-player-atkmod':     ['player', 'attackModifier'],
    'sim201-enemy-skill':       ['enemy', 'skill'],
    'sim201-enemy-stamina':        ['enemy', 'stamina'],
    'sim201-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim201-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim201-side-skill':        ['sideEnemy', 'skill'],
    'sim201-side-staminamax':   ['sideEnemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Attack modifier is the one field allowed to go negative (bare-handed/
    // disarmed penalties are always a subtraction) - every other field stays
    // clamped to 0 or above.
    val = id === 'sim201-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim201-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim201-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim201-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim201-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim201-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim201-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim201-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim201-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim201-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim201-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim201-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim201-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim201-enemy-pick', 'sim201-enemy-pick-dropdown', enemy => {
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
  _setupEnemyAutocomplete('sim201-side-pick', 'sim201-side-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy.staminaMax = enemy.hp;
    saveState();
    _renderAll();
  });
}
