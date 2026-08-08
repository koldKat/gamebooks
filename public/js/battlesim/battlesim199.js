// ── Battle Simulator (The Citadel of Chaos, book 199) ───────────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 199 only) by the caller in boot.js via
// setSim199Visible().
// To remove: delete this file, remove its import line and initSim199()/
// setSim199Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with battlesim8.js/battlesim829.js/battlesim286.js/battlesim198.js/
// battlesim200.js/battlesim186.js/battlesim201.js, so only remove it if all eight are gone).
//
// Same core Fighting Fantasy SKILL/STAMINA/LUCK combat as book 198, plus a
// MAGIC system unique to this book: a MAGIC score (2d6+6) is a total budget
// of spell-casts chosen freely across a fixed list at the start of the
// adventure. Skill/Stamina/Luck Spells have a well-defined universal formula
// (restore that stat by floor(Initial/2), capped at Initial) and are
// automated here; the other 9 spells (Creature Copy, E.S.P., Fire, Fool's
// Gold, Illusion, Levitation, Shielding, Strength, Weakness) have entirely
// narrative, per-section effects with no fixed formula, so they're tracked
// as a simple use-counter only - casting one just logs it and decrements the
// count, and any stat change it causes gets applied by hand via the plain
// steppers, same spirit as book 198's one-off narrative bonuses.
// This book also has no Provisions/eating mechanic at all - confirmed by a
// full read of the rules text - STAMINA can only be restored via the
// Stamina Spell, so there's no Provisions field here unlike book 198.
// Two items carry a fixed mechanical bonus (Sun-Sword +4 SKILL, sec 345; the
// Balthus Dire endgame's enchanted sword +2 Attack Strength, sec 353) and
// are toggleable in the Items panel, same pattern as book 198's Magic Sword.
// A third item, the two-dose Potion of Magik (sec 235), permanently raises
// MAGIC score by 1 per dose - a one-time-use consumable like book 198's
// Holy Water/Rum, not a passive toggle.
// All state lives in pt.sim199, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=11';
import { showAlert } from '../play.js?v=104';
import { getPlayBtnRow } from '../charsheet.js?v=77';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=60';
import { t } from '../i18n.js?v=49';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// [key, label, kind]. kind 'restore' = automated (Skill/Stamina/Luck Spells,
// each restore that stat by floor(Initial/2), capped at Initial). kind
// 'manual' = narrative-only, casting it just logs + decrements the count,
// no fixed formula to automate.
const SPELLS = [
  ['skillSpell',    'Skill Spell',    'restore'],
  ['staminaSpell',  'Stamina Spell',  'restore'],
  ['luckSpell',     'Luck Spell',     'restore'],
  ['creatureCopy',  'Creature Copy',  'manual'],
  ['esp',           'E.S.P.',         'manual'],
  ['fire',          'Fire',           'manual'],
  ['foolsGold',     "Fool's Gold",    'manual'],
  ['illusion',      'Illusion',       'manual'],
  ['levitation',    'Levitation',     'manual'],
  ['shielding',     'Shielding',      'manual'],
  ['strength',      'Strength',       'manual'],
  ['weakness',      'Weakness',       'manual'],
];

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim199) {
    pt.sim199 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        magic: 0, magicInitial: 0,
        spells: Object.fromEntries(SPELLS.map(([key]) => [key, { have: 0, used: 0 }])),
        hasSunSword: false, hasEnchantedSword: false,
        magikHave: false, magikUsed: 0,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      rolled: false,
      pendingLuck: null, // 'player-hit' | 'enemy-hit' | null - set right after a round lands a hit
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim199;
  if (d.rolled === undefined) d.rolled = false;
  if (d.pendingLuck === undefined) d.pendingLuck = null;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.magic === undefined) d.player.magic = 0;
  if (d.player.magicInitial === undefined) d.player.magicInitial = 0;
  if (!d.player.spells) d.player.spells = {};
  for (const [key] of SPELLS) {
    if (!d.player.spells[key]) d.player.spells[key] = { have: 0, used: 0 };
    if (d.player.spells[key].have === undefined) d.player.spells[key].have = 0;
    if (d.player.spells[key].used === undefined) d.player.spells[key].used = 0;
  }
  if (d.player.hasSunSword === undefined) d.player.hasSunSword = false;
  if (d.player.hasEnchantedSword === undefined) d.player.hasEnchantedSword = false;
  if (d.player.magikHave === undefined) d.player.magikHave = false;
  if (d.player.magikUsed === undefined) d.player.magikUsed = 0;
  return d;
}

