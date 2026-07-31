// ── Battle Simulator (The Forest of Doom, book 200) ──────────────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 200 only) by the caller in boot.js via
// setSim200Visible().
// To remove: delete this file, remove its import line and initSim200()/
// setSim200Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with battlesim8.js/battlesim829.js/battlesim286.js/battlesim198.js/
// battlesim199.js, so only remove it if all six are gone).
//
// Fighting Fantasy SKILL/STAMINA/LUCK system, but this book's SKILL formula
// is 1d6+5 (not the usual 1d6+6 used by books 198/199) - STAMINA (2d6+12)
// and LUCK (1d6+6) match. No MAGIC, no Provisions-restore mechanic (like
// book 199, unlike 198) - Provisions here are only spent in one narrative
// survival check with no ongoing combat relevance, so they're not tracked.
//
// Two mechanics unique to this book among the sims built so far:
// - Sequential multi-wave encounters (Killer Bees, Orcs, Wild Hill Men,
//   Vampire Bats, Death Hawks, Hobgoblins) - handled the same way normal
//   fights are: each wave is just its own row in book_enemies, picked in
//   turn from the autocomplete after winning the previous wave, exactly
//   like moving between two unrelated fights elsewhere in the book.
// - "Choose one of a pair" fights (Bandits, Hunting Dogs): two enemies both
//   attack every round via TWO separate, independent exchanges - a normal
//   full battle roll against the chosen target, plus a second fresh
//   Attack Strength roll (not a reuse of the first) against the other,
//   whose hits still land if it wins but which the player can never wound
//   back (a win there just fends off its blow). This needs real support
//   (see pairedFight/sideEnemy below), since it can't be represented by
//   re-picking a single enemy slot.
//
// Because a single round can now produce more than one Luck-eligible hit
// (main enemy wounds you, side enemy wounds you, Fire Demon's bonus whip
// hits you, you wound the main enemy) all in the same round, pendingLuck is
// a queue here instead of the single-slot used by the other sims - Test
// Luck/Skip processes one entry at a time until the queue is empty.
//
// All state lives in pt.sim200, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from './state.js?v=11';
import { showAlert } from './play.js?v=49';
import { getPlayBtnRow } from './charsheet.js?v=41';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from './util.js?v=23';
import { t } from './i18n.js?v=19';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Which of the 3 starting potions was picked (each: 2 uses). Skill/Strength
// restore SKILL/STAMINA to Initial; Fortune permanently raises Initial LUCK
// by 1 then refills current LUCK to that new Initial. Same shape as book
// 198's potion choice.
const POTIONS = [
  ['skill',    'Potion of Skill'],
  ['strength', 'Potion of Strength'],
  ['fortune',  'Potion of Fortune'],
];

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim200) {
    pt.sim200 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        potionKey: 'skill', potionUsesLeft: 2,
        hasBraceletOfSkill: false,
        attackModifier: 0,
        paralyzeThreshold: 0,
        woundsTakenThisFight: 0,
        fireDemonWhip: false,
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
  const d = pt.sim200;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.potionKey === undefined) d.player.potionKey = 'skill';
  if (d.player.potionUsesLeft === undefined) d.player.potionUsesLeft = 2;
  if (d.player.hasBraceletOfSkill === undefined) d.player.hasBraceletOfSkill = false;
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.paralyzeThreshold === undefined) d.player.paralyzeThreshold = 0;
  if (d.player.woundsTakenThisFight === undefined) d.player.woundsTakenThisFight = 0;
  if (d.player.fireDemonWhip === undefined) d.player.fireDemonWhip = false;
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

// Bracelet of Skill (sec 302) is the only fixed combat bonus item found in
// this book - +1 to every Attack Strength roll while worn.
function _effectiveSkill(d) {
  let skill = d.player.skill;
  if (d.player.hasBraceletOfSkill) skill += 1;
  return skill;
}

function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerStamina: d.player.stamina, playerStaminaMax: d.player.staminaInitial,
    ts: Date.now(),
  });
  if (d.history.length > 100) d.history.shift();
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _checkParalyze(d) {
  const threshold = d.player.paralyzeThreshold;
  if (threshold > 0 && d.player.woundsTakenThisFight >= threshold && d.player.stamina > 0) {
    d.player.stamina = 0;
    _appendLog(d, `${SVG_SKULL} Paralysed after ${d.player.woundsTakenThisFight} wounds - you have fallen in battle.`);
    _recordOutcome(d, 'loss');
    // A round can queue Luck-eligible hits from multiple sources (main
    // enemy, side enemy, whip) before wound count crosses the threshold at
    // the very end - clear them all so a defeated battle doesn't leave
    // stale "Test Luck?" prompts behind.
    d.pendingLuckQueue = [];
    return true;
  }
  return false;
}

