// ── Battle Simulator (Battleblade Warrior, book 227) ─────────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 227 only) by the caller in boot.js via
// setSim227Visible().
// To remove: delete this file, remove its import line and initSim227()/
// setSim227Visible() calls from boot.js, remove 'sim227' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system, same core numbers,
// Test Your Luck table and score ceilings as every other FF sim in this app -
// SKILL 1d6+6, STAMINA 2d6+12, LUCK 1d6+6. Provisions per the book's own
// rules text: 4 Provisions max, each restores up to 4 STAMINA, capped at
// Initial.
//
// attackModifier/enemyWoundDamage/pairedFight/sideEnemy/sideEnemy2/
// winAfterHits/enemyStaminaFloor are reused exactly as books 200-216 built
// them. pairedFight covers this book's several "fight them two at a time"
// group encounters (§43 three Rat Men, §64/§320 five Panther Warriors,
// §70 four Ishkarim, §90/§216 four Lizard Men, §109/§212 Swamp Goblin
// boat-raids, §200 three Shadow Ghouls, §266/§365 two Marsh Orcs, §332
// three Krell) - the second (and third, via tripleFight) attacker strikes
// independently every round and is never woundable, matching the printed
// "resolve your own attack as usual; any OTHER opponent with a higher
// Attack Strength scores a hit on you" rule. The book's multi-attack single
// monsters (§207 Triceratops, §208 Calacorm, both "2 attacks per round") are
// modeled the same way: a second, unwoundable "attacker" sharing the main
// enemy's SKILL score.
//
// Deliberately NOT modeled: the §34 Tyrannosaurus-vs-Triceratops spectacle
// (the player never fights it - "you may fight the battle out if you wish,
// but by the time it is over you are well away from it" is flavor text, not
// a real combat branch) and the §36 three-way battle where Lecarte and Snag
// fight alongside the player against several Lizard Men (too irregular for
// this sim's one-or-two-attacker model - resolve that fight by hand).
//
// book_enemies.attack holds SKILL, .hp holds STAMINA, .defense unused - same
// convention as every other FF sim. 72 rows read from all 400 sections;
// several recurring encounters (Black Panther x3, Giant Slug x4, Warrior-
// King x2, Marsh Orc pair x2 entries) go to different destinations or are
// separate instances and are kept as separate rows, matching this book's
// own repeated-but-distinct stat blocks.
//
// All state lives in pt.sim227, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const SIDE_WOUND_DMG = 2;
const MAX_PROVISIONS = 4;
const MEAL_HEAL = 4;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim227) {
    pt.sim227 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        attackModifier: 0,
        enemyWoundDamage: 2,
        winAfterHits: 0,
        enemyStaminaFloor: 0,
        hitsLandedThisFight: 0,
        provisions: MAX_PROVISIONS,
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
  const d = pt.sim227;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.winAfterHits === undefined) d.player.winAfterHits = 0;
  if (d.player.enemyStaminaFloor === undefined) d.player.enemyStaminaFloor = 0;
  if (d.player.hitsLandedThisFight === undefined) d.player.hitsLandedThisFight = 0;
  if (d.player.provisions === undefined) d.player.provisions = MAX_PROVISIONS;
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

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }
function _sideEnemyNameSafe(d) { return escapeHtml(d.sideEnemy.name.trim() || 'the second attacker'); }
function _sideEnemy2NameSafe(d) { return escapeHtml(d.sideEnemy2.name.trim() || 'the third attacker'); }

