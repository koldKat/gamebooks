// ── Battle Simulator (Slaves of the Abyss, book 228, Fighting Fantasy 27
//    by Steve Jackson) ──
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 228 only) by the caller in boot.js via
// setSim228Visible().
// To remove: delete this file, remove its import line and initSim228()/
// setSim228Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with every other battlesimN.js, so only remove it if all of them are gone).
// Also remove 'sim228' from SIM_HISTORY_KEYS in server/db/xp.js, and remove
// 'sim228-overlay' from ALL_PANEL_OVERLAY_IDS in util.js and the #sim228-btn
// selectors in battlesim.css.
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system, same core numbers as
// every other sim in this app (SKILL 1d6+6, STAMINA 2d6+12, LUCK 1d6+6;
// opposed 2d6+SKILL roll, ties = no effect, loser -2 STAMINA; Test Your Luck
// costs 1 LUCK, +/-1 STAMINA effect), confirmed from this book's own
// Introduction rules text.
//
// One book-specific rule NOT automated, same precedent as book 223's
// double-6 mechanic: this book's own rules state "Whenever you roll a
// double 6 in battle you have scored a killing blow on your opponent...
// only if you are using your sword." A double-6 roll is normal within the
// sim's existing 2d6 roller and nothing marks it as "this is a double" -
// watch the log for a 12 and, if the player is using their sword, zero the
// enemy's STAMINA by hand with the stat stepper.
//
// No Provisions/Potions UI beyond the standard stat stepper - STAMINA
// recoveries from eating a meal (this book's own rule: up to 4 STAMINA,
// deduct one Provisions) are one-off narrative events, hand-applied like
// every other sim here.
//
// extraAttackers (max 1) + a single sideEnemy cover this book's simultaneous
// multi-enemy fights, all of which use the same "fight one, roll a separate
// Attack Strength against the other every round" wording: 2 Guards (§83,
// §242), 2-then-3 Black Elves (§120), 2-then-3 Villagers (§191), the
// Kokomokoa swarms (§195, §215). Re-pick the next roster enemy into the
// main slot after each kill, same precedent as every other sim's group
// fights in this app.
//
// book_enemies (41 rows, read from all stat-block-bearing sections of 400
// total). BYTHOS recurs at §196/§299 with identical stats (his "earthly
// shell" form); QUAGRANT recurs at §314/§328/§378 with different stats per
// encounter (its strength varies by which section triggers the fight) -
// kept as separate rows disambiguated by section number, following this
// app's existing convention.
//
// This book has extensive non-linear puzzle mechanics (a herb-name cipher
// at §31, a "write down digits as you travel, then compute a 3-digit
// paragraph number" forest code at §58/§166/§381, and two numbered Time
// Sheet trigger boxes) that make a plain link-following reachability check
// report ~46/400 sections unreachable - all confirmed legitimate compute-
// your-own-destination content, not a bug. See
// project_book_audit_ascending_id memory for the verification trail. None
// of this affects the sim, which only models the fight loop itself.
//
// All state lives in pt.sim228, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const SIDE_WOUND_DMG = 2;
const MAX_EXTRA_ATTACKERS = 1;

function _emptySideEnemy() { return { name: '', skill: 0, staminaMax: 0 }; }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim228) {
    pt.sim228 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        attackModifier: 0,
        enemyWoundDamage: 2,
        playerWoundDamage: 2,
        enemyAutoWinFirstRound: false,
        enemyDefeatThreshold: 0,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      extraAttackers: 0,
      sideEnemies: [_emptySideEnemy()],
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim228;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.playerWoundDamage === undefined) d.player.playerWoundDamage = 2;
  if (d.player.enemyAutoWinFirstRound === undefined) d.player.enemyAutoWinFirstRound = false;
  if (d.player.enemyDefeatThreshold === undefined) d.player.enemyDefeatThreshold = 0;
  if (d.extraAttackers === undefined) d.extraAttackers = 0;
  if (!Array.isArray(d.sideEnemies) || d.sideEnemies.length < MAX_EXTRA_ATTACKERS) {
    const existing = Array.isArray(d.sideEnemies) ? d.sideEnemies : [];
    d.sideEnemies = [0].map(i => existing[i] || _emptySideEnemy());
  }
  return d;
}

