// ── Battle Simulator (The Warlock of Firetop Mountain, book 198) ────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 198 only) by the caller in boot.js via
// setSim198Visible().
// To remove: delete this file, remove its import line and initSim198()/
// setSim198Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with battlesim8.js/battlesim829.js/battlesim286.js/battlesim199.js/
// battlesim200.js/battlesim186.js/battlesim201.js, so only remove it if all eight are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system: combat is opposed
// 2d6+SKILL rolls each round, loser takes a flat 2 STAMINA, with an optional
// Test Your Luck after a hit lands that nudges the damage by 1 in either
// direction. All state lives in pt.sim198, per-user/per-book via
// currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=11';
import { showAlert } from '../play.js?v=55';
import { getPlayBtnRow } from '../charsheet.js?v=47';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=30';
import { t } from '../i18n.js?v=24';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Which of the 3 starting potions was picked (each: 2 uses). Skill/Strength
// restore SKILL/STAMINA to Initial; Fortune permanently raises Initial LUCK
// by 1 then refills current LUCK to that new Initial.
const POTIONS = [
  ['skill',    'Potion of Skill'],
  ['strength', 'Potion of Strength'],
  ['fortune',  'Potion of Fortune'],
];

const MAX_PROVISIONS = 10;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim198) {
    pt.sim198 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        potionKey: 'skill', potionUsesLeft: 2,
        provisionsLeft: MAX_PROVISIONS,
        hasMagicSword: false, hasRiverSword: false, hasMagicHelmet: false,
        invisibilityHave: false, invisibilityUsed: false, invisibilityActive: false,
        holyWaterHave: false, holyWaterUsed: false,
        rumHave: false, rumUsed: false,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      rolled: false,
      pendingLuck: null, // 'player-hit' | 'enemy-hit' | null - set right after a round lands a hit
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim198;
  if (d.rolled === undefined) d.rolled = false;
  if (d.pendingLuck === undefined) d.pendingLuck = null;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.potionKey === undefined) d.player.potionKey = 'skill';
  if (d.player.potionUsesLeft === undefined) d.player.potionUsesLeft = 2;
  if (d.player.provisionsLeft === undefined) d.player.provisionsLeft = MAX_PROVISIONS;
  if (d.player.hasMagicSword === undefined) d.player.hasMagicSword = false;
  if (d.player.hasRiverSword === undefined) d.player.hasRiverSword = false;
  if (d.player.hasMagicHelmet === undefined) d.player.hasMagicHelmet = false;
  if (d.player.invisibilityHave === undefined) d.player.invisibilityHave = false;
  if (d.player.invisibilityUsed === undefined) d.player.invisibilityUsed = false;
  if (d.player.invisibilityActive === undefined) d.player.invisibilityActive = false;
  if (d.player.holyWaterHave === undefined) d.player.holyWaterHave = false;
  if (d.player.holyWaterUsed === undefined) d.player.holyWaterUsed = false;
  if (d.player.rumHave === undefined) d.player.rumHave = false;
  if (d.player.rumUsed === undefined) d.player.rumUsed = false;
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

// Magic Sword and river sword each independently grant +1/+2 SKILL - the book
// treats them as separate finds, so if a player somehow keeps both this just
// stacks, matching the "add whatever you found" spirit of the other sims'
// extra-bonus fields rather than forcing an artificial either/or choice.
function _effectiveSkill(d) {
  let skill = d.player.skill;
  if (d.player.hasMagicSword) skill += 2;
  if (d.player.hasRiverSword) skill += 1;
  if (d.player.hasMagicHelmet) skill += 1;
  if (d.player.invisibilityActive) skill += 2;
  return skill;
}

