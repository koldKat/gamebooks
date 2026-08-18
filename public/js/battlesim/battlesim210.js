// ── Battle Simulator (Temple of Terror, book 210) ────────────────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 210 only) by the caller in boot.js via
// setSim210Visible().
// To remove: delete this file, remove its import line and initSim210()/
// setSim210Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js modules, so only remove it if all of them are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system, identical core numbers
// and Test Your Luck table to book 198 (SKILL 1d6+6, STAMINA 2d6+12, LUCK
// 1d6+6, normal wound 2 STAMINA). No potions in this book (the Adventure
// Sheet has a Spells section instead, but no spell in the book carries a
// fixed combat formula - narrative only, apply by hand like any other book's
// one-off stat rewards).
//
// Two mechanics reused from book 200/201 rather than invented fresh:
// - attackModifier: a plain +/- Attack Strength knob, covering the Mutant
//   Orc's -2 (sec 249, unless armed with a dagger).
// - pairedFight/sideEnemy: a second enemy that attacks every round via its
//   own independent roll but can never be wounded back - covers the
//   Skeleton Warriors (sec 274) and Sand Snapper's two Tentacles (sec 377),
//   both explicitly "attack separately, choose which one to fight".
//
// Two toggleable per-round side-effects, same shape as book 201's Lizardine
// breath:
// - fireBreath (Fiend, sec 216): 1d6 every round regardless of the main
//   exchange, 1-2 costs 1 extra STAMINA (Luck-eligible), 3-6 dodges.
// - electricShock (Giant Firefly, sec 339): 1d6 only on rounds the enemy's
//   own attack already won, 1-3 costs 2 extra STAMINA (Luck-eligible), 4-6
//   nothing extra.
//
// Not modeled: sections 311/363, "Giant Eagle vs Pterodactyl" - a spectator
// battle between two NPCs the player never participates in, just resolves
// and reads the outcome. Doesn't fit a player-vs-enemy sim at all.
//
// All state lives in pt.sim210, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=13';
import { showAlert } from '../play.js?v=139';
import { getPlayBtnRow } from '../charsheet.js?v=94';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=77';
import { t } from '../i18n.js?v=63';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const MAX_PROVISIONS = 10;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim210) {
    pt.sim210 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        gold: 0,
        provisionsLeft: MAX_PROVISIONS,
        attackModifier: 0,
        fireBreath: false,
        electricShock: false,
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
  const d = pt.sim210;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.gold === undefined) d.player.gold = 0;
  if (d.player.provisionsLeft === undefined) d.player.provisionsLeft = MAX_PROVISIONS;
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.fireBreath === undefined) d.player.fireBreath = false;
  if (d.player.electricShock === undefined) d.player.electricShock = false;
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

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.fireBreath = false;
  d.player.electricShock = false;
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
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, `Round ${d.roundsThisBattle}: you ${playerAS} vs ${_enemyNameSafe(d)} ${enemyAS}.`);
  let enemyWonExchange = false;
  if (playerAS === enemyAS) {
    _appendLog(d, 'Both blows are avoided.');
  } else if (playerAS > enemyAS) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
    _appendLog(d, `You wound ${_enemyNameSafe(d)} for 2. STAMINA: ${d.enemy.stamina}/${d.enemy.staminaMax}.`);
    if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    enemyWonExchange = true;
    d.player.stamina = Math.max(0, d.player.stamina - 2);
    _appendLog(d, `${_enemyNameSafe(d)} wounds you for 2. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Paired fight (Skeleton Warriors sec 274, Sand Snapper's Tentacles sec
  // 377): "attack separately each round, choose which one to fight" - a
  // second, independent exchange with its own fresh player roll. The side
  // attacker is never woundable, matching the literal rule.
  if (d.pairedFight && d.sideEnemy.staminaMax > 0 && d.player.stamina > 0) {
    const sidePlayerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
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

  // Fiend's fiery breath (sec 216): in addition to normal combat, roll 1 die
  // every Attack Round regardless of who won the main exchange. 1-2 burns
  // you for 1 extra STAMINA (Luck-eligible), 3-6 you avoid the blast.
  if (d.player.fireBreath && d.player.stamina > 0) {
    const fireRoll = _roll1d6();
    if (fireRoll <= 2) {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, `Fiery breath burns you (roll ${fireRoll}): -1 STAMINA. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'fire-hit' });
    } else {
      _appendLog(d, `You avoid the fiery breath (roll ${fireRoll}).`);
    }
  }

  // Giant Firefly's electric shock (sec 339): only rolled on a round the
  // Firefly's own attack already won - "each time a Firefly wins an Attack
  // Round, roll one die". 1-3 discharges for 2 extra STAMINA (Luck-eligible),
  // 4-6 no discharge.
  if (d.player.electricShock && enemyWonExchange && d.player.stamina > 0) {
    const shockRoll = _roll1d6();
    if (shockRoll <= 3) {
      d.player.stamina = Math.max(0, d.player.stamina - 2);
      _appendLog(d, `Electric discharge (roll ${shockRoll}): -2 STAMINA. STAMINA: ${d.player.stamina}/${d.player.staminaInitial}.`);
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'shock-hit' });
    } else {
      _appendLog(d, `No electric discharge this round (roll ${shockRoll}).`);
    }
  }

  if (d.enemy.stamina <= 0) {
    _appendLog(d, `${SVG_TROPHY} ${_enemyNameSafe(d)} is defeated!`);
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, `${SVG_SKULL} You have fallen in battle.`);
    _recordOutcome(d, 'loss');
    // Once you're down, any hit queued earlier this same round (side
    // attacker or breath/shock wounding you before the killing blow landed)
    // is moot - clear it so a dead battle can't still offer a Luck prompt.
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome. On
// your own hit, Lucky deals 2 extra STAMINA damage (4 total), Unlucky gives
// back 1 (only 1 total). On a hit you took (from any source), Lucky gives
// back 1 STAMINA, Unlucky costs 1 extra - same table as book 198. Processes
// one queued event at a time.
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
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : event.kind === 'fire-hit' ? 'the fiery breath' : event.kind === 'shock-hit' ? 'the electric discharge' : _enemyNameSafe(d);
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