function _notReady(d) { return !d.rolled; }

function _roll2d6() { return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }
function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }
function _sideEnemyNameSafe(d, idx) { return escapeHtml((d.sideEnemies[idx] && d.sideEnemies[idx].name.trim()) || t('battlesim228.ui.extra_attacker_default', { n: idx + 1 })); }

function _enemyDefeated(d) { return d.enemy.staminaMax > 0 && d.enemy.stamina <= (d.player.enemyDefeatThreshold || 0); }

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.playerWoundDamage = 2;
  d.player.enemyAutoWinFirstRound = false;
  d.player.enemyDefeatThreshold = 0;
  d.extraAttackers = 0;
  d.sideEnemies = [_emptySideEnemy()];
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
  if (!d || _notReady(d) || d.player.stamina <= 0 || _enemyDefeated(d) || d.pendingLuckQueue.length) return;
  const isFirstRound = d.roundsThisBattle === 0;
  d.roundsThisBattle++;

  const enemyWoundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const playerWoundDmg = Math.max(1, d.player.playerWoundDamage || 2);

  let playerWins = false, tie = false;
  if (isFirstRound && d.player.enemyAutoWinFirstRound) {
    playerWins = false;
    _appendLog(d, t('battlesim228.log.enemy_firststrike', { enemy: _enemyNameSafe(d) }));
  } else {
    const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const enemyAS  = _roll2d6() + d.enemy.skill;
    _appendLog(d, t('battlesim228.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
    if (playerAS === enemyAS) tie = true;
    else playerWins = playerAS > enemyAS;
  }

  if (tie) {
    _appendLog(d, t('battlesim228.log.both_avoided'));
  } else if (playerWins) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - playerWoundDmg);
    _appendLog(d, t('battlesim228.log.you_wound', { enemy: _enemyNameSafe(d), n: playerWoundDmg, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (!_enemyDefeated(d)) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - enemyWoundDmg);
    _appendLog(d, t('battlesim228.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: enemyWoundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Extra simultaneous attacker (the un-targeted Orc at §8): its own
  // independent exchange with a fresh player roll every round, never
  // wounded through this path - only the main "Enemy" slot can be wounded,
  // matching the standard FF "every enemy attacks, you choose one to fight
  // back against" multiple-enemy rule.
  for (let i = 0; i < Math.min(d.extraAttackers, MAX_EXTRA_ATTACKERS) && d.player.stamina > 0; i++) {
    const side = d.sideEnemies[i];
    if (!side || side.staminaMax <= 0) continue;
    const sidePlayerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const sideAS = _roll2d6() + side.skill;
    _appendLog(d, t('battlesim228.log.side_round', { enemy: _sideEnemyNameSafe(d, i), playerAS: sidePlayerAS, enemyAS: sideAS }));
    if (sideAS > sidePlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim228.log.side_wounds', { enemy: _sideEnemyNameSafe(d, i), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side-hit', idx: i });
    } else {
      _appendLog(d, t('battlesim228.log.side_fend', { enemy: _sideEnemyNameSafe(d, i) }));
    }
  }

  if (_enemyDefeated(d)) {
    _appendLog(d, t('battlesim228.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim228.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome.
// Same Lucky/Unlucky table as every other FF sim in this app.
function _testLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    const extra = Math.max(1, d.player.playerWoundDamage || 2);
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - extra);
      _appendLog(d, t('battlesim228.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim228.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (_enemyDefeated(d)) { _appendLog(d, t('battlesim228.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d, event.idx) : _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim228.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim228.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim228.log.fallen', { skull: SVG_SKULL }));
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
  if (d.log.length) _appendLog(d, t('battlesim228.log.reset_sep'));
  _appendLog(d, t('battlesim228.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim228-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim228.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim228.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && _enemyDefeated(d))            el.innerHTML = t('battlesim228.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && _enemyDefeated(d));
  document.getElementById('sim228-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim228-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim228-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim228-history-summary');
  const listEl = document.getElementById('sim228-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim228.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim228.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim228.history.won') : t('battlesim228.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim228-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim228-player-skill').value      = d.player.skill;
  document.getElementById('sim228-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim228-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim228-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim228-player-luck').value       = d.player.luck;
  document.getElementById('sim228-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim228-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim228-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim228.btn.rolled') : t('battlesim228.btn.roll');

  document.getElementById('sim228-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim228-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim228-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim228-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim228-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim228-player-wounddmg').value  = d.player.playerWoundDamage;
  document.getElementById('sim228-enemy-threshold').value  = d.player.enemyDefeatThreshold;
  document.getElementById('sim228-enemy-firstwin').checked = d.player.enemyAutoWinFirstRound;

  document.getElementById('sim228-extra-count').value = d.extraAttackers;
  for (let i = 0; i < MAX_EXTRA_ATTACKERS; i++) {
    const side = d.sideEnemies[i] || _emptySideEnemy();
    const block = document.getElementById(`sim228-side${i}-block`);
    if (block) block.style.display = i < d.extraAttackers ? '' : 'none';
    const pickEl = document.getElementById(`sim228-side${i}-pick`);
    if (pickEl) pickEl.value = side.name;
    const skillEl = document.getElementById(`sim228-side${i}-skill`);
    if (skillEl) skillEl.value = side.skill;
    const maxEl = document.getElementById(`sim228-side${i}-staminamax`);
    if (maxEl) maxEl.value = side.staminaMax;
  }

  const pendingEl = document.getElementById('sim228-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim228() {
  const overlay = document.getElementById('sim228-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim228(); return; }
  _renderAll();
}

function openSim228() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim228-overlay').classList.add('active');
}

function closeSim228() {
  document.getElementById('sim228-overlay')?.classList.remove('active');
}

export function setSim228Visible(visible) {
  const btn = document.getElementById('sim228-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim228();
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

function _sideBlock(i) {
  return `
    <div id="sim228-side${i}-block" style="display:none">
      <div class="inv-edit-row">
        <span class="inv-edit-label bsim-stat-label">${t('battlesim228.ui.extra_attacker', { n: i + 1 })}</span>
        <div class="autocomplete-wrap bsim-enemy-ac">
          <input id="sim228-side${i}-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim228-side${i}-pick-dropdown">
          <ul id="sim228-side${i}-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
        </div>
      </div>
      ${_numField(t('battlesim228.ui.skill'), `sim228-side${i}-skill`)}
      ${_numField(t('battlesim228.ui.stamina_max'), `sim228-side${i}-staminamax`)}
    </div>`;
}

export function initSim228() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim228-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim228-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim228.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim228-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim228.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim228.ui.skill'), 'sim228-player-skill')}
            ${_numField(t('battlesim228.ui.skill_initial'), 'sim228-player-skillmax')}
            ${_numField(t('battlesim228.ui.stamina'), 'sim228-player-stamina')}
            ${_numField(t('battlesim228.ui.stamina_initial'), 'sim228-player-staminamax')}
            ${_numField(t('battlesim228.ui.luck'), 'sim228-player-luck')}
            ${_numField(t('battlesim228.ui.luck_initial'), 'sim228-player-luckmax')}
            ${_numField(t('battlesim228.ui.atkmod'), 'sim228-player-atkmod')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim228.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim228.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim228-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim228-enemy-pick-dropdown">
                <ul id="sim228-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim228.ui.skill'), 'sim228-enemy-skill')}
            ${_numField(t('battlesim228.ui.stamina'), 'sim228-enemy-stamina')}
            ${_numField(t('battlesim228.ui.stamina_max'), 'sim228-enemy-staminamax')}
            ${_numField(t('battlesim228.ui.wound_dmg'), 'sim228-enemy-wounddmg')}
            ${_numField(t('battlesim228.ui.player_wound_dmg'), 'sim228-player-wounddmg')}
            ${_numField(t('battlesim228.ui.defeat_threshold'), 'sim228-enemy-threshold')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim228-enemy-firstwin" class="inv-edit-check"> ${t('battlesim228.ui.enemy_firstwin_toggle')}</label>
            </div>
            ${_numField(t('battlesim228.ui.extra_attackers'), 'sim228-extra-count')}
            ${_sideBlock(0)}
          </div>
          <div id="sim228-status" class="bsim-status"></div>
          <div id="sim228-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim228.btn.luck_prompt')}</span>
            <button id="sim228-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim228.btn.luck_yes')}</button>
            <button id="sim228-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim228.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim228-round" class="inv-add-btn bsim-action-primary">${t('battlesim228.btn.round')}</button>
            <button id="sim228-reset" class="inv-add-btn">${t('battlesim228.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim228-history-summary">${t('battlesim228.history.summary', { n: 0 })}</summary>
            <div id="sim228-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim228-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim228-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim228);
  document.getElementById('sim228-close').addEventListener('click', closeSim228);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim228(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim228-overlay'),
    open:  openSim228,
    close: closeSim228,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim228();
  });

  document.getElementById('sim228-round').addEventListener('click', _runRound);
  document.getElementById('sim228-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim228-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim228-luck-no').addEventListener('click', _skipLuck);

  document.getElementById('sim228-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim228.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim228-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  for (let i = 0; i < MAX_EXTRA_ATTACKERS; i++) {
    document.getElementById(`sim228-side${i}-pick`).addEventListener('input', e => {
      const d = _data();
      if (!d) return;
      d.sideEnemies[i].name = e.target.value;
      saveState();
    });
  }

  document.getElementById('sim228-enemy-firstwin').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.enemyAutoWinFirstRound = e.target.checked;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim228-player-skill':      ['player', 'skill'],
    'sim228-player-skillmax':   ['player', 'skillInitial'],
    'sim228-player-stamina':    ['player', 'stamina'],
    'sim228-player-staminamax': ['player', 'staminaInitial'],
    'sim228-player-luck':       ['player', 'luck'],
    'sim228-player-luckmax':    ['player', 'luckInitial'],
    'sim228-player-atkmod':     ['player', 'attackModifier'],
    'sim228-enemy-skill':       ['enemy', 'skill'],
    'sim228-enemy-stamina':        ['enemy', 'stamina'],
    'sim228-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim228-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim228-player-wounddmg':      ['player', 'playerWoundDamage'],
    'sim228-enemy-threshold':      ['player', 'enemyDefeatThreshold'],
    'sim228-extra-count':          ['root', 'extraAttackers'],
    'sim228-side0-skill':       ['side0', 'skill'],
    'sim228-side0-staminamax':  ['side0', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Attack modifier is the one field allowed to go negative (bare-handed/
    // disarmed/fatigue penalties are always a subtraction) - every other
    // field stays clamped to 0 or above.
    val = id === 'sim228-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim228-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim228-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim228-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim228-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim228-enemy-threshold') val = Math.min(val, Math.max(0, d.enemy.staminaMax - 1));
    if (id === 'sim228-extra-count') val = Math.min(val, MAX_EXTRA_ATTACKERS);
    if (map[0] === 'root') {
      d[map[1]] = val;
    } else if (map[0].startsWith('side')) {
      const idx = Number(map[0].slice(4));
      d.sideEnemies[idx][map[1]] = val;
    } else {
      d[map[0]][map[1]] = val;
    }
    if (id === 'sim228-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim228-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim228-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim228-enemy-staminamax') {
      d.enemy.stamina = Math.min(d.enemy.stamina, val);
      d.player.enemyDefeatThreshold = Math.min(d.player.enemyDefeatThreshold, Math.max(0, val - 1));
    }
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim228-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim228-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim228-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim228-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim228-enemy-pick', 'sim228-enemy-pick-dropdown', enemy => {
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
  for (let i = 0; i < MAX_EXTRA_ATTACKERS; i++) {
    _setupEnemyAutocomplete(`sim228-side${i}-pick`, `sim228-side${i}-pick-dropdown`, enemy => {
      const d = _data();
      if (!d) return;
      d.sideEnemies[i].name = enemy.name;
      if (enemy.attack != null) d.sideEnemies[i].skill = enemy.attack;
      if (enemy.hp != null)     d.sideEnemies[i].staminaMax = enemy.hp;
      saveState();
      _renderAll();
    });
  }
}