function _notReady(d) { return !d.rolled; }

function _roll2d6() { return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }
function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

// Sun-Sword (sec 345, +4 SKILL) and the enchanted sword from the Balthus
// Dire endgame (sec 353, +2 to the Attack Strength roll - functionally the
// same as +2 SKILL, since Attack Strength = 2d6+SKILL) are the only two
// items in this book with a fixed mechanical bonus. The book never says you
// can't carry both, so - matching book 198's "add whatever you found"
// treatment of its own overlapping weapon bonuses - they simply stack.
function _effectiveSkill(d) {
  let skill = d.player.skill;
  if (d.player.hasSunSword) skill += 4;
  if (d.player.hasEnchantedSword) skill += 2;
  return skill;
}

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || 'the enemy'; }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

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
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0) return;
  d.roundsThisBattle++;
  d.pendingLuck = null;

  const playerRoll = _roll2d6() + _effectiveSkill(d);
  const enemyRoll   = _roll2d6() + d.enemy.skill;
  _appendLog(d, `Round ${d.roundsThisBattle}: you ${playerRoll} vs ${_enemyNameSafe(d)} ${enemyRoll}.`);
  if (playerRoll === enemyRoll) {
    _appendLog(d, 'Both blows are avoided.');
  } else if (playerRoll > enemyRoll) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
    _appendLog(d, `You wound ${_enemyNameSafe(d)} for 2. STAMINA: ${d.enemy.stamina}/${d.enemy.staminaMax}.`);
    if (d.enemy.stamina > 0) d.pendingLuck = 'player-hit';
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - 2);
    _appendLog(d, `${_enemyNameSafe(d)} wounds you for 2. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
    if (d.player.stamina > 0) d.pendingLuck = 'enemy-hit';
  }

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
// 1 total lost), Unlucky costs 1 extra (3 total). Same rules as book 198.
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

// ── Spells ───────────────────────────────────────────────────────────────────

const SPELL_LABELS = Object.fromEntries(SPELLS.map(([key, label]) => [key, label]));

function _castSpell(key) {
  const d = _data();
  if (!d || _notReady(d)) return;
  const s = d.player.spells[key];
  if (!s || s.have - s.used <= 0 || d.player.magic <= 0) return;
  s.used++;
  d.player.magic = Math.max(0, d.player.magic - 1);
  const spec = SPELLS.find(sp => sp[0] === key);
  if (spec[2] === 'restore') {
    const statKey = key === 'skillSpell' ? 'skill' : key === 'staminaSpell' ? 'stamina' : 'luck';
    const initKey = `${statKey}Initial`;
    const before = d.player[statKey];
    d.player[statKey] = Math.min(d.player[initKey], d.player[statKey] + Math.floor(d.player[initKey] / 2));
    _appendLog(d, `You cast ${SPELL_LABELS[key]}: ${statKey.toUpperCase()} ${before} → ${d.player[statKey]}/${d.player[initKey]}.`);
  } else {
    _appendLog(d, `You cast ${SPELL_LABELS[key]}. Apply its effect for this page by hand.`);
  }
  saveState();
  _renderAll();
}

// Potion of Magik (sec 235): 2 doses, each permanently raises MAGIC score by
// 1 (the book frames it as "refunding" the spell you just cast rather than
// growing your budget, but the net mechanical effect is the same either
// way - one more spell-cast becomes available overall).
function _useMagikPotion() {
  const d = _data();
  if (!d || !d.player.magikHave || d.player.magikUsed >= 2) return;
  d.player.magikUsed++;
  d.player.magicInitial += 1;
  d.player.magic += 1;
  _appendLog(d, `You drink the Potion of Magik: MAGIC score raised to ${d.player.magicInitial} (${2 - d.player.magikUsed} dose${2 - d.player.magikUsed === 1 ? '' : 's'} left).`);
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim199-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  // A fresh enemy defaults to stamina/staminaMax both 0 (no encounter picked
  // yet), which looks identical to "defeated" if only stamina<=0 is checked -
  // staminaMax>0 confirms a real enemy is actually loaded first.
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = 'Roll your starting SKILL, STAMINA, LUCK and MAGIC to begin.';
  else if (d.player.stamina <= 0)                   el.innerHTML = `${SVG_SKULL} You have fallen in battle.`;
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = `${SVG_TROPHY} Victory!`;
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim199-round').disabled = over || !!d.pendingLuck;
  document.getElementById('sim199-luck-yes').disabled = notReady || !d.pendingLuck || d.player.luck <= 0;
  document.getElementById('sim199-luck-no').disabled  = notReady || !d.pendingLuck;
}

function _renderItemsHtml(d) {
  const notReady = _notReady(d);
  const magikLeft = 2 - d.player.magikUsed;
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Sun-Sword <span class="bsim-tech-uses">(sec. 345)</span></div>
      <div class="bsim-tech-desc">+4 SKILL while used.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim199-item-sunsword" class="inv-edit-check" ${d.player.hasSunSword ? 'checked' : ''}> Have it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Enchanted Sword <span class="bsim-tech-uses">(sec. 353)</span></div>
      <div class="bsim-tech-desc">+2 to your Attack Strength roll while used.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim199-item-enchantedsword" class="inv-edit-check" ${d.player.hasEnchantedSword ? 'checked' : ''}> Have it</label></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Potion of Magik <span class="bsim-tech-uses">(sec. 235)</span></div>
      <div class="bsim-tech-desc">2 doses. Each permanently raises MAGIC score by 1.</div>
      <div class="bsim-tech-footer">
        <label class="inv-edit-check-label"><input type="checkbox" id="sim199-item-magik-have" class="inv-edit-check" ${d.player.magikHave ? 'checked' : ''}> Have it</label>
        <span class="bsim-tech-uses${(notReady || !d.player.magikHave || magikLeft <= 0) ? ' bsim-tech-row--depleted' : ''}">${Math.max(0, magikLeft)} left</span>
        <button class="inv-edit-done bsim-tech-btn${(notReady || !d.player.magikHave || magikLeft <= 0) ? ' bsim-tech-row--depleted' : ''}" id="sim199-item-magik-use" ${(notReady || !d.player.magikHave || magikLeft <= 0) ? 'disabled' : ''}>${magikLeft <= 0 ? 'Used' : 'Drink'}</button>
      </div>
    </div>`;
}

