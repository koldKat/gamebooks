// ── Battle Simulator (Daggers of Darkness, book 231) ────────────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 231 only) by the caller in boot.js via
// setSim231Visible().
// To remove: delete this file, remove its import line and initSim231()/
// setSim231Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with every other battlesimN.js in this app, so only remove it if all are
// gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system (SKILL 1d6+6, STAMINA
// 2d6+12, LUCK 1d6+6) and single-dose potion-of-three-choices setup, reused
// verbatim from books 201/202/203. attackModifier/enemyWoundDamage/
// pairedFight/sideEnemy/winAfterHits are also reused exactly as those books
// built them.
//
// Four genuinely new mechanics for this book, all per-encounter knobs (reset
// whenever a new enemy is picked, same lifecycle as attackModifier etc):
// - darknessFight (checkbox): this encounter takes place in total darkness
//   (Dark Monster sec.3, Mamlik sec.135, Dark Warrior sec.317). Combined
//   with the persistent hasDarkfight toggle below: if the ability is NOT
//   held, -2 SKILL for this fight only.
// - useNecromancerLevel (checkbox): this is a Necromancer fight (sec.99/
//   151/242) - your trained Necromancer Fighting Level (see below) is used
//   AS your SKILL score for this battle, replacing (not adding to) your
//   normal SKILL.
// - drawThreshold (number, 0 = off): battle ends the instant either side's
//   STAMINA drops to this value, not 0 - used for the two "fight until
//   STAMINA drops to 4" encounters (Urgenj sec.191, Marauder sec.200). At
//   0 STAMINA the loser is simply spared, not killed, but this sim treats
//   reaching the threshold as an ordinary win/loss same as any other fight
//   (the narrative distinction doesn't change the maths).
// - doubleOneDrowns (checkbox): the Elkiem fight (sec.270) - if your own
//   two dice for an Attack Round both come up 1, you have drowned instantly
//   regardless of STAMINA remaining. Only your own roll is checked (the
//   creature's own Attack Strength roll is unaffected).
//
// Two new persistent player fields (not per-encounter, since both are
// trained/acquired once and then apply for the rest of the game):
// - hasDarkfight (toggle): the Ability of Darkfight - if held, darkness
//   fights proceed at normal SKILL (no penalty).
// - necromancerLevel (number, sec.266's training mini-game result): the
//   SKILL score substituted in whenever useNecromancerLevel is ticked.
//
// Deliberately NOT modeled, same precedent as every other sim in this app:
// - The 24-unit Poison tracker. Nearly every combat in this book instructs
//   "mark off N Poison units on the Adventure Sheet" - this is a whole-
//   adventure meter (death when all 24 units are shaded), not a per-battle
//   stat, and doesn't affect combat maths directly. Track it on the
//   Adventure Sheet/charsheet, not here.
// - Medallion power (three free "escape a lost fight" uses, restoring
//   STAMINA to 4 at a cost of -1 SKILL/-1 LUCK/3 Poison units) - a whole-
//   game resource, not a combat mechanic; apply the STAMINA/SKILL/LUCK
//   adjustments by hand with the steppers if a route uses it.
// - Item/Power bypass branches that skip a fight entirely or reduce the
//   enemy count (Mamlik ring sec.92, Treffilli sec.228, flowers sec.219/
//   358, Powers sec.158/369, gems sec.392) - these change whether/how many
//   of a multi-enemy group you fight, which the existing single-enemy
//   pick-and-reset flow already handles: simply don't start (or skip
//   ahead to) the enemies the book says you avoid.
// - Pre-battle one-off STAMINA/SKILL/LUCK losses narrated outside the
//   fight itself (e.g. sec.14's ship-passage STAMINA deduction, sec.118's
//   pre-fight arrow) - apply those by hand with the steppers first.
//
// All state lives in pt.sim231, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Choose exactly one bottle (sec.9's front-matter intro). Each bottle
// contains one measure, same single-use rule as books 201/202/203's potions.
const POTIONS = [
  ['skill',    'battlesim231.potion.skill'],
  ['strength', 'battlesim231.potion.strength'],
  ['fortune',  'battlesim231.potion.fortune'],
];

