// ── Battle Simulator (Talisman of Death, book 207) ──────────────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 207 only) by the caller in boot.js via
// setSim207Visible().
// To remove: delete this file, remove its import line and initSim207()/
// setSim207Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with battlesim8.js/battlesim829.js/battlesim286.js/battlesim198.js/
// battlesim199.js/battlesim200.js/battlesim186.js/battlesim201.js/
// battlesim202.js/battlesim203.js/battlesim204.js/battlesim205.js/
// battlesim206.js, so only remove it if all fourteen are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system, same core numbers,
// Test Your Luck table, and single-dose potion-of-three-choices starting
// item as books 201/202/203/205 - the reference gives every one of these
// explicitly (rules p.2). The reference also explicitly says weapon/item
// SKILL bonuses stay capped at Initial SKILL, unlike book 206's flagged
// ambiguity - but every sim in this app already leaves that ceiling
// unenforced in code (a plain, uncapped addition via the Attack modifier
// field and the persistent item toggles below), relying on the player to
// self-manage it the same way every other sim's "Score ceilings" rule
// already does, so this book doesn't change that established precedent.
//
// attackModifier/enemyWoundDamage/pairedFight/sideEnemy/winAfterHits/
// enemyStaminaFloor are reused exactly as books 200-206 built them -
// enemyStaminaFloor covers the Barman (§11, retires at 4) and the Griffin
// (§313, ends at 6); winAfterHits covers the Willow Weird's four-landed-hits
// stop (§36/§319) and Tyutchev's single-hit interrupt (§265); pairedFight/
// sideEnemy covers this book's several true simultaneous-attacker fights
// (Tyutchev/Cassandra §210/§368, the Captain/Elvira §362, the together
// Two Thieves §286) - the core rule text (p.2) describes exactly this
// shape generically ("choose one target, parry everyone else") for any
// unspecified multi-opponent fight. One extension reused from book 204: a
// third simultaneous attacker (sideEnemy2, gated behind pairedFight AND a
// separate tripleFight checkbox) for this book's one three-way encounter,
// the Back-stabber/Scarface/Second Cut-throat trio (§167).
//
// One genuinely new mechanic, a recurring per-round effect rather than a
// one-off score change:
// - skillDrain (per-encounter checkbox): every time the ENEMY lands a hit
//   on YOU, your own SKILL permanently drops by 1 (floored at 0), in
//   addition to the normal STAMINA wound - a life-draining attack against
//   the player, not a wound-blunting effect on the enemy. Covers the two
//   Minion of Death fights (§81/§96), the Wraith (§219), and both Envoy of
//   Death fights (§220/§271) - all five explicitly print "each time it
//   strikes you, you lose 1 SKILL point as well as the normal STAMINA loss."
//
// Four persistent SKILL toggles, all +1: Apothecus skill ring (§98, worn,
// stacks with anything else), Magical Silver Chainmail (§117, worn, also
// stacks with anything else - a genuinely separate armour slot from the
// weapon-only toggles below), Holy Sword (§62 or §193, a weapon - mutually
// exclusive with Dragonsbane by the core "only one weapon" rule, same
// precedent as every other sim's weapon toggles, not enforced in code),
// Dragonsbane (§371 or §395, a weapon).
//
// Deliberately NOT modeled, same precedent as every other sim in this app:
// the Escape rule's automatic 2-STAMINA hit (only ever offered narratively,
// apply it by hand), the many "Pre -N STAMINA/-N SKILL" one-off penalties
// printed before a specific fight starts (Minion of Death, Ogre, Ice Demon,
// Unseen Stalker ×3, Wraith, Envoy of Death, Griffin, Willow Weird, Back-
// stabber trio - apply by hand with the steppers before starting each of
// those), the Death-knight's STAMINA-triggered rescue branch (§91), the
// Scarlet Mantis Monk's post-round flee roll (§288/§311 - a narrative fork,
// not a stat change), the Unicorn-horn Amulet's one-battle-only +2 SKILL
// (§87, apply by hand with the Attack modifier field for that single fight),
// the Vapours-weakened/Scroll-weakened Hawkana pre-fight STAMINA/score
// changes, and every other one-off SKILL/STAMINA/LUCK score change listed
// in the reference - apply those by hand with the steppers when you reach
// them, same as every other sim.
//
// All state lives in pt.sim207, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=14';
import { showAlert } from '../confirm.js?v=6';
import { getPlayBtnRow } from '../charsheet.js?v=106';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=89';
import { t } from '../i18n.js?v=73';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Choose exactly one bottle (rules p.2). Each bottle contains one measure,
// same single-use rule as books 201/202/203/205's potions.
const POTIONS = [
  ['skill',    'battlesim207.potion.skill'],
  ['strength', 'battlesim207.potion.strength'],
  ['fortune',  'battlesim207.potion.fortune'],
];