function _renderSpellsHtml(d) {
  const notReady = _notReady(d);
  return SPELLS.map(([key, label]) => {
    const s = d.player.spells[key];
    const left = Math.max(0, s.have - s.used);
    const depleted = left <= 0 || d.player.magic <= 0;
    return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${escapeHtml(label)}</div>
      <div class="bsim-tech-footer">
        <div class="inv-qty-wrap">
          <button class="inv-qty-btn" data-id="sim199-spell-${key}-have" data-delta="-1">−</button>
          <input id="sim199-spell-${key}-have" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
          <button class="inv-qty-btn" data-id="sim199-spell-${key}-have" data-delta="1">+</button>
        </div>
        <span class="bsim-tech-uses${depleted ? ' bsim-tech-row--depleted' : ''}">${left} left</span>
        <button class="inv-edit-done bsim-tech-btn${depleted ? ' bsim-tech-row--depleted' : ''}" data-cast="${key}" ${(notReady || depleted) ? 'disabled' : ''}>Cast</button>
      </div>
    </div>`;
  }).join('');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim199-history-summary');
  const listEl = document.getElementById('sim199-history-list');
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
  const el = document.getElementById('sim199-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim199-player-skill').value      = d.player.skill;
  document.getElementById('sim199-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim199-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim199-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim199-player-luck').value       = d.player.luck;
  document.getElementById('sim199-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim199-player-magic').value      = d.player.magic;
  document.getElementById('sim199-player-magicmax').value   = d.player.magicInitial;

  const rollBtn = document.getElementById('sim199-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? 'Rolled' : 'Roll starting SKILL/STAMINA/LUCK/MAGIC';

  document.getElementById('sim199-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim199-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim199-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim199-enemy-staminamax').value = d.enemy.staminaMax;

  document.getElementById('sim199-item-list').innerHTML = _renderItemsHtml(d);
  document.getElementById('sim199-spell-list').innerHTML = _renderSpellsHtml(d);
  for (const [key] of SPELLS) {
    const el = document.getElementById(`sim199-spell-${key}-have`);
    if (el) el.value = d.player.spells[key].have;
  }
  const allocated = SPELLS.reduce((sum, [key]) => sum + d.player.spells[key].have, 0);
  const hintEl = document.getElementById('sim199-spell-hint');
  if (hintEl) {
    hintEl.textContent = d.rolled
      ? `Use +/- to spend your MAGIC score on however many casts of each spell you want (${allocated}/${d.player.magicInitial} allocated). Cast unlocks once a spell has at least 1 left - you can keep reallocating anytime.`
      : `Roll first to reveal your MAGIC score, then use +/- on each spell to spend it on however many casts you want of that spell. Cast stays disabled until you roll and give a spell at least 1 use.`;
  }

  const pendingEl = document.getElementById('sim199-luck-prompt');
  pendingEl.style.display = d.pendingLuck ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim199() {
  const overlay = document.getElementById('sim199-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim199(); return; }
  _renderAll();
}

function openSim199() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim199-overlay').classList.add('active');
}

function closeSim199() {
  document.getElementById('sim199-overlay')?.classList.remove('active');
}

export function setSim199Visible(visible) {
  const btn = document.getElementById('sim199-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim199();
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
  const input    = document.getElementById('sim199-enemy-pick');
  const dropdown = document.getElementById('sim199-enemy-pick-dropdown');
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
      `<li role="option" id="sim199-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">SKILL:${e.attack ?? '?'} STAMINA:${e.hp ?? '?'}</span></li>`
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

export function initSim199() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim199-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">Battle Simulator</span>
        <button id="sim199-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">You</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim199-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">Roll starting SKILL/STAMINA/LUCK/MAGIC</button>
            </div>
            ${_numField('SKILL', 'sim199-player-skill')}
            ${_numField('Initial SKILL', 'sim199-player-skillmax')}
            ${_numField('STAMINA', 'sim199-player-stamina')}
            ${_numField('Initial STAMINA', 'sim199-player-staminamax')}
            ${_numField('LUCK', 'sim199-player-luck')}
            ${_numField('Initial LUCK', 'sim199-player-luckmax')}
            ${_numField('MAGIC', 'sim199-player-magic')}
            ${_numField('Initial MAGIC', 'sim199-player-magicmax')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">Enemy</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Pick</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim199-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim199-enemy-pick-dropdown">
                <ul id="sim199-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField('SKILL', 'sim199-enemy-skill')}
            ${_numField('STAMINA', 'sim199-enemy-stamina')}
            ${_numField('Max STAMINA', 'sim199-enemy-staminamax')}
          </div>
          <div id="sim199-status" class="bsim-status"></div>
          <div id="sim199-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">Test Your Luck?</span>
            <button id="sim199-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">Test Luck</button>
            <button id="sim199-luck-no" class="inv-edit-done bsim-heal-btn" type="button">Skip</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim199-round" class="inv-add-btn bsim-action-primary">Round</button>
            <button id="sim199-reset" class="inv-add-btn">Reset</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary>Items</summary>
            <div id="sim199-item-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history" open>
            <summary>Spells</summary>
            <div id="sim199-spell-hint" class="bsim-tech-desc"></div>
            <div id="sim199-spell-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim199-history-summary">Battle History (0)</summary>
            <div id="sim199-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim199-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim199-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim199);
  document.getElementById('sim199-close').addEventListener('click', closeSim199);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim199(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim199-overlay'),
    open:  openSim199,
    close: closeSim199,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim199();
  });

  document.getElementById('sim199-round').addEventListener('click', _runRound);
  document.getElementById('sim199-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim199-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim199-luck-no').addEventListener('click', _skipLuck);

  document.getElementById('sim199-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.magicInitial   = _roll2d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.player.magic   = d.player.magicInitial;
    d.rolled = true;
    _appendLog(d, `Starting stats rolled: SKILL ${d.player.skillInitial}, STAMINA ${d.player.staminaInitial}, LUCK ${d.player.luckInitial}, MAGIC ${d.player.magicInitial}.`);
    saveState();
    _renderAll();
  });

  document.getElementById('sim199-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim199-spell-list').addEventListener('click', e => {
    const key = e.target.dataset.cast;
    if (key) _castSpell(key);
  });

  document.getElementById('sim199-item-list').addEventListener('click', e => {
    if (e.target.id === 'sim199-item-magik-use') _useMagikPotion();
  });
  document.getElementById('sim199-item-list').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    const map = { 'sim199-item-sunsword': 'hasSunSword', 'sim199-item-enchantedsword': 'hasEnchantedSword', 'sim199-item-magik-have': 'magikHave' };
    const key = map[e.target.id];
    if (!key) return;
    d.player[key] = e.target.checked;
    saveState();
    _renderInputs();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim199-player-skill':      ['player', 'skill'],
    'sim199-player-skillmax':   ['player', 'skillInitial'],
    'sim199-player-stamina':    ['player', 'stamina'],
    'sim199-player-staminamax': ['player', 'staminaInitial'],
    'sim199-player-luck':       ['player', 'luck'],
    'sim199-player-luckmax':    ['player', 'luckInitial'],
    'sim199-player-magic':      ['player', 'magic'],
    'sim199-player-magicmax':   ['player', 'magicInitial'],
    'sim199-enemy-skill':       ['enemy', 'skill'],
    'sim199-enemy-stamina':        ['enemy', 'stamina'],
    'sim199-enemy-staminamax':     ['enemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (map) {
      val = Math.max(0, val);
      if (id === 'sim199-player-skill') val = Math.min(val, d.player.skillInitial);
      if (id === 'sim199-player-stamina') val = Math.min(val, d.player.staminaInitial);
      if (id === 'sim199-player-luck') val = Math.min(val, d.player.luckInitial);
      if (id === 'sim199-player-magic') val = Math.min(val, d.player.magicInitial);
      if (id === 'sim199-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
      d[map[0]][map[1]] = val;
      if (id === 'sim199-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
      if (id === 'sim199-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
      if (id === 'sim199-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
      if (id === 'sim199-player-magicmax') d.player.magic = Math.min(d.player.magic, val);
      if (id === 'sim199-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
      saveState();
      _renderInputs();
      return;
    }
    const m = id.match(/^sim199-spell-(.+)-have$/);
    if (m && SPELL_LABELS[m[1]]) {
      const s = d.player.spells[m[1]];
      s.have = Math.max(s.used, Math.max(0, val));
      saveState();
      _renderInputs();
    }
  }
  overlay.addEventListener('input', e => {
    const input = e.target;
    if (!input.classList?.contains('inv-qty-input') || !input.id.startsWith('sim199-')) return;
    const raw = String(input.value).replace(/[^0-9]/g, '');
    if (raw !== input.value) input.value = raw;
    _applyField(input.id, Number(raw) || 0);
  });
  overlay.addEventListener('click', e => {
    const btnEl = e.target.closest('.inv-qty-btn');
    if (!btnEl || !btnEl.dataset.id?.startsWith('sim199-')) return;
    const input = document.getElementById(btnEl.dataset.id);
    if (!input) return;
    const next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
    _applyField(btnEl.dataset.id, next);
  });

  _setupEnemyAutocomplete();
}