function _effectiveSkill(d) {
  return d.player.skill;
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

  const playerRoll = _roll2d6();
  const playerAS = playerRoll + _effectiveSkill(d) + (d.player.attackModifier || 0);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim227.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));

  if (playerAS === enemyAS) {
    _appendLog(d, t('battlesim227.log.both_avoided'));
  } else if (playerAS > enemyAS) {
    d.enemy.stamina = Math.max(floor, d.enemy.stamina - 2);
    d.player.hitsLandedThisFight++;
    _appendLog(d, t('battlesim227.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.stamina > floor) {
      d.enemy.stamina = floor;
      _appendLog(d, t('battlesim227.log.press_advantage'));
    }
    if (d.enemy.stamina > floor) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
    _appendLog(d, t('battlesim227.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Simultaneous side attackers: fresh independent exchanges every round,
  // never woundable themselves (choose-one-target rule, per the printed
  // "Fighting More Than One Opponent" rules and this book's multi-attack
  // monsters like the Triceratops/Calacorm).
  if (d.pairedFight && d.sideEnemy.staminaMax > 0 && d.player.stamina > 0) {
    const sidePlayerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    _appendLog(d, t('battlesim227.log.side_round', { enemy: _sideEnemyNameSafe(d), playerAS: sidePlayerAS, enemyAS: sideAS }));
    if (sideAS > sidePlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim227.log.side_wounds', { enemy: _sideEnemyNameSafe(d), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side-hit' });
    } else {
      _appendLog(d, t('battlesim227.log.side_fend', { enemy: _sideEnemyNameSafe(d) }));
    }
  }
  if (d.pairedFight && d.tripleFight && d.sideEnemy2.staminaMax > 0 && d.player.stamina > 0) {
    const side2PlayerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const side2AS = _roll2d6() + d.sideEnemy2.skill;
    _appendLog(d, t('battlesim227.log.side_round', { enemy: _sideEnemy2NameSafe(d), playerAS: side2PlayerAS, enemyAS: side2AS }));
    if (side2AS > side2PlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim227.log.side_wounds', { enemy: _sideEnemy2NameSafe(d), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side2-hit' });
    } else {
      _appendLog(d, t('battlesim227.log.side_fend', { enemy: _sideEnemy2NameSafe(d) }));
    }
  }

  if (d.enemy.stamina <= floor) {
    _appendLog(d, t('battlesim227.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim227.log.fallen', { skull: SVG_SKULL }));
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
      _appendLog(d, t('battlesim227.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim227.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= floor) { _appendLog(d, t('battlesim227.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : event.kind === 'side2-hit' ? _sideEnemy2NameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim227.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim227.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim227.log.fallen', { skull: SVG_SKULL }));
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
  if (d.log.length) _appendLog(d, t('battlesim227.log.reset_sep'));
  _appendLog(d, t('battlesim227.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Provisions ───────────────────────────────────────────────────────────────

function _eatMeal() {
  const d = _data();
  if (!d || _notReady(d) || d.player.provisions <= 0) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim227.alert.meal_midfight'));
    return;
  }
  d.player.provisions--;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + MEAL_HEAL);
  _appendLog(d, t('battlesim227.log.meal', { before, stamina: d.player.stamina, staminaMax: d.player.staminaInitial, provisions: d.player.provisions }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim227-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  const floor = _enemyFloor(d);
  if (notReady)                                    el.innerHTML = t('battlesim227.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim227.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= floor)     el.innerHTML = t('battlesim227.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= floor);
  document.getElementById('sim227-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim227-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim227-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
}

function _renderItemsHtml(d) {
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${t('battlesim227.ui.provisions_name')}</div>
      <div class="bsim-tech-desc">${t('battlesim227.ui.provisions_desc', { n: MEAL_HEAL })}</div>
      <div class="bsim-tech-footer">
        <span class="bsim-tech-uses">${t('battlesim227.ui.provisions_left', { n: d.player.provisions })}</span>
        <button id="sim227-eat-meal" class="inv-edit-done bsim-ae-roll-btn" type="button" ${d.player.provisions <= 0 ? 'disabled' : ''}>${t('battlesim227.btn.eat')}</button>
      </div>
    </div>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim227-history-summary');
  const listEl = document.getElementById('sim227-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim227.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim227.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim227.history.won') : t('battlesim227.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim227-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim227-player-skill').value      = d.player.skill;
  document.getElementById('sim227-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim227-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim227-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim227-player-luck').value       = d.player.luck;
  document.getElementById('sim227-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim227-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim227-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim227.btn.rolled') : t('battlesim227.btn.roll');

  document.getElementById('sim227-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim227-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim227-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim227-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim227-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim227-enemy-winhits').value    = d.player.winAfterHits;
  document.getElementById('sim227-enemy-floor').value      = d.player.enemyStaminaFloor;

  document.getElementById('sim227-paired').checked = d.pairedFight;
  document.getElementById('sim227-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim227-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim227-side-staminamax').value = d.sideEnemy.staminaMax;
  document.getElementById('sim227-side-fields').style.display = d.pairedFight ? '' : 'none';

  document.getElementById('sim227-triple').checked = d.tripleFight;
  document.getElementById('sim227-triple-row').style.display = d.pairedFight ? '' : 'none';
  document.getElementById('sim227-side2-pick').value = d.sideEnemy2.name;
  document.getElementById('sim227-side2-skill').value = d.sideEnemy2.skill;
  document.getElementById('sim227-side2-staminamax').value = d.sideEnemy2.staminaMax;
  document.getElementById('sim227-side2-fields').style.display = (d.pairedFight && d.tripleFight) ? '' : 'none';

  document.getElementById('sim227-item-list').innerHTML = _renderItemsHtml(d);

  const pendingEl = document.getElementById('sim227-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim227() {
  const overlay = document.getElementById('sim227-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim227(); return; }
  _renderAll();
}

function openSim227() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim227-overlay').classList.add('active');
}

function closeSim227() {
  document.getElementById('sim227-overlay')?.classList.remove('active');
}

export function setSim227Visible(visible) {
  const btn = document.getElementById('sim227-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim227();
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

export function initSim227() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim227-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim227-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim227.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim227-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim227.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim227.ui.skill'), 'sim227-player-skill')}
            ${_numField(t('battlesim227.ui.skill_initial'), 'sim227-player-skillmax')}
            ${_numField(t('battlesim227.ui.stamina'), 'sim227-player-stamina')}
            ${_numField(t('battlesim227.ui.stamina_initial'), 'sim227-player-staminamax')}
            ${_numField(t('battlesim227.ui.luck'), 'sim227-player-luck')}
            ${_numField(t('battlesim227.ui.luck_initial'), 'sim227-player-luckmax')}
            ${_numField(t('battlesim227.ui.atkmod'), 'sim227-player-atkmod')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim227.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim227.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim227-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim227-enemy-pick-dropdown">
                <ul id="sim227-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim227.ui.skill'), 'sim227-enemy-skill')}
            ${_numField(t('battlesim227.ui.stamina'), 'sim227-enemy-stamina')}
            ${_numField(t('battlesim227.ui.stamina_max'), 'sim227-enemy-staminamax')}
            ${_numField(t('battlesim227.ui.wound_dmg'), 'sim227-enemy-wounddmg')}
            ${_numField(t('battlesim227.ui.win_after_hits'), 'sim227-enemy-winhits')}
            ${_numField(t('battlesim227.ui.stamina_floor'), 'sim227-enemy-floor')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim227-paired" class="inv-edit-check"> ${t('battlesim227.ui.paired_toggle')}</label>
            </div>
            <div id="sim227-side-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim227.ui.pick')}</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim227-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim227-side-pick-dropdown">
                  <ul id="sim227-side-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField(t('battlesim227.ui.skill'), 'sim227-side-skill')}
              ${_numField(t('battlesim227.ui.stamina_max'), 'sim227-side-staminamax')}
              <div id="sim227-triple-row" class="inv-edit-row" style="display:none">
                <label class="inv-edit-check-label"><input type="checkbox" id="sim227-triple" class="inv-edit-check"> ${t('battlesim227.ui.triple_toggle')}</label>
              </div>
              <div id="sim227-side2-fields" style="display:none">
                <div class="inv-edit-row">
                  <span class="inv-edit-label bsim-stat-label">${t('battlesim227.ui.pick')}</span>
                  <div class="autocomplete-wrap bsim-enemy-ac">
                    <input id="sim227-side2-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim227-side2-pick-dropdown">
                    <ul id="sim227-side2-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                  </div>
                </div>
                ${_numField(t('battlesim227.ui.skill'), 'sim227-side2-skill')}
                ${_numField(t('battlesim227.ui.stamina_max'), 'sim227-side2-staminamax')}
              </div>
            </div>
          </div>
          <div id="sim227-status" class="bsim-status"></div>
          <div id="sim227-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim227.btn.luck_prompt')}</span>
            <button id="sim227-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim227.btn.luck_yes')}</button>
            <button id="sim227-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim227.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim227-round" class="inv-add-btn bsim-action-primary">${t('battlesim227.btn.round')}</button>
            <button id="sim227-reset" class="inv-add-btn">${t('battlesim227.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>${t('battlesim227.ui.items')}</summary>
            <div id="sim227-item-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim227-history-summary">${t('battlesim227.history.summary', { n: 0 })}</summary>
            <div id="sim227-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim227-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim227-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim227);
  document.getElementById('sim227-close').addEventListener('click', closeSim227);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim227(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim227-overlay'),
    open:  openSim227,
    close: closeSim227,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim227();
  });

  document.getElementById('sim227-round').addEventListener('click', _runRound);
  document.getElementById('sim227-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim227-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim227-luck-no').addEventListener('click', _skipLuck);

  document.getElementById('sim227-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = 1 + Math.floor(Math.random() * 6) + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = 1 + Math.floor(Math.random() * 6) + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim227.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim227-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim227-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim227-side2-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy2.name = e.target.value;
    saveState();
  });

  document.getElementById('sim227-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    if (!d.pairedFight) d.tripleFight = false;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim227-triple').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.tripleFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim227-item-list').addEventListener('click', e => {
    if (e.target.id === 'sim227-eat-meal') _eatMeal();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim227-player-skill':      ['player', 'skill'],
    'sim227-player-skillmax':   ['player', 'skillInitial'],
    'sim227-player-stamina':    ['player', 'stamina'],
    'sim227-player-staminamax': ['player', 'staminaInitial'],
    'sim227-player-luck':       ['player', 'luck'],
    'sim227-player-luckmax':    ['player', 'luckInitial'],
    'sim227-player-atkmod':     ['player', 'attackModifier'],
    'sim227-enemy-skill':       ['enemy', 'skill'],
    'sim227-enemy-stamina':        ['enemy', 'stamina'],
    'sim227-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim227-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim227-enemy-winhits':        ['player', 'winAfterHits'],
    'sim227-enemy-floor':          ['player', 'enemyStaminaFloor'],
    'sim227-side-skill':        ['sideEnemy', 'skill'],
    'sim227-side-staminamax':   ['sideEnemy', 'staminaMax'],
    'sim227-side2-skill':       ['sideEnemy2', 'skill'],
    'sim227-side2-staminamax':  ['sideEnemy2', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Attack modifier is the one field allowed to go negative (bare-handed/
    // disarmed/fatigue penalties are always a subtraction) - every other
    // field stays clamped to 0 or above.
    val = id === 'sim227-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim227-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim227-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim227-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim227-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim227-enemy-floor') val = Math.min(val, d.enemy.staminaMax || 9999);
    d[map[0]][map[1]] = val;
    if (id === 'sim227-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim227-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim227-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim227-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim227-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim227-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim227-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim227-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim227-enemy-pick', 'sim227-enemy-pick-dropdown', enemy => {
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
  _setupEnemyAutocomplete('sim227-side-pick', 'sim227-side-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy.staminaMax = enemy.hp;
    saveState();
    _renderAll();
  });
  _setupEnemyAutocomplete('sim227-side2-pick', 'sim227-side2-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy2.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy2.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy2.staminaMax = enemy.hp;
    saveState();
    _renderAll();
  });
}