function _runRound() {
  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

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
    d.player.stamina = Math.max(0, d.player.stamina - 2);
    d.player.woundsTakenThisFight++;
    _appendLog(d, `${_enemyNameSafe(d)} wounds you for 2. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Paired fight: "Attack your chosen Bandit as in a normal battle. Against
  // the other you will throw for your Attack Strength in the normal way" -
  // this is a second, independent exchange with its own fresh player roll,
  // not a reuse of the roll thrown against the chosen target. It can still
  // wound you if it wins, but a win on your side just fends off its blow.
  if (d.pairedFight && d.sideEnemy.staminaMax > 0 && d.player.stamina > 0) {
    const sidePlayerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    _appendLog(d, `${_sideEnemyNameSafe(d)} attacks separately: you ${sidePlayerAS} vs ${sideAS}.`);
    if (sideAS > sidePlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - 2);
      d.player.woundsTakenThisFight++;
      _appendLog(d, `${_sideEnemyNameSafe(d)} wounds you for 2. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side-hit' });
    } else {
      _appendLog(d, `You fend off ${_sideEnemyNameSafe(d)}'s blow.`);
    }
  }

  // Fire Demon's bonus whip attack (sec 108): 1 die every round, 1-2 hits
  // for 1 STAMINA, 3-6 misses. Usable Luck against it like any other hit.
  if (d.player.fireDemonWhip && d.player.stamina > 0) {
    const whipRoll = _roll1d6();
    if (whipRoll <= 2) {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      d.player.woundsTakenThisFight++;
      _appendLog(d, `The whip lashes you (roll ${whipRoll}): -1 STAMINA. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'whip-hit' });
    } else {
      _appendLog(d, `The whip misses (roll ${whipRoll}).`);
    }
  }

  if (d.enemy.stamina <= 0) {
    // A win can still leave an earlier same-round hit queued (e.g. a side
    // attacker or the whip wounded you before your killing blow landed) -
    // that's kept Luck-testable since it's real, separate damage that
    // carries into future fights, unlike a loss (see below).
    _appendLog(d, `${SVG_TROPHY} ${_enemyNameSafe(d)} is defeated!`);
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, `${SVG_SKULL} You have fallen in battle.`);
    _recordOutcome(d, 'loss');
    // Once you're down, any hit queued earlier this same round (e.g. the
    // main enemy wounded you without finishing you off, then the side
    // attacker or whip did) is moot - clear it so a dead battle can't still
    // offer a "Test Your Luck?" prompt.
    d.pendingLuckQueue = [];
  } else {
    _checkParalyze(d);
  }

  saveState();
  _renderAll();
}

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome. On
// your own hit, Lucky deals 2 extra STAMINA damage (4 total), Unlucky gives
// back 1 (only 1 total). On a hit you took (from any source - main enemy,
// side enemy, or the whip), Lucky gives back 1 STAMINA, Unlucky costs 1
// extra. Processes one queued event at a time.
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
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : event.kind === 'whip-hit' ? 'the whip' : _enemyNameSafe(d);
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
    } else {
      _checkParalyze(d);
      if (d.player.stamina <= 0) d.pendingLuckQueue = [];
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
  d.player.woundsTakenThisFight = 0;
  if (d.log.length) _appendLog(d, '──────────');
  _appendLog(d, `Battle reset. ${_enemyNameSafe(d)}'s STAMINA and yours are restored.`);
  saveState();
  _renderAll();
}

// ── Potions / one-time items ────────────────────────────────────────────────

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

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim200-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = 'Roll your starting SKILL, STAMINA and LUCK to begin.';
  else if (d.player.stamina <= 0)                   el.innerHTML = `${SVG_SKULL} You have fallen in battle.`;
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = `${SVG_TROPHY} Victory!`;
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim200-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim200-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim200-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
}

function _renderItemsHtml(d) {
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Bracelet of Skill <span class="bsim-tech-uses">(sec. 302)</span></div>
      <div class="bsim-tech-desc">+1 to all Attack Strength rolls while worn.</div>
      <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim200-item-bracelet" class="inv-edit-check" ${d.player.hasBraceletOfSkill ? 'checked' : ''}> Have it</label></div>
    </div>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim200-history-summary');
  const listEl = document.getElementById('sim200-history-list');
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
  const el = document.getElementById('sim200-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim200-player-skill').value      = d.player.skill;
  document.getElementById('sim200-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim200-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim200-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim200-player-luck').value       = d.player.luck;
  document.getElementById('sim200-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim200-player-atkmod').value     = d.player.attackModifier;
  document.getElementById('sim200-player-paralyze').value   = d.player.paralyzeThreshold;
  document.getElementById('sim200-wounds-taken').textContent = `${d.player.woundsTakenThisFight} wound(s) taken this fight`;

  const rollBtn = document.getElementById('sim200-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? 'Rolled' : 'Roll starting SKILL/STAMINA/LUCK';

  const potionSel = document.getElementById('sim200-potion');
  potionSel.value = d.player.potionKey;
  potionSel.disabled = d.rolled;
  document.getElementById('sim200-potion-uses').textContent = `${d.player.potionUsesLeft} use(s) left`;
  document.getElementById('sim200-potion-use').disabled = _notReady(d) || d.player.potionUsesLeft <= 0;

  document.getElementById('sim200-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim200-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim200-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim200-enemy-staminamax').value = d.enemy.staminaMax;

  document.getElementById('sim200-fire-whip').checked = d.player.fireDemonWhip;

  document.getElementById('sim200-paired').checked = d.pairedFight;
  document.getElementById('sim200-side-fields').style.display = d.pairedFight ? '' : 'none';
  document.getElementById('sim200-side-name').value       = d.sideEnemy.name;
  document.getElementById('sim200-side-skill').value      = d.sideEnemy.skill;
  document.getElementById('sim200-side-staminamax').value = d.sideEnemy.staminaMax;

  document.getElementById('sim200-item-list').innerHTML = _renderItemsHtml(d);

  const pendingEl = document.getElementById('sim200-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';
  const pendingCountEl = document.getElementById('sim200-luck-count');
  if (pendingCountEl) pendingCountEl.textContent = d.pendingLuckQueue.length > 1 ? ` (${d.pendingLuckQueue.length} pending)` : '';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim200() {
  const overlay = document.getElementById('sim200-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim200(); return; }
  _renderAll();
}

function openSim200() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim200-overlay').classList.add('active');
}

function closeSim200() {
  document.getElementById('sim200-overlay')?.classList.remove('active');
}

export function setSim200Visible(visible) {
  const btn = document.getElementById('sim200-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim200();
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
  const input    = document.getElementById('sim200-enemy-pick');
  const dropdown = document.getElementById('sim200-enemy-pick-dropdown');
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
      `<li role="option" id="sim200-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">SKILL:${e.attack ?? '?'} STAMINA:${e.hp ?? '?'}</span></li>`
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
    d.pendingLuckQueue = [];
    d.player.woundsTakenThisFight = 0;
    // Attack modifier, paralyse threshold, the whip toggle, and paired-fight
    // config are all tied to whichever specific encounter set them (Gremlin's
    // -3, the Ghoul's paralyse rule, the Fire Demon's whip, the Bandit/
    // Hunting Dog pairs) - picking a different enemy means a new encounter,
    // so these must not silently carry over and misapply to it.
    d.player.attackModifier   = 0;
    d.player.paralyzeThreshold = 0;
    d.player.fireDemonWhip    = false;
    d.pairedFight = false;
    d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
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

export function initSim200() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim200-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">Battle Simulator</span>
        <button id="sim200-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">You</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim200-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">Roll starting SKILL/STAMINA/LUCK</button>
            </div>
            ${_numField('SKILL', 'sim200-player-skill')}
            ${_numField('Initial SKILL', 'sim200-player-skillmax')}
            ${_numField('STAMINA', 'sim200-player-stamina')}
            ${_numField('Initial STAMINA', 'sim200-player-staminamax')}
            ${_numField('LUCK', 'sim200-player-luck')}
            ${_numField('Initial LUCK', 'sim200-player-luckmax')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Potion</span>
              <select id="sim200-potion" class="inv-edit-input bsim-select">
                ${POTIONS.map(p => `<option value="${p[0]}">${escapeHtml(p[1])}</option>`).join('')}
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span id="sim200-potion-uses" class="bsim-ae-display"></span>
              <button id="sim200-potion-use" class="inv-edit-done bsim-ae-roll-btn" type="button">Drink</button>
            </div>
            ${_numField('Attack Strength mod.', 'sim200-player-atkmod')}
            ${_numField('Paralyse after N wounds (0=off)', 'sim200-player-paralyze')}
            <div class="bsim-tech-desc" id="sim200-wounds-taken"></div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">Enemy</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Pick</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim200-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim200-enemy-pick-dropdown">
                <ul id="sim200-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField('SKILL', 'sim200-enemy-skill')}
            ${_numField('STAMINA', 'sim200-enemy-stamina')}
            ${_numField('Max STAMINA', 'sim200-enemy-staminamax')}
            <div class="inv-edit-row bsim-ae-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim200-fire-whip" class="inv-edit-check"> Fire Demon whip (1d6, 1-2 hits, -1 STAMINA)</label>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim200-paired" class="inv-edit-check"> Paired fight (second attacker each round)</label>
            </div>
            <div id="sim200-side-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">2nd name</span>
                <input id="sim200-side-name" class="inv-edit-input" type="text">
              </div>
              ${_numField('2nd SKILL', 'sim200-side-skill')}
              ${_numField('2nd Max STAMINA', 'sim200-side-staminamax')}
              <div class="bsim-tech-desc">A second, separate exchange each round - you throw a fresh Attack Strength roll against this attacker's own roll. It can wound you, but you can never wound it back - winning against it just fends off its blow.</div>
            </div>
          </div>
          <div id="sim200-status" class="bsim-status"></div>
          <div id="sim200-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">Test Your Luck?<span id="sim200-luck-count"></span></span>
            <button id="sim200-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">Test Luck</button>
            <button id="sim200-luck-no" class="inv-edit-done bsim-heal-btn" type="button">Skip</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim200-round" class="inv-add-btn bsim-action-primary">Round</button>
            <button id="sim200-reset" class="inv-add-btn">Reset</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>Items &amp; Potions</summary>
            <div id="sim200-item-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim200-history-summary">Battle History (0)</summary>
            <div id="sim200-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim200-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim200-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim200);
  document.getElementById('sim200-close').addEventListener('click', closeSim200);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim200(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim200-overlay'),
    open:  openSim200,
    close: closeSim200,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim200();
  });

  document.getElementById('sim200-round').addEventListener('click', _runRound);
  document.getElementById('sim200-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim200-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim200-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim200-potion-use').addEventListener('click', _usePotion);

  document.getElementById('sim200-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    // This book's SKILL formula is 1d6+5, not the 1d6+6 used elsewhere -
    // confirmed against the rules text ("Roll one die. Add 5...").
    d.player.skillInitial   = _roll1d6() + 5;
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

  document.getElementById('sim200-potion').addEventListener('change', e => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.potionKey = e.target.value;
    saveState();
  });

  document.getElementById('sim200-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim200-fire-whip').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.fireDemonWhip = e.target.checked;
    saveState();
  });

  document.getElementById('sim200-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim200-side-name').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim200-item-list').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    if (e.target.id === 'sim200-item-bracelet') {
      d.player.hasBraceletOfSkill = e.target.checked;
      saveState();
      _renderInputs();
    }
  });

  // Plain numeric steppers. Most clamp at a 0 floor like the other sims, but
  // the Attack Strength modifier genuinely needs to go negative (Gremlin
  // -3, Ape Man -2 per the book's own text), so it gets its own min.
  const FIELD_MAP = {
    'sim200-player-skill':      ['player', 'skill',    0],
    'sim200-player-skillmax':   ['player', 'skillInitial', 0],
    'sim200-player-stamina':    ['player', 'stamina',  0],
    'sim200-player-staminamax': ['player', 'staminaInitial', 0],
    'sim200-player-luck':       ['player', 'luck',      0],
    'sim200-player-luckmax':    ['player', 'luckInitial', 0],
    'sim200-player-atkmod':     ['player', 'attackModifier', -9],
    'sim200-player-paralyze':   ['player', 'paralyzeThreshold', 0],
    'sim200-enemy-skill':       ['enemy', 'skill', 0],
    'sim200-enemy-stamina':        ['enemy', 'stamina', 0],
    'sim200-enemy-staminamax':     ['enemy', 'staminaMax', 0],
    'sim200-side-skill':          ['sideEnemy', 'skill', 0],
    'sim200-side-staminamax':     ['sideEnemy', 'staminaMax', 0],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    const [group, key, min] = map;
    val = Math.max(min, val);
    if (id === 'sim200-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim200-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim200-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim200-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[group][key] = val;
    if (id === 'sim200-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim200-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim200-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim200-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim200-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    input.addEventListener('input', () => {
      const allowNeg = FIELD_MAP[input.id][2] < 0;
      const raw = String(input.value).replace(allowNeg ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim200-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const min = FIELD_MAP[btnEl.dataset.id][2];
      const next = Math.max(min, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete();
}