const MAX_PROVISIONS = 10;
const SIDE_WOUND_DMG = 2;
const PROVISIONS_HEAL = 4;
const FORTUNE_LUCK_BONUS = 1;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim207) {
    pt.sim207 = {
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
        skillDrain: false,
        hasSkillRing: false,
        hasChainmail: false,
        hasHolySword: false,
        hasDragonsbane: false,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      pairedFight: false,
      tripleFight: false,
      sideEnemy: { name: '', skill: 0, staminaMax: 0 },
      sideEnemy2: { name: '', skill: 0, staminaMax: 0 },
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim207;
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
  if (d.player.skillDrain === undefined) d.player.skillDrain = false;
  if (d.player.hasSkillRing === undefined) d.player.hasSkillRing = false;
  if (d.player.hasChainmail === undefined) d.player.hasChainmail = false;
  if (d.player.hasHolySword === undefined) d.player.hasHolySword = false;
  if (d.player.hasDragonsbane === undefined) d.player.hasDragonsbane = false;
  if (d.pairedFight === undefined) d.pairedFight = false;
  if (d.tripleFight === undefined) d.tripleFight = false;
  if (!d.sideEnemy) d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
  if (!d.sideEnemy2) d.sideEnemy2 = { name: '', skill: 0, staminaMax: 0 };
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
function _sideEnemy2NameSafe(d) { return escapeHtml(d.sideEnemy2.name.trim() || 'the third attacker'); }

function _effectiveSkill(d) {
  let skill = d.player.skill;
  if (d.player.hasSkillRing)   skill += 1;
  if (d.player.hasChainmail)   skill += 1;
  if (d.player.hasHolySword)   skill += 1;
  if (d.player.hasDragonsbane) skill += 1;
  return skill + (d.player.attackModifier || 0);
}

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.winAfterHits = 0;
  d.player.enemyStaminaFloor = 0;
  d.player.hitsLandedThisFight = 0;
  d.player.skillDrain = false;
  d.pairedFight = false;
  d.tripleFight = false;
  d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
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

  const playerAS = _roll2d6() + _effectiveSkill(d);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim207.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));

  let playerWins = false, tie = false;
  if (playerAS === enemyAS) tie = true;
  else playerWins = playerAS > enemyAS;

  if (tie) {
    _appendLog(d, t('battlesim207.log.both_avoided'));
  } else if (playerWins) {
    d.enemy.stamina = Math.max(floor, d.enemy.stamina - 2);
    d.player.hitsLandedThisFight++;
    _appendLog(d, t('battlesim207.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.stamina > floor) {
      d.enemy.stamina = floor;
      _appendLog(d, t('battlesim207.log.press_advantage'));
    }
    if (d.enemy.stamina > floor) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
    // skillDrain: a life-draining attack against the PLAYER, not a
    // wound-blunting effect on the enemy - see the header comment above.
    if (d.player.skillDrain && d.player.skill > 0) {
      d.player.skill = Math.max(0, d.player.skill - 1);
      _appendLog(d, t('battlesim207.log.enemy_wounds_drain', { enemy: _enemyNameSafe(d), n: woundDmg, skill: d.player.skill, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      _appendLog(d, t('battlesim207.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Simultaneous side attackers: fresh independent exchanges every round,
  // never woundable themselves (choose-one-target rule, rules p.2).
  if (d.pairedFight && d.sideEnemy.staminaMax > 0 && d.player.stamina > 0) {
    const sidePlayerAS = _roll2d6() + _effectiveSkill(d);
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    _appendLog(d, t('battlesim207.log.side_round', { enemy: _sideEnemyNameSafe(d), playerAS: sidePlayerAS, enemyAS: sideAS }));
    if (sideAS > sidePlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim207.log.side_wounds', { enemy: _sideEnemyNameSafe(d), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side-hit' });
    } else {
      _appendLog(d, t('battlesim207.log.side_fend', { enemy: _sideEnemyNameSafe(d) }));
    }
  }
  if (d.pairedFight && d.tripleFight && d.sideEnemy2.staminaMax > 0 && d.player.stamina > 0) {
    const side2PlayerAS = _roll2d6() + _effectiveSkill(d);
    const side2AS = _roll2d6() + d.sideEnemy2.skill;
    _appendLog(d, t('battlesim207.log.side_round', { enemy: _sideEnemy2NameSafe(d), playerAS: side2PlayerAS, enemyAS: side2AS }));
    if (side2AS > side2PlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim207.log.side_wounds', { enemy: _sideEnemy2NameSafe(d), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side2-hit' });
    } else {
      _appendLog(d, t('battlesim207.log.side_fend', { enemy: _sideEnemy2NameSafe(d) }));
    }
  }

  if (d.enemy.stamina <= floor) {
    _appendLog(d, t('battlesim207.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim207.log.fallen', { skull: SVG_SKULL }));
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
      _appendLog(d, t('battlesim207.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim207.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= floor) { _appendLog(d, t('battlesim207.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : event.kind === 'side2-hit' ? _sideEnemy2NameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim207.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim207.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim207.log.fallen', { skull: SVG_SKULL }));
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
  if (d.log.length) _appendLog(d, t('battlesim207.log.reset_sep'));
  _appendLog(d, t('battlesim207.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Provisions / Potions ────────────────────────────────────────────────────

function _eatProvisions() {
  const d = _data();
  if (!d || _notReady(d)) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim207.alert.provisions_midfight'));
    return;
  }
  if (d.player.provisionsLeft <= 0) return;
  if (d.player.stamina >= d.player.staminaInitial) {
    showAlert(t('battlesim207.alert.stamina_full'));
    return;
  }
  d.player.provisionsLeft--;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + PROVISIONS_HEAL);
  _appendLog(d, t('battlesim207.log.provisions', { before, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  saveState();
  _renderAll();
}

function _usePotion() {
  const d = _data();
  if (!d || _notReady(d) || d.player.potionUsesLeft <= 0) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim207.alert.potion_midfight'));
    return;
  }
  d.player.potionUsesLeft--;
  if (d.player.potionKey === 'skill') {
    d.player.skill = d.player.skillInitial;
    _appendLog(d, t('battlesim207.log.potion_skill', { n: d.player.skillInitial }));
  } else if (d.player.potionKey === 'strength') {
    d.player.stamina = d.player.staminaInitial;
    _appendLog(d, t('battlesim207.log.potion_strength', { n: d.player.staminaInitial }));
  } else {
    d.player.luckInitial += FORTUNE_LUCK_BONUS;
    d.player.luck = d.player.luckInitial;
    _appendLog(d, t('battlesim207.log.potion_fortune', { n: d.player.luckInitial }));
  }
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim207-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  const floor = _enemyFloor(d);
  if (notReady)                                    el.innerHTML = t('battlesim207.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim207.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= floor)     el.innerHTML = t('battlesim207.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= floor);
  document.getElementById('sim207-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim207-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim207-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim207-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
}

function _renderItemsHtml(d) {
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim207.ui.item_ring_name')} <span class="bsim-tech-uses">(sec. 98)</span></div>
      <div class="bsim-tech-desc">${t('battlesim207.ui.item_ring_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim207-item-ring" class="inv-edit-check" ${d.player.hasSkillRing ? 'checked' : ''}> ${t('battlesim207.ui.wearing_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim207.ui.item_chainmail_name')} <span class="bsim-tech-uses">(sec. 117)</span></div>
      <div class="bsim-tech-desc">${t('battlesim207.ui.item_chainmail_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim207-item-chainmail" class="inv-edit-check" ${d.player.hasChainmail ? 'checked' : ''}> ${t('battlesim207.ui.wearing_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim207.ui.item_holysword_name')} <span class="bsim-tech-uses">(sec. 62/193)</span></div>
      <div class="bsim-tech-desc">${t('battlesim207.ui.item_holysword_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim207-item-holysword" class="inv-edit-check" ${d.player.hasHolySword ? 'checked' : ''}> ${t('battlesim207.ui.wielding_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim207.ui.item_dragonsbane_name')} <span class="bsim-tech-uses">(sec. 371/395)</span></div>
      <div class="bsim-tech-desc">${t('battlesim207.ui.item_dragonsbane_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim207-item-dragonsbane" class="inv-edit-check" ${d.player.hasDragonsbane ? 'checked' : ''}> ${t('battlesim207.ui.wielding_it')}</label></div>
    </div>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim207-history-summary');
  const listEl = document.getElementById('sim207-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim207.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim207.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim207.history.won') : t('battlesim207.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim207-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim207-player-skill').value      = d.player.skill;
  document.getElementById('sim207-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim207-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim207-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim207-player-luck').value       = d.player.luck;
  document.getElementById('sim207-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim207-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim207-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim207.btn.rolled') : t('battlesim207.btn.roll');

  const potionSel = document.getElementById('sim207-potion');
  potionSel.value = d.player.potionKey;
  potionSel.disabled = d.rolled;
  document.getElementById('sim207-potion-uses').textContent = t('battlesim207.ui.uses_left', { n: d.player.potionUsesLeft });
  document.getElementById('sim207-potion-use').disabled =
    _notReady(d) || d.player.potionUsesLeft <= 0 ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);

  document.getElementById('sim207-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim207-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim207-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim207-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim207-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim207-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim207-enemy-winhits').value    = d.player.winAfterHits;
  document.getElementById('sim207-enemy-floor').value      = d.player.enemyStaminaFloor;
  document.getElementById('sim207-enemy-decay').checked    = d.player.skillDrain;

  document.getElementById('sim207-paired').checked = d.pairedFight;
  document.getElementById('sim207-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim207-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim207-side-staminamax').value = d.sideEnemy.staminaMax;
  document.getElementById('sim207-side-fields').style.display = d.pairedFight ? '' : 'none';

  document.getElementById('sim207-triple').checked = d.tripleFight;
  document.getElementById('sim207-triple-row').style.display = d.pairedFight ? '' : 'none';
  document.getElementById('sim207-side2-pick').value = d.sideEnemy2.name;
  document.getElementById('sim207-side2-skill').value = d.sideEnemy2.skill;
  document.getElementById('sim207-side2-staminamax').value = d.sideEnemy2.staminaMax;
  document.getElementById('sim207-side2-fields').style.display = (d.pairedFight && d.tripleFight) ? '' : 'none';

  document.getElementById('sim207-item-list').innerHTML = _renderItemsHtml(d);

  const pendingEl = document.getElementById('sim207-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim207() {
  const overlay = document.getElementById('sim207-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim207(); return; }
  _renderAll();
}

function openSim207() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim207-overlay').classList.add('active');
}

function closeSim207() {
  document.getElementById('sim207-overlay')?.classList.remove('active');
}

export function setSim207Visible(visible) {
  const btn = document.getElementById('sim207-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim207();
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

export function initSim207() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim207-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim207-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim207.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim207-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim207.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim207.ui.skill'), 'sim207-player-skill')}
            ${_numField(t('battlesim207.ui.skill_initial'), 'sim207-player-skillmax')}
            ${_numField(t('battlesim207.ui.stamina'), 'sim207-player-stamina')}
            ${_numField(t('battlesim207.ui.stamina_initial'), 'sim207-player-staminamax')}
            ${_numField(t('battlesim207.ui.luck'), 'sim207-player-luck')}
            ${_numField(t('battlesim207.ui.luck_initial'), 'sim207-player-luckmax')}
            ${_numField(t('battlesim207.ui.atkmod'), 'sim207-player-atkmod')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim207.ui.potion')}</span>
              <select id="sim207-potion" class="inv-edit-input bsim-select">
                ${POTIONS.map(p => `<option value="${p[0]}">${escapeHtml(t(p[1]))}</option>`).join('')}
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span id="sim207-potion-uses" class="bsim-ae-display"></span>
              <button id="sim207-potion-use" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim207.btn.drink')}</button>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim207.ui.provisions')}</span>
              <span id="sim207-provisions-left" class="bsim-ae-display"></span>
              <button id="sim207-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim207.btn.provisions_eat', { n: PROVISIONS_HEAL })}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim207.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim207.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim207-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim207-enemy-pick-dropdown">
                <ul id="sim207-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim207.ui.skill'), 'sim207-enemy-skill')}
            ${_numField(t('battlesim207.ui.stamina'), 'sim207-enemy-stamina')}
            ${_numField(t('battlesim207.ui.stamina_max'), 'sim207-enemy-staminamax')}
            ${_numField(t('battlesim207.ui.wound_dmg'), 'sim207-enemy-wounddmg')}
            ${_numField(t('battlesim207.ui.win_after_hits'), 'sim207-enemy-winhits')}
            ${_numField(t('battlesim207.ui.stamina_floor'), 'sim207-enemy-floor')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim207-enemy-decay" class="inv-edit-check"> ${t('battlesim207.ui.decay_toggle')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim207-paired" class="inv-edit-check"> ${t('battlesim207.ui.paired_toggle')}</label>
            </div>
            <div id="sim207-side-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim207.ui.pick')}</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim207-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim207-side-pick-dropdown">
                  <ul id="sim207-side-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField(t('battlesim207.ui.skill'), 'sim207-side-skill')}
              ${_numField(t('battlesim207.ui.stamina_max'), 'sim207-side-staminamax')}
            </div>
            <div id="sim207-triple-row" class="inv-edit-row" style="display:none">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim207-triple" class="inv-edit-check"> ${t('battlesim207.ui.triple_toggle')}</label>
            </div>
            <div id="sim207-side2-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim207.ui.pick')}</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim207-side2-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim207-side2-pick-dropdown">
                  <ul id="sim207-side2-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField(t('battlesim207.ui.skill'), 'sim207-side2-skill')}
              ${_numField(t('battlesim207.ui.stamina_max'), 'sim207-side2-staminamax')}
            </div>
          </div>
          <div id="sim207-status" class="bsim-status"></div>
          <div id="sim207-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim207.btn.luck_prompt')}</span>
            <button id="sim207-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim207.btn.luck_yes')}</button>
            <button id="sim207-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim207.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim207-round" class="inv-add-btn bsim-action-primary">${t('battlesim207.btn.round')}</button>
            <button id="sim207-reset" class="inv-add-btn">${t('battlesim207.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>${t('battlesim207.ui.items')}</summary>
            <div id="sim207-item-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim207-history-summary">${t('battlesim207.history.summary', { n: 0 })}</summary>
            <div id="sim207-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim207-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim207-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim207);
  document.getElementById('sim207-close').addEventListener('click', closeSim207);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim207(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim207-overlay'),
    open:  openSim207,
    close: closeSim207,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim207();
  });

  document.getElementById('sim207-round').addEventListener('click', _runRound);
  document.getElementById('sim207-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim207-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim207-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim207-provisions').addEventListener('click', _eatProvisions);
  document.getElementById('sim207-potion-use').addEventListener('click', _usePotion);

  document.getElementById('sim207-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim207.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim207-potion').addEventListener('change', e => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.potionKey = e.target.value;
    saveState();
  });

  document.getElementById('sim207-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim207-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim207-side2-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy2.name = e.target.value;
    saveState();
  });

  document.getElementById('sim207-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    if (!e.target.checked) d.tripleFight = false;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim207-triple').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.tripleFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim207-enemy-decay').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.skillDrain = e.target.checked;
    saveState();
  });

  const ITEM_CHECKBOX_MAP = {
    'sim207-item-ring':        'hasSkillRing',
    'sim207-item-chainmail':   'hasChainmail',
    'sim207-item-holysword':   'hasHolySword',
    'sim207-item-dragonsbane': 'hasDragonsbane',
  };
  document.getElementById('sim207-item-list').addEventListener('change', e => {
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
    'sim207-player-skill':      ['player', 'skill'],
    'sim207-player-skillmax':   ['player', 'skillInitial'],
    'sim207-player-stamina':    ['player', 'stamina'],
    'sim207-player-staminamax': ['player', 'staminaInitial'],
    'sim207-player-luck':       ['player', 'luck'],
    'sim207-player-luckmax':    ['player', 'luckInitial'],
    'sim207-player-atkmod':     ['player', 'attackModifier'],
    'sim207-enemy-skill':       ['enemy', 'skill'],
    'sim207-enemy-stamina':        ['enemy', 'stamina'],
    'sim207-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim207-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim207-enemy-winhits':        ['player', 'winAfterHits'],
    'sim207-enemy-floor':          ['player', 'enemyStaminaFloor'],
    'sim207-side-skill':        ['sideEnemy', 'skill'],
    'sim207-side-staminamax':   ['sideEnemy', 'staminaMax'],
    'sim207-side2-skill':       ['sideEnemy2', 'skill'],
    'sim207-side2-staminamax':  ['sideEnemy2', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Attack modifier is the one field allowed to go negative (this book's
    // several one-off pre-fight penalties are always a subtraction) - every
    // other field stays clamped to 0 or above.
    val = id === 'sim207-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim207-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim207-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim207-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim207-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim207-enemy-floor') val = Math.min(val, d.enemy.staminaMax || 9999);
    d[map[0]][map[1]] = val;
    if (id === 'sim207-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim207-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim207-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim207-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim207-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim207-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim207-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim207-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim207-enemy-pick', 'sim207-enemy-pick-dropdown', enemy => {
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
  _setupEnemyAutocomplete('sim207-side-pick', 'sim207-side-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy.staminaMax = enemy.hp;
    saveState();
    _renderAll();
  });
  _setupEnemyAutocomplete('sim207-side2-pick', 'sim207-side2-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy2.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy2.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy2.staminaMax = enemy.hp;
    saveState();
    _renderAll();
  });
}
