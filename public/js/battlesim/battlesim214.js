// ── Battle Simulator (Rebel Planet, book 214) ────────────────────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 214 only) by the caller in boot.js via
// setSim214Visible().
// To remove: delete this file, remove its import line and initSim214()/
// setSim214Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with every other battlesimN.js in this folder, so only remove it if all
// of them are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK core (2d6+SKILL Attack
// Strength rolls, 2-STAMINA wounds, Test Your Luck damage modifiers) -
// reused verbatim, same as every other sim here. This book has no
// Potions/Provisions or Hero Points/Super Powers system (not in its rules),
// so it's one of the leaner sims - no chargen branching beyond the plain
// SKILL/STAMINA/LUCK roll.
//
// Two things unique to this book's roster, both worth real mechanics rather
// than a one-off note:
//
// 1. Tail attack. Several Arcadians (§124, §289, and §136 in an "every OTHER
//    round" variant - see that enemy's book_enemies note) can swipe with
//    their tail regardless of the round's normal Attack Strength result: an
//    extra d6 each qualifying round, 5-6 hits for a flat 2 STAMINA. Modeled
//    as a per-fight toggle (d.player.hasTailAttack) rather than folding it
//    into the enemy's own SKILL/STAMINA, since it's an independent roll that
//    can land on a round the player otherwise wins.
//
// 2. Escalating damage (Street Fighter robot, §190 only). Its first
//    successful hit costs 2 STAMINA, then 3, then 4, and so on - not the
//    flat 2-per-wound every other fight in this app uses. Modeled as a
//    second per-fight toggle (d.player.escalatingDamage) plus a hit counter;
//    LUCK still reduces each hit by 1 exactly the way the existing Test Your
//    Luck queue already works for every other enemy, so no separate luck
//    handling was needed for this book's version of that rule.
//
// Everything else found in the roster - the Scabrok's three different
// pre-fight-modified stat lines (§106 full, §133/§341 reduced via a Luck
// test the player takes before ever opening the sim), the Central Arcadian's
// one-time post-first-wound SKILL debuff (§243), the Brawler's unarmed
// "sudden death rule of p. 24" (text not available to cross-check, so left
// unmodeled per explicit instruction), and the several fights whose outcome
// branches on being wounded N times rather than on STAMINA reaching 0
// (§17, §298) - are noted directly in that enemy's book_enemies name rather
// than built as bespoke mechanics, same "apply narrative one-offs by hand"
// precedent book202's header documents. Wound-count/round-limit branches are
// informational only in the log, same "sim is convenience, not enforcement"
// precedent every sim in this app follows - it never auto-navigates the book.
//
// All state lives in pt.sim214, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=1417';
import { showAlert } from '../confirm.js?v=1417';
import { getPlayBtnRow } from '../charsheet.js?v=1417';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=1417';
import { t } from '../i18n.js?v=1417';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim214) {
    pt.sim214 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        attackModifier: 0,
        enemyWoundDamage: 2,
        forceLossAfterRounds: 0,
        hasTailAttack: false,
        escalatingDamage: false,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      enemyHitStreak: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim214;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (d.enemyHitStreak === undefined) d.enemyHitStreak = 0;
  if (!d.history) d.history = [];
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.forceLossAfterRounds === undefined) d.player.forceLossAfterRounds = 0;
  if (d.player.hasTailAttack === undefined) d.player.hasTailAttack = false;
  if (d.player.escalatingDamage === undefined) d.player.escalatingDamage = false;
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

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.forceLossAfterRounds = 0;
  d.player.hasTailAttack = false;
  d.player.escalatingDamage = false;
  d.enemyHitStreak = 0;
}