const MAX_PROVISIONS = 10;
const PROVISIONS_HEAL = 4;
const SIDE_WOUND_DMG = 2;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim231) {
    pt.sim231 = {
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
        drawThreshold: 0,
        darknessFight: false,
        useNecromancerLevel: false,
        doubleOneDrowns: false,
        hasDarkfight: false,
        necromancerLevel: 0,
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
  const d = pt.sim231;
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
  if (d.player.drawThreshold === undefined) d.player.drawThreshold = 0;
  if (d.player.darknessFight === undefined) d.player.darknessFight = false;
  if (d.player.useNecromancerLevel === undefined) d.player.useNecromancerLevel = false;
  if (d.player.doubleOneDrowns === undefined) d.player.doubleOneDrowns = false;
  if (d.player.hasDarkfight === undefined) d.player.hasDarkfight = false;
  if (d.player.necromancerLevel === undefined) d.player.necromancerLevel = 0;
  if (d.pairedFight === undefined) d.pairedFight = false;
  if (!d.sideEnemy) d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
  return d;
}

function _notReady(d) { return !d.rolled; }

function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }
function _roll2d6Detailed() {
  const a = _roll1d6(), b = _roll1d6();
  return { total: a + b, isDouble1: a === 1 && b === 1 };
}
function _roll2d6() { return _roll2d6Detailed().total; }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }
function _sideEnemyNameSafe(d) { return escapeHtml(d.sideEnemy.name.trim() || 'the second attacker'); }

// Necromancer fights replace SKILL outright with the trained level; darkness
// fights subtract 2 only if the Darkfight ability isn't held. The two never
// overlap in the source text, but if both were somehow ticked at once,
// darkness applies to whichever base SKILL results (Necromancer level or
// normal SKILL) rather than being mutually exclusive - there's no printed
// case that needs a stricter precedence than that.
function _effectiveSkill(d) {
  let skill = d.player.useNecromancerLevel ? d.player.necromancerLevel : d.player.skill;
  if (d.player.darknessFight && !d.player.hasDarkfight) skill -= 2;
  return skill;
}