// ── Provisions ───────────────────────────────────────────────────────────────

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

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim210-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = 'Roll your starting SKILL, STAMINA and LUCK to begin.';
  else if (d.player.stamina <= 0)                   el.innerHTML = `${SVG_SKULL} You have fallen in battle.`;
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = `${SVG_TROPHY} Victory!`;
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim210-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim210-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim210-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim210-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim210-history-summary');
  const listEl = document.getElementById('sim210-history-list');
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
  const el = document.getElementById('sim210-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim210-player-skill').value      = d.player.skill;
  document.getElementById('sim210-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim210-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim210-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim210-player-luck').value       = d.player.luck;
  document.getElementById('sim210-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim210-player-atkmod').value     = d.player.attackModifier;
  document.getElementById('sim210-player-gold').value       = d.player.gold;

  const rollBtn = document.getElementById('sim210-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? 'Rolled' : 'Roll starting SKILL/STAMINA/LUCK';

  document.getElementById('sim210-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim210-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim210-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim210-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim210-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim210-fire-breath').checked    = d.player.fireBreath;
  document.getElementById('sim210-electric-shock').checked = d.player.electricShock;

  document.getElementById('sim210-paired').checked = d.pairedFight;
  document.getElementById('sim210-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim210-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim210-side-staminamax').value = d.sideEnemy.staminaMax;
  document.getElementById('sim210-side-fields').style.display = d.pairedFight ? '' : 'none';

  const pendingEl = document.getElementById('sim210-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim210() {
  const overlay = document.getElementById('sim210-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim210(); return; }
  _renderAll();
}

function openSim210() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim210-overlay').classList.add('active');
}

function closeSim210() {
  document.getElementById('sim210-overlay')?.classList.remove('active');
}

export function setSim210Visible(visible) {
  const btn = document.getElementById('sim210-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim210();
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

export function initSim210() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim210-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">Battle Simulator</span>
        <button id="sim210-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">You</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim210-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">Roll starting SKILL/STAMINA/LUCK</button>
            </div>
            ${_numField('SKILL', 'sim210-player-skill')}
            ${_numField('Initial SKILL', 'sim210-player-skillmax')}
            ${_numField('STAMINA', 'sim210-player-stamina')}
            ${_numField('Initial STAMINA', 'sim210-player-staminamax')}
            ${_numField('LUCK', 'sim210-player-luck')}
            ${_numField('Initial LUCK', 'sim210-player-luckmax')}
            ${_numField('Attack modifier', 'sim210-player-atkmod')}
            ${_numField('Gold', 'sim210-player-gold')}
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">Provisions</span>
              <span id="sim210-provisions-left" class="bsim-ae-display"></span>
              <button id="sim210-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">Eat (+4 STAMINA)</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">Enemy</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Pick</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim210-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim210-enemy-pick-dropdown">
                <ul id="sim210-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField('SKILL', 'sim210-enemy-skill')}
            ${_numField('STAMINA', 'sim210-enemy-stamina')}
            ${_numField('Max STAMINA', 'sim210-enemy-staminamax')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim210-fire-breath" class="inv-edit-check"> Fiend's fiery breath (sec. 216)</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim210-electric-shock" class="inv-edit-check"> Giant Firefly's electric shock (sec. 339)</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim210-paired" class="inv-edit-check"> Second attacker fights alongside (never woundable)</label>
            </div>
            <div id="sim210-side-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">Pick</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim210-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim210-side-pick-dropdown">
                  <ul id="sim210-side-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField('SKILL', 'sim210-side-skill')}
              ${_numField('Max STAMINA', 'sim210-side-staminamax')}
            </div>
          </div>
          <div id="sim210-status" class="bsim-status"></div>
          <div id="sim210-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">Test Your Luck?</span>
            <button id="sim210-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">Test Luck</button>
            <button id="sim210-luck-no" class="inv-edit-done bsim-heal-btn" type="button">Skip</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim210-round" class="inv-add-btn bsim-action-primary">Round</button>
            <button id="sim210-reset" class="inv-add-btn">Reset</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim210-history-summary">Battle History (0)</summary>
            <div id="sim210-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim210-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim210-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim210);
  document.getElementById('sim210-close').addEventListener('click', closeSim210);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim210(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim210-overlay'),
    open:  openSim210,
    close: closeSim210,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim210();
  });

  document.getElementById('sim210-round').addEventListener('click', _runRound);
  document.getElementById('sim210-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim210-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim210-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim210-provisions').addEventListener('click', _eatProvisions);

  document.getElementById('sim210-roll').addEventListener('click', () => {
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

  document.getElementById('sim210-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim210-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim210-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim210-fire-breath').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.fireBreath = e.target.checked;
    saveState();
  });
  document.getElementById('sim210-electric-shock').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.electricShock = e.target.checked;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim210-player-skill':      ['player', 'skill'],
    'sim210-player-skillmax':   ['player', 'skillInitial'],
    'sim210-player-stamina':    ['player', 'stamina'],
    'sim210-player-staminamax': ['player', 'staminaInitial'],
    'sim210-player-luck':       ['player', 'luck'],
    'sim210-player-luckmax':    ['player', 'luckInitial'],
    'sim210-player-atkmod':     ['player', 'attackModifier'],
    'sim210-player-gold':       ['player', 'gold'],
    'sim210-enemy-skill':       ['enemy', 'skill'],
    'sim210-enemy-stamina':        ['enemy', 'stamina'],
    'sim210-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim210-side-skill':        ['sideEnemy', 'skill'],
    'sim210-side-staminamax':   ['sideEnemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Attack modifier is the one field allowed to go negative (bare-handed/
    // disarmed-style penalties are always a subtraction) - every other
    // field stays clamped to 0 or above.
    val = id === 'sim210-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim210-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim210-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim210-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim210-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim210-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim210-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim210-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim210-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim210-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim210-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim210-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim210-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim210-enemy-pick', 'sim210-enemy-pick-dropdown', enemy => {
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
  _setupEnemyAutocomplete('sim210-side-pick', 'sim210-side-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy.staminaMax = enemy.hp;
    saveState();
    _renderAll();
  });
}