// Uncapped, true lifetime total (matches every other sim's history - the
// admin dashboard aggregates battle counts app-wide from this array).
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
  _appendLog(d, t('battlesim214.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));

  if (playerAS === enemyAS) {
    _appendLog(d, t('battlesim214.log.both_avoided'));
  } else if (playerAS > enemyAS) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
    _appendLog(d, t('battlesim214.log.you_wound', { enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    const woundDmg = d.player.escalatingDamage
      ? 2 + d.enemyHitStreak
      : Math.max(1, d.player.enemyWoundDamage || 2);
    if (d.player.escalatingDamage) d.enemyHitStreak++;
    d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
    _appendLog(d, t('battlesim214.log.enemy_wounds', { enemy: _enemyNameSafe(d), dmg: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Tail attack: an independent extra roll, can land on a round the player
  // otherwise won or drew - not folded into the main Attack Strength roll
  // above because the book describes it as happening "whatever the result
  // of that Attack Round otherwise".
  if (d.player.hasTailAttack && d.player.stamina > 0) {
    const tailRoll = _roll1d6();
    if (tailRoll >= 5) {
      d.player.stamina = Math.max(0, d.player.stamina - 2);
      _appendLog(d, t('battlesim214.log.tail_hit', { roll: tailRoll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      _appendLog(d, t('battlesim214.log.tail_miss', { roll: tailRoll }));
    }
  }

  _resolveRoundEnd(d);
  saveState();
  _renderAll();
}

// Shared end-of-round check (also called after a Luck test resolves the
// same round's pending hit).
function _resolveRoundEnd(d) {
  if (d.pendingLuckQueue.length) return; // wait for the Luck test to resolve first

  if (d.enemy.stamina <= 0) {
    _appendLog(d, t('battlesim214.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return;
  }
  if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim214.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return;
  }
  // === not >= - a reminder every single round after the threshold (the
  // fight is deliberately left clickable past it, informational only, see
  // header) would spam the log for as long as the player keeps rolling.
  if (d.player.forceLossAfterRounds > 0 && d.roundsThisBattle === d.player.forceLossAfterRounds) {
    _appendLog(d, t('battlesim214.log.round_limit'));
  }
}

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome.
// Same table every sim in this app uses.
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
      _appendLog(d, t('battlesim214.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim214.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
  } else {
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim214.log.luck_enemy_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim214.log.luck_enemy_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
  }
  _resolveRoundEnd(d);
  saveState();
  _renderAll();
}

function _skipLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length) return;
  d.pendingLuckQueue.shift();
  _resolveRoundEnd(d);
  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.stamina = d.enemy.staminaMax;
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.enemyHitStreak = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim214.log.reset_sep'));
  _appendLog(d, t('battlesim214.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim214-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                              el.innerHTML = t('battlesim214.status.not_ready');
  else if (d.player.stamina <= 0)            el.innerHTML = t('battlesim214.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= 0) el.innerHTML = t('battlesim214.status.victory', { trophy: SVG_TROPHY });
  else                                        el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim214-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim214-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim214-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim214-history-summary');
  const listEl = document.getElementById('sim214-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim214.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim214.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim214.history.won') : t('battlesim214.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim214-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim214-player-skill').value      = d.player.skill;
  document.getElementById('sim214-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim214-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim214-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim214-player-luck').value       = d.player.luck;
  document.getElementById('sim214-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim214-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim214-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim214.btn.rolled') : t('battlesim214.btn.roll');

  document.getElementById('sim214-enemy-pick').value       = d.enemy.name;
  document.getElementById('sim214-enemy-skill').value      = d.enemy.skill;
  document.getElementById('sim214-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim214-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim214-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim214-enemy-roundlimit').value = d.player.forceLossAfterRounds;
  document.getElementById('sim214-enemy-tail').checked     = d.player.hasTailAttack;
  document.getElementById('sim214-enemy-escalating').checked = d.player.escalatingDamage;

  const pendingLuckEl = document.getElementById('sim214-luck-prompt');
  pendingLuckEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim214() {
  const overlay = document.getElementById('sim214-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim214(); return; }
  _renderAll();
}

function openSim214() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim214-overlay').classList.add('active');
}

function closeSim214() {
  document.getElementById('sim214-overlay')?.classList.remove('active');
}

export function setSim214Visible(visible) {
  const btn = document.getElementById('sim214-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim214();
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

function _checkField(label, id) {
  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <input id="${id}" class="inv-edit-check" type="checkbox">
    </div>`;
}

export function initSim214() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim214-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim214-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim214.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim214-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim214.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim214.ui.skill'), 'sim214-player-skill')}
            ${_numField(t('battlesim214.ui.skill_initial'), 'sim214-player-skillmax')}
            ${_numField(t('battlesim214.ui.stamina'), 'sim214-player-stamina')}
            ${_numField(t('battlesim214.ui.stamina_initial'), 'sim214-player-staminamax')}
            ${_numField(t('battlesim214.ui.luck'), 'sim214-player-luck')}
            ${_numField(t('battlesim214.ui.luck_initial'), 'sim214-player-luckmax')}
            ${_numField(t('battlesim214.ui.atkmod'), 'sim214-player-atkmod')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim214.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim214.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim214-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim214-enemy-pick-dropdown">
                <ul id="sim214-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim214.ui.skill'), 'sim214-enemy-skill')}
            ${_numField(t('battlesim214.ui.stamina'), 'sim214-enemy-stamina')}
            ${_numField(t('battlesim214.ui.stamina_max'), 'sim214-enemy-staminamax')}
            ${_numField(t('battlesim214.ui.wound_dmg'), 'sim214-enemy-wounddmg')}
            ${_numField(t('battlesim214.ui.round_limit'), 'sim214-enemy-roundlimit')}
            ${_checkField(t('battlesim214.ui.tail_toggle'), 'sim214-enemy-tail')}
            ${_checkField(t('battlesim214.ui.escalating_toggle'), 'sim214-enemy-escalating')}
          </div>
          <div id="sim214-status" class="bsim-status"></div>
          <div id="sim214-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim214.btn.luck_prompt')}</span>
            <button id="sim214-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim214.btn.luck_yes')}</button>
            <button id="sim214-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim214.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim214-round" class="inv-add-btn bsim-action-primary">${t('battlesim214.btn.round')}</button>
            <button id="sim214-reset" class="inv-add-btn">${t('battlesim214.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim214-history-summary">${t('battlesim214.history.summary', { n: 0 })}</summary>
            <div id="sim214-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim214-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim214-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim214);
  document.getElementById('sim214-close').addEventListener('click', closeSim214);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim214(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim214-overlay'),
    open:  openSim214,
    close: closeSim214,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim214();
  });

  document.getElementById('sim214-round').addEventListener('click', _runRound);
  document.getElementById('sim214-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim214-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim214-luck-no').addEventListener('click', _skipLuck);

  document.getElementById('sim214-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim214.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim214-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim214-enemy-tail').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.hasTailAttack = e.target.checked;
    saveState();
  });
  document.getElementById('sim214-enemy-escalating').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.escalatingDamage = e.target.checked;
    d.enemyHitStreak = 0;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim214-player-skill':      ['player', 'skill'],
    'sim214-player-skillmax':   ['player', 'skillInitial'],
    'sim214-player-stamina':    ['player', 'stamina'],
    'sim214-player-staminamax': ['player', 'staminaInitial'],
    'sim214-player-luck':       ['player', 'luck'],
    'sim214-player-luckmax':    ['player', 'luckInitial'],
    'sim214-player-atkmod':     ['player', 'attackModifier'],
    'sim214-enemy-skill':       ['enemy', 'skill'],
    'sim214-enemy-stamina':     ['enemy', 'stamina'],
    'sim214-enemy-staminamax':  ['enemy', 'staminaMax'],
    'sim214-enemy-wounddmg':    ['player', 'enemyWoundDamage'],
    'sim214-enemy-roundlimit':  ['player', 'forceLossAfterRounds'],
  };
  // Attack modifier is the only field allowed to go negative (a fight-long
  // Attack Strength penalty) - every other field stays clamped to 0 or above.
  const NEGATIVE_OK = new Set(['sim214-player-atkmod']);
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = NEGATIVE_OK.has(id) ? Number(val) : Math.max(0, val);
    if (id === 'sim214-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim214-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim214-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim214-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim214-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim214-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim214-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim214-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim214-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = NEGATIVE_OK.has(input.id);
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim214-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = NEGATIVE_OK.has(btnEl.dataset.id);
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim214-enemy-pick', 'sim214-enemy-pick-dropdown', enemy => {
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
}