function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerStamina: d.player.stamina, playerStaminaMax: d.player.staminaInitial,
    ts: Date.now(),
  });
  if (d.history.length > 100) d.history.shift();
  // Invisibility was for this one encounter, not a permanent buff - once you
  // win, it wears off so it doesn't silently carry over into later fights.
  // Left alone on a loss so a Reset retries the same fight with it still on.
  if (outcome === 'win') d.player.invisibilityActive = false;
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _runRound() {
  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0) return;
  d.roundsThisBattle++;
  d.pendingLuck = null;

  const attack = () => {
    const playerRoll = _roll2d6() + _effectiveSkill(d);
    const enemyRoll   = _roll2d6() + d.enemy.skill;
    _appendLog(d, `Round ${d.roundsThisBattle}: you ${playerRoll} vs ${_enemyNameSafe(d)} ${enemyRoll}.`);
    if (playerRoll === enemyRoll) {
      _appendLog(d, 'Both blows are avoided.');
      return;
    }
    if (playerRoll > enemyRoll) {
      const dmg = d.player.invisibilityActive ? 3 : 2;
      d.enemy.stamina = Math.max(0, d.enemy.stamina - dmg);
      _appendLog(d, `You wound ${_enemyNameSafe(d)} for ${dmg}. STAMINA: ${d.enemy.stamina}/${d.enemy.staminaMax}.`);
      if (d.enemy.stamina > 0) d.pendingLuck = 'player-hit';
    } else {
      let dmg = 2;
      if (d.player.invisibilityActive) {
        const r = _roll1d6();
        dmg = r === 6 ? 0 : (r === 2 || r === 4) ? 1 : 2;
        _appendLog(d, `${_enemyNameSafe(d)} swings through where you were - invisibility roll ${r}.`);
      }
      d.player.stamina = Math.max(0, d.player.stamina - dmg);
      _appendLog(d, `${_enemyNameSafe(d)} wounds you for ${dmg}. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
      if (d.player.stamina > 0 && dmg > 0) d.pendingLuck = 'enemy-hit';
    }
  };
  attack();

  if (d.enemy.stamina <= 0) {
    _appendLog(d, `${SVG_TROPHY} ${_enemyNameSafe(d)} is defeated!`);
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, `${SVG_SKULL} You have fallen in battle.`);
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome. On
// your own hit, Lucky deals 2 extra STAMINA damage (4 total), Unlucky gives
// back 1 (only 1 total). On a hit you took, Lucky gives back 1 STAMINA (only
// 1 total lost), Unlucky costs 1 extra (3 total).
function _testLuck() {
  const d = _data();
  if (!d || !d.pendingLuck || d.player.luck <= 0) return;
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (d.pendingLuck === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
      _appendLog(d, `Test Your Luck: ${roll} (Lucky) - the wound is worse. ${_enemyNameSafe(d)} STAMINA: ${d.enemy.stamina}/${d.enemy.staminaMax}.`);
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, `Test Your Luck: ${roll} (Unlucky) - the wound is less severe. ${_enemyNameSafe(d)} STAMINA: ${d.enemy.stamina}/${d.enemy.staminaMax}.`);
    }
    if (d.enemy.stamina <= 0) { _appendLog(d, `${SVG_TROPHY} ${_enemyNameSafe(d)} is defeated!`); _recordOutcome(d, 'win'); }
  } else {
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, `Test Your Luck: ${roll} (Lucky) - the wound is less severe. Your STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, `Test Your Luck: ${roll} (Unlucky) - the wound is worse. Your STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
    }
    if (d.player.stamina <= 0) { _appendLog(d, `${SVG_SKULL} You have fallen in battle.`); _recordOutcome(d, 'loss'); }
  }
  d.pendingLuck = null;
  saveState();
  _renderAll();
}

function _skipLuck() {
  const d = _data();
  if (!d) return;
  d.pendingLuck = null;
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.stamina = d.enemy.staminaMax;
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.pendingLuck = null;
  if (d.log.length) _appendLog(d, '──────────');
  _appendLog(d, `Battle reset. ${_enemyNameSafe(d)}'s STAMINA and yours are restored.`);
  saveState();
  _renderAll();
}

// ── Provisions / Potions / one-time items ───────────────────────────────────

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

// Good for one dose per the book. Activates immediately and wears off
// automatically the moment this fight is won (see _recordOutcome), since it
// was only ever meant to cover the one encounter you drink it for.
function _useInvisibility() {
  const d = _data();
  if (!d || !d.player.invisibilityHave || d.player.invisibilityUsed) return;
  d.player.invisibilityUsed = true;
  d.player.invisibilityActive = true;
  _appendLog(d, 'You drink the Potion of Invisibility.');
  saveState();
  _renderAll();
}

function _useHolyWater() {
  const d = _data();
  if (!d || !d.player.holyWaterHave || d.player.holyWaterUsed) return;
  d.player.holyWaterUsed = true;
  d.player.stamina = Math.max(0, Math.min(d.player.staminaInitial, d.player.staminaInitial - 2));
  d.player.skill = Math.max(0, d.player.skillInitial - 1);
  d.player.luck = Math.min(d.player.luckInitial + 4, d.player.luck + 4);
  _appendLog(d, 'You drink the Holy Water.');
  saveState();
  _renderAll();
}

function _useRum() {
  const d = _data();
  if (!d || !d.player.rumHave || d.player.rumUsed) return;
  d.player.rumUsed = true;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 6);
  d.player.luck = d.player.luck + 1;
  _appendLog(d, 'You drink the Rum: +6 STAMINA, +1 LUCK.');
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim198-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = 'Roll your starting SKILL, STAMINA and LUCK to begin.';
  else if (d.player.stamina <= 0)                   el.innerHTML = `${SVG_SKULL} You have fallen in battle.`;
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = `${SVG_TROPHY} Victory!`;
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim198-round').disabled = over || !!d.pendingLuck;
  document.getElementById('sim198-luck-yes').disabled = notReady || !d.pendingLuck || d.player.luck <= 0;
  document.getElementById('sim198-luck-no').disabled  = notReady || !d.pendingLuck;
  document.getElementById('sim198-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
}

function _renderItemsHtml(d) {
  const notReady = _notReady(d);
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Magic Sword <span class="bsim-tech-uses">(sec. 27)</span></div>
      <div class="bsim-tech-desc">+2 SKILL, +2 LUCK.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim198-item-magicsword" class="inv-edit-check" ${d.player.hasMagicSword ? 'checked' : ''}> Have it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">River Sword <span class="bsim-tech-uses">(sec. 344)</span></div>
      <div class="bsim-tech-desc">+1 SKILL while used.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim198-item-riversword" class="inv-edit-check" ${d.player.hasRiverSword ? 'checked' : ''}> Have it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Magic Helmet <span class="bsim-tech-uses">(sec. 325)</span></div>
      <div class="bsim-tech-desc">+1 to all your Attack Strength rolls while worn.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim198-item-helmet" class="inv-edit-check" ${d.player.hasMagicHelmet ? 'checked' : ''}> Have it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Potion of Invisibility <span class="bsim-tech-uses">(sec. 39/105)</span></div>
      <div class="bsim-tech-desc">Good for one dose. While active: +2 Attack Strength, your hits do 3 damage. Enemy hits are reduced (1d6: odd=2, 2/4=1, 6=parried).</div>
      <div class="bsim-tech-footer">
        <label class="inv-edit-check-label"><input type="checkbox" id="sim198-item-invisibility-have" class="inv-edit-check" ${d.player.invisibilityHave ? 'checked' : ''}> Have it</label>
        <button class="inv-edit-done bsim-tech-btn${(notReady || !d.player.invisibilityHave || d.player.invisibilityUsed) ? ' bsim-tech-row--depleted' : ''}" id="sim198-item-invisibility-use" ${(notReady || !d.player.invisibilityHave || d.player.invisibilityUsed) ? 'disabled' : ''}>${d.player.invisibilityUsed ? 'Used' : 'Drink'}</button>
      </div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Holy Water <span class="bsim-tech-uses">(sec. 109)</span></div>
      <div class="bsim-tech-desc">One-time: STAMINA to Initial−2, SKILL to Initial−1, +4 LUCK.</div>
      <div class="bsim-tech-footer">
        <label class="inv-edit-check-label"><input type="checkbox" id="sim198-item-holywater-have" class="inv-edit-check" ${d.player.holyWaterHave ? 'checked' : ''}> Have it</label>
        <button class="inv-edit-done bsim-tech-btn${(notReady || !d.player.holyWaterHave || d.player.holyWaterUsed) ? ' bsim-tech-row--depleted' : ''}" id="sim198-item-holywater-use" ${(notReady || !d.player.holyWaterHave || d.player.holyWaterUsed) ? 'disabled' : ''}>${d.player.holyWaterUsed ? 'Used' : 'Drink'}</button>
      </div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Rum <span class="bsim-tech-uses">(sec. 330)</span></div>
      <div class="bsim-tech-desc">One-time: +6 STAMINA, +1 LUCK.</div>
      <div class="bsim-tech-footer">
        <label class="inv-edit-check-label"><input type="checkbox" id="sim198-item-rum-have" class="inv-edit-check" ${d.player.rumHave ? 'checked' : ''}> Have it</label>
        <button class="inv-edit-done bsim-tech-btn${(notReady || !d.player.rumHave || d.player.rumUsed) ? ' bsim-tech-row--depleted' : ''}" id="sim198-item-rum-use" ${(notReady || !d.player.rumHave || d.player.rumUsed) ? 'disabled' : ''}>${d.player.rumUsed ? 'Used' : 'Drink'}</button>
      </div>
    </div>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim198-history-summary');
  const listEl = document.getElementById('sim198-history-list');
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
  const el = document.getElementById('sim198-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim198-player-skill').value      = d.player.skill;
  document.getElementById('sim198-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim198-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim198-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim198-player-luck').value       = d.player.luck;
  document.getElementById('sim198-player-luckmax').value    = d.player.luckInitial;

  const rollBtn = document.getElementById('sim198-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? 'Rolled' : 'Roll starting SKILL/STAMINA/LUCK';

  const potionSel = document.getElementById('sim198-potion');
  potionSel.value = d.player.potionKey;
  potionSel.disabled = d.rolled;
  document.getElementById('sim198-potion-uses').textContent = `${d.player.potionUsesLeft} use(s) left`;
  document.getElementById('sim198-potion-use').disabled = _notReady(d) || d.player.potionUsesLeft <= 0;

  document.getElementById('sim198-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim198-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim198-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim198-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim198-enemy-staminamax').value = d.enemy.staminaMax;

  document.getElementById('sim198-item-list').innerHTML = _renderItemsHtml(d);

  const pendingEl = document.getElementById('sim198-luck-prompt');
  pendingEl.style.display = d.pendingLuck ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim198() {
  const overlay = document.getElementById('sim198-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim198(); return; }
  _renderAll();
}

function openSim198() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim198-overlay').classList.add('active');
}

function closeSim198() {
  document.getElementById('sim198-overlay')?.classList.remove('active');
}

export function setSim198Visible(visible) {
  const btn = document.getElementById('sim198-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim198();
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
  const input    = document.getElementById('sim198-enemy-pick');
  const dropdown = document.getElementById('sim198-enemy-pick-dropdown');
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
      `<li role="option" id="sim198-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">SKILL:${e.attack ?? '?'} STAMINA:${e.hp ?? '?'}</span></li>`
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
    d.pendingLuck = null;
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

export function initSim198() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim198-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">Battle Simulator</span>
        <button id="sim198-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">You</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim198-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">Roll starting SKILL/STAMINA/LUCK</button>
            </div>
            ${_numField('SKILL', 'sim198-player-skill')}
            ${_numField('Initial SKILL', 'sim198-player-skillmax')}
            ${_numField('STAMINA', 'sim198-player-stamina')}
            ${_numField('Initial STAMINA', 'sim198-player-staminamax')}
            ${_numField('LUCK', 'sim198-player-luck')}
            ${_numField('Initial LUCK', 'sim198-player-luckmax')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Potion</span>
              <select id="sim198-potion" class="inv-edit-input bsim-select">
                ${POTIONS.map(p => `<option value="${p[0]}">${escapeHtml(p[1])}</option>`).join('')}
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span id="sim198-potion-uses" class="bsim-ae-display"></span>
              <button id="sim198-potion-use" class="inv-edit-done bsim-ae-roll-btn" type="button">Drink</button>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">Provisions</span>
              <span id="sim198-provisions-left" class="bsim-ae-display"></span>
              <button id="sim198-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">Eat (+4 STAMINA)</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">Enemy</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Pick</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim198-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim198-enemy-pick-dropdown">
                <ul id="sim198-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField('SKILL', 'sim198-enemy-skill')}
            ${_numField('STAMINA', 'sim198-enemy-stamina')}
            ${_numField('Max STAMINA', 'sim198-enemy-staminamax')}
          </div>
          <div id="sim198-status" class="bsim-status"></div>
          <div id="sim198-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">Test Your Luck?</span>
            <button id="sim198-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">Test Luck</button>
            <button id="sim198-luck-no" class="inv-edit-done bsim-heal-btn" type="button">Skip</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim198-round" class="inv-add-btn bsim-action-primary">Round</button>
            <button id="sim198-reset" class="inv-add-btn">Reset</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>Items &amp; Potions</summary>
            <div id="sim198-item-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim198-history-summary">Battle History (0)</summary>
            <div id="sim198-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim198-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim198-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim198);
  document.getElementById('sim198-close').addEventListener('click', closeSim198);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim198(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim198-overlay'),
    open:  openSim198,
    close: closeSim198,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim198();
  });

  document.getElementById('sim198-round').addEventListener('click', _runRound);
  document.getElementById('sim198-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim198-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim198-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim198-provisions').addEventListener('click', _eatProvisions);
  document.getElementById('sim198-potion-use').addEventListener('click', _usePotion);

  document.getElementById('sim198-roll').addEventListener('click', () => {
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

  document.getElementById('sim198-potion').addEventListener('change', e => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.potionKey = e.target.value;
    saveState();
  });

  document.getElementById('sim198-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim198-item-list').addEventListener('click', e => {
    const d = _data();
    if (!d) return;
    if (e.target.id === 'sim198-item-holywater-use') { _useHolyWater(); return; }
    if (e.target.id === 'sim198-item-rum-use') { _useRum(); return; }
    if (e.target.id === 'sim198-item-invisibility-use') { _useInvisibility(); return; }
  });
  document.getElementById('sim198-item-list').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    const map = {
      'sim198-item-magicsword':   ['hasMagicSword'],
      'sim198-item-riversword':   ['hasRiverSword'],
      'sim198-item-helmet':       ['hasMagicHelmet'],
      'sim198-item-invisibility-have': ['invisibilityHave'],
      'sim198-item-holywater-have': ['holyWaterHave'],
      'sim198-item-rum-have':       ['rumHave'],
    };
    const key = map[e.target.id];
    if (!key) return;
    d.player[key[0]] = e.target.checked;
    saveState();
    _renderInputs();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim198-player-skill':      ['player', 'skill'],
    'sim198-player-skillmax':   ['player', 'skillInitial'],
    'sim198-player-stamina':    ['player', 'stamina'],
    'sim198-player-staminamax': ['player', 'staminaInitial'],
    'sim198-player-luck':       ['player', 'luck'],
    'sim198-player-luckmax':    ['player', 'luckInitial'],
    'sim198-enemy-skill':       ['enemy', 'skill'],
    'sim198-enemy-stamina':        ['enemy', 'stamina'],
    'sim198-enemy-staminamax':     ['enemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = Math.max(0, val);
    if (id === 'sim198-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim198-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim198-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim198-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim198-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim198-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim198-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim198-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim198-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim198-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete();
}