function _threshold(d) { return Math.max(0, d.player.drawThreshold || 0); }

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.winAfterHits = 0;
  d.player.enemyAutoWinFirstRound = false;
  d.player.hitsLandedThisFight = 0;
  d.player.drawThreshold = 0;
  d.player.darknessFight = false;
  d.player.useNecromancerLevel = false;
  d.player.doubleOneDrowns = false;
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
  if (!d || _notReady(d) || d.player.stamina <= _threshold(d) || d.enemy.stamina <= _threshold(d) || d.pendingLuckQueue.length) return;
  const isFirstRound = d.roundsThisBattle === 0;
  d.roundsThisBattle++;

  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const threshold = _threshold(d);

  let playerWins = false, tie = false, drowned = false;
  if (isFirstRound && d.player.enemyAutoWinFirstRound) {
    _appendLog(d, t('battlesim231.log.enemy_firststrike', { enemy: _enemyNameSafe(d) }));
    playerWins = false;
  } else {
    const playerRoll = _roll2d6Detailed();
    const playerAS = playerRoll.total + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const enemyAS  = _roll2d6() + d.enemy.skill;
    _appendLog(d, t('battlesim231.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
    if (d.player.doubleOneDrowns && playerRoll.isDouble1) {
      _appendLog(d, t('battlesim231.log.drowned'));
      d.player.stamina = 0;
      drowned = true;
    } else if (playerAS === enemyAS) tie = true;
    else playerWins = playerAS > enemyAS;
  }

  if (drowned) {
    // handled below by the stamina<=threshold check
  } else if (tie) {
    _appendLog(d, t('battlesim231.log.both_avoided'));
  } else if (playerWins) {
    d.enemy.stamina = Math.max(threshold, d.enemy.stamina - 2);
    d.player.hitsLandedThisFight++;
    _appendLog(d, t('battlesim231.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.stamina > threshold) {
      d.enemy.stamina = threshold;
      _appendLog(d, t('battlesim231.log.press_advantage'));
    }
    if (d.enemy.stamina > threshold) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(threshold, d.player.stamina - woundDmg);
    _appendLog(d, t('battlesim231.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > threshold) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Paired fight: a second, independent exchange with its own fresh player
  // roll every round (including round 1) - covers any "two simultaneous
  // attackers, choose one target" case. The side attacker is never wounded
  // through this path.
  if (!drowned && d.pairedFight && d.sideEnemy.staminaMax > 0 && d.player.stamina > threshold) {
    const sidePlayerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    _appendLog(d, t('battlesim231.log.side_round', { enemy: _sideEnemyNameSafe(d), playerAS: sidePlayerAS, enemyAS: sideAS }));
    if (sideAS > sidePlayerAS) {
      d.player.stamina = Math.max(threshold, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim231.log.side_wounds', { enemy: _sideEnemyNameSafe(d), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > threshold) d.pendingLuckQueue.push({ kind: 'side-hit' });
    } else {
      _appendLog(d, t('battlesim231.log.side_fend', { enemy: _sideEnemyNameSafe(d) }));
    }
  }

  if (d.enemy.stamina <= threshold) {
    _appendLog(d, t('battlesim231.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= threshold) {
    _appendLog(d, t('battlesim231.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome.
function _testLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  const threshold = _threshold(d);
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(threshold, d.enemy.stamina - 2);
      _appendLog(d, t('battlesim231.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim231.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= threshold) { _appendLog(d, t('battlesim231.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim231.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(threshold, d.player.stamina - 1);
      _appendLog(d, t('battlesim231.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= threshold) {
      _appendLog(d, t('battlesim231.log.fallen', { skull: SVG_SKULL }));
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
  if (d.log.length) _appendLog(d, t('battlesim231.log.reset_sep'));
  _appendLog(d, t('battlesim231.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Provisions / Potions ────────────────────────────────────────────────────

function _eatProvisions() {
  const d = _data();
  if (!d || _notReady(d)) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > _threshold(d) && d.enemy.stamina > _threshold(d)) {
    showAlert(t('battlesim231.alert.provisions_midfight'));
    return;
  }
  if (d.player.provisionsLeft <= 0) return;
  if (d.player.stamina >= d.player.staminaInitial) {
    showAlert(t('battlesim231.alert.stamina_full'));
    return;
  }
  d.player.provisionsLeft--;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + PROVISIONS_HEAL);
  _appendLog(d, t('battlesim231.log.provisions', { before, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  saveState();
  _renderAll();
}

function _usePotion() {
  const d = _data();
  if (!d || _notReady(d) || d.player.potionUsesLeft <= 0) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > _threshold(d) && d.enemy.stamina > _threshold(d)) {
    showAlert(t('battlesim231.alert.potion_midfight'));
    return;
  }
  d.player.potionUsesLeft--;
  if (d.player.potionKey === 'skill') {
    d.player.skill = d.player.skillInitial;
    _appendLog(d, t('battlesim231.log.potion_skill', { n: d.player.skillInitial }));
  } else if (d.player.potionKey === 'strength') {
    d.player.stamina = d.player.staminaInitial;
    _appendLog(d, t('battlesim231.log.potion_strength', { n: d.player.staminaInitial }));
  } else {
    d.player.luckInitial += 1;
    d.player.luck = d.player.luckInitial;
    _appendLog(d, t('battlesim231.log.potion_fortune', { n: d.player.luckInitial }));
  }
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim231-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  const threshold = _threshold(d);
  if (notReady)                                       el.innerHTML = t('battlesim231.status.not_ready');
  else if (d.player.stamina <= threshold)              el.innerHTML = t('battlesim231.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= threshold)    el.innerHTML = t('battlesim231.status.victory', { trophy: SVG_TROPHY });
  else                                                  el.innerHTML = '';
  const over = notReady || d.player.stamina <= threshold || (hasEnemy && d.enemy.stamina <= threshold);
  document.getElementById('sim231-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim231-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim231-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim231-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > threshold && d.enemy.stamina > threshold);
}

function _renderItemsHtml(d) {
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim231.ui.item_darkfight_name')} <span class="bsim-tech-uses">(sec. 218)</span></div>
      <div class="bsim-tech-desc">${t('battlesim231.ui.item_darkfight_desc')}</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim231-item-darkfight" class="inv-edit-check" ${d.player.hasDarkfight ? 'checked' : ''}> ${t('battlesim231.ui.have_it')}</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim231.ui.item_necro_name')} <span class="bsim-tech-uses">(sec. 266)</span></div>
      <div class="bsim-tech-desc">${t('battlesim231.ui.item_necro_desc')}</div>
      <div class="bsim-tech-footer">${_numField(t('battlesim231.ui.item_necro_field'), 'sim231-item-necro')}</div>
    </div>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim231-history-summary');
  const listEl = document.getElementById('sim231-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim231.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim231.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim231.history.won') : t('battlesim231.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim231-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim231-player-skill').value      = d.player.skill;
  document.getElementById('sim231-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim231-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim231-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim231-player-luck').value       = d.player.luck;
  document.getElementById('sim231-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim231-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim231-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim231.btn.rolled') : t('battlesim231.btn.roll');

  const potionSel = document.getElementById('sim231-potion');
  potionSel.value = d.player.potionKey;
  potionSel.disabled = d.rolled;
  document.getElementById('sim231-potion-uses').textContent = t('battlesim231.ui.uses_left', { n: d.player.potionUsesLeft });
  document.getElementById('sim231-potion-use').disabled =
    _notReady(d) || d.player.potionUsesLeft <= 0 ||
    (d.roundsThisBattle > 0 && d.player.stamina > _threshold(d) && d.enemy.stamina > _threshold(d));

  document.getElementById('sim231-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim231-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim231-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim231-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim231-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim231-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim231-enemy-winhits').value    = d.player.winAfterHits;
  document.getElementById('sim231-enemy-firstwin').checked = d.player.enemyAutoWinFirstRound;
  document.getElementById('sim231-enemy-drawthreshold').value = d.player.drawThreshold;
  document.getElementById('sim231-enemy-darkness').checked = d.player.darknessFight;
  document.getElementById('sim231-enemy-necro').checked = d.player.useNecromancerLevel;
  document.getElementById('sim231-enemy-double1').checked = d.player.doubleOneDrowns;

  document.getElementById('sim231-paired').checked = d.pairedFight;
  document.getElementById('sim231-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim231-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim231-side-staminamax').value = d.sideEnemy.staminaMax;
  document.getElementById('sim231-side-fields').style.display = d.pairedFight ? '' : 'none';

  document.getElementById('sim231-item-list').innerHTML = _renderItemsHtml(d);
  const necroField = document.getElementById('sim231-item-necro');
  if (necroField) necroField.value = d.player.necromancerLevel;

  const pendingEl = document.getElementById('sim231-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim231() {
  const overlay = document.getElementById('sim231-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim231(); return; }
  _renderAll();
}

function openSim231() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim231-overlay').classList.add('active');
}

function closeSim231() {
  document.getElementById('sim231-overlay')?.classList.remove('active');
}

export function setSim231Visible(visible) {
  const btn = document.getElementById('sim231-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim231();
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

export function initSim231() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim231-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim231-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim231.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim231-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim231.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim231.ui.skill'), 'sim231-player-skill')}
            ${_numField(t('battlesim231.ui.skill_initial'), 'sim231-player-skillmax')}
            ${_numField(t('battlesim231.ui.stamina'), 'sim231-player-stamina')}
            ${_numField(t('battlesim231.ui.stamina_initial'), 'sim231-player-staminamax')}
            ${_numField(t('battlesim231.ui.luck'), 'sim231-player-luck')}
            ${_numField(t('battlesim231.ui.luck_initial'), 'sim231-player-luckmax')}
            ${_numField(t('battlesim231.ui.atkmod'), 'sim231-player-atkmod')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim231.ui.potion')}</span>
              <select id="sim231-potion" class="inv-edit-input bsim-select">
                ${POTIONS.map(p => `<option value="${p[0]}">${escapeHtml(t(p[1]))}</option>`).join('')}
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span id="sim231-potion-uses" class="bsim-ae-display"></span>
              <button id="sim231-potion-use" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim231.btn.drink')}</button>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim231.ui.provisions')}</span>
              <span id="sim231-provisions-left" class="bsim-ae-display"></span>
              <button id="sim231-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim231.btn.provisions_eat', { n: PROVISIONS_HEAL })}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim231.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim231.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim231-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim231-enemy-pick-dropdown">
                <ul id="sim231-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim231.ui.skill'), 'sim231-enemy-skill')}
            ${_numField(t('battlesim231.ui.stamina'), 'sim231-enemy-stamina')}
            ${_numField(t('battlesim231.ui.stamina_max'), 'sim231-enemy-staminamax')}
            ${_numField(t('battlesim231.ui.wound_dmg'), 'sim231-enemy-wounddmg')}
            ${_numField(t('battlesim231.ui.win_after_hits'), 'sim231-enemy-winhits')}
            ${_numField(t('battlesim231.ui.draw_threshold'), 'sim231-enemy-drawthreshold')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim231-enemy-firstwin" class="inv-edit-check"> ${t('battlesim231.ui.enemy_firstwin_toggle')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim231-enemy-darkness" class="inv-edit-check"> ${t('battlesim231.ui.darkness_toggle')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim231-enemy-necro" class="inv-edit-check"> ${t('battlesim231.ui.necro_toggle')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim231-enemy-double1" class="inv-edit-check"> ${t('battlesim231.ui.double1_toggle')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim231-paired" class="inv-edit-check"> ${t('battlesim231.ui.paired_toggle')}</label>
            </div>
            <div id="sim231-side-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim231.ui.pick')}</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim231-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim231-side-pick-dropdown">
                  <ul id="sim231-side-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField(t('battlesim231.ui.skill'), 'sim231-side-skill')}
              ${_numField(t('battlesim231.ui.stamina_max'), 'sim231-side-staminamax')}
            </div>
          </div>
          <div id="sim231-status" class="bsim-status"></div>
          <div id="sim231-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim231.btn.luck_prompt')}</span>
            <button id="sim231-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim231.btn.luck_yes')}</button>
            <button id="sim231-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim231.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim231-round" class="inv-add-btn bsim-action-primary">${t('battlesim231.btn.round')}</button>
            <button id="sim231-reset" class="inv-add-btn">${t('battlesim231.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>${t('battlesim231.ui.items')}</summary>
            <div id="sim231-item-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim231-history-summary">${t('battlesim231.history.summary', { n: 0 })}</summary>
            <div id="sim231-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim231-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim231-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim231);
  document.getElementById('sim231-close').addEventListener('click', closeSim231);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim231(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim231-overlay'),
    open:  openSim231,
    close: closeSim231,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim231();
  });

  document.getElementById('sim231-round').addEventListener('click', _runRound);
  document.getElementById('sim231-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim231-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim231-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim231-provisions').addEventListener('click', _eatProvisions);
  document.getElementById('sim231-potion-use').addEventListener('click', _usePotion);

  document.getElementById('sim231-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim231.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim231-potion').addEventListener('change', e => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.potionKey = e.target.value;
    saveState();
  });

  document.getElementById('sim231-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim231-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim231-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim231-enemy-firstwin').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.enemyAutoWinFirstRound = e.target.checked;
    saveState();
  });
  document.getElementById('sim231-enemy-darkness').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.darknessFight = e.target.checked;
    saveState();
  });
  document.getElementById('sim231-enemy-necro').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.useNecromancerLevel = e.target.checked;
    saveState();
  });
  document.getElementById('sim231-enemy-double1').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.doubleOneDrowns = e.target.checked;
    saveState();
  });

  const ITEM_CHECKBOX_MAP = {
    'sim231-item-darkfight': 'hasDarkfight',
  };
  document.getElementById('sim231-item-list').addEventListener('change', e => {
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
    'sim231-player-skill':      ['player', 'skill'],
    'sim231-player-skillmax':   ['player', 'skillInitial'],
    'sim231-player-stamina':    ['player', 'stamina'],
    'sim231-player-staminamax': ['player', 'staminaInitial'],
    'sim231-player-luck':       ['player', 'luck'],
    'sim231-player-luckmax':    ['player', 'luckInitial'],
    'sim231-player-atkmod':     ['player', 'attackModifier'],
    'sim231-enemy-skill':       ['enemy', 'skill'],
    'sim231-enemy-stamina':        ['enemy', 'stamina'],
    'sim231-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim231-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim231-enemy-winhits':        ['player', 'winAfterHits'],
    'sim231-enemy-drawthreshold':  ['player', 'drawThreshold'],
    'sim231-item-necro':           ['player', 'necromancerLevel'],
    'sim231-side-skill':        ['sideEnemy', 'skill'],
    'sim231-side-staminamax':   ['sideEnemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Attack modifier is the one field allowed to go negative (bare-handed/
    // disarmed/fatigue penalties are always a subtraction) - every other
    // field stays clamped to 0 or above.
    val = id === 'sim231-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim231-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim231-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim231-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim231-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim231-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim231-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim231-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim231-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim231-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim231-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim231-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim231-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim231-enemy-pick', 'sim231-enemy-pick-dropdown', enemy => {
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
  _setupEnemyAutocomplete('sim231-side-pick', 'sim231-side-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy.staminaMax = enemy.hp;
    saveState();
    _renderAll();
  });
}
