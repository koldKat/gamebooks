// ── Battle Simulator (Creature of Havoc, book 220) ───────────────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 220 only) by the caller in boot.js via
// setSim220Visible().
// To remove: delete this file, remove its import line and initSim220()/
// setSim220Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with every other battlesimN.js, so only remove it if all of them are gone).
// Also remove 'sim220' from SIM_HISTORY_KEYS in server/db/xp.js, and remove
// 'sim220-overlay' from ALL_PANEL_OVERLAY_IDS in util.js and the #sim220-btn
// selectors in battlesim.css.
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system, same core numbers as
// every other sim in this app (SKILL 1d6+6, STAMINA 2d6+12, LUCK 1d6+6;
// opposed 2d6+SKILL roll, ties = no effect, loser -2 STAMINA; Test Your Luck
// costs 1 LUCK, +/-1 STAMINA effect) - this book's own rules pages were not
// found as plain text in book_sections (front-matter isn't indexed for this
// title), so the standard rules used by every other sim here apply.
//
// No Provisions/Potions system, unlike most sims in this app - the player
// character is an amnesiac shapeshifting creature (claws/bite, not a
// conventional armed adventurer) and there is no printed Provisions or
// three-potion mechanic anywhere in book_sections for this title (only
// narrative one-off "feed on them, +4 STAMINA" and shopkeeper-food events,
// which are hand-applied with the stamina stepper like any other one-off).
// The book's light SKILL-bonus items (e.g. a metal breastplate, a magical
// silvery coating) are handled through the existing generic attackModifier
// field, same as every prior sim - not a persistent inventory UI.
//
// attackModifier/enemyWoundDamage/playerWoundDamage/enemyAutoWinFirstRound
// are reused exactly as prior sims (see battlesim219.js) - they cover every
// generic "-N SKILL this fight" penalty and every non-standard win/loss
// damage amount.
//
// One field new to this sim:
// - enemyDefeatThreshold: the enemy STAMINA value that counts as "defeated"
//   (default 0). Needed because two fights end in a win once the enemy is
//   merely reduced to a nonzero STAMINA, not beaten to 0: Thugruff (SS82,
//   win = STAMINA 4) and the Master of Hellfire (SS143, win = STAMINA 2).
//
// extraAttackers (0-3) + sideEnemies[] generalise book 219's single
// pairedFight/sideEnemy pair to cover this book's larger simultaneous
// groups - every extra attacker fights its own independent exchange against
// a fresh player roll each round, exactly like book 219's side attacker, and
// is never wounded through this path (only the enemy selected as the main
// target can be wounded - to whittle down a group, re-pick the next member
// into the main "Enemy" slot after each one falls, same as any ordinary
// multi-enemy chain). Covers: 2x Goblin (SS341), 3x Hobbit (SS42),
// 3x Flesh-Feeder (SS447), 2x Brigand (SS429), 4x Zombie (SS411), and the
// Warrior+Thief pair (SS320). The Warrior then Fighter in Leather Armour
// fight (SS258) is sequential, not simultaneous - fought as two ordinary
// single-target fights, re-picking the next enemy from the dropdown after
// the first falls.
//
// Deliberately NOT modeled, matching this app's existing precedent for
// dynamic/always-on per-round passives (see battlesim219.js's Chimera note):
// the Ophidiotaur's tail-sting (SS238 - a flat 2 STAMINA hit to the player
// every round regardless of outcome, negated only by a lucky Test Your
// Luck), the Manic Beast's rage bonus (SS263 - +2 to its own Attack
// Strength roll the round after it's wounded, lost if not wounded again the
// following round), and the Giant Hornet's double-roll death mechanic
// (SS332 - a double on its Attack Strength roll kills the player outright
// unless the player also rolls a double). All three are hand-applied with
// the existing stat steppers/Test Your Luck button rather than bespoke
// toggles. Also not modeled: the Hobbit's (SS205) 3-round-or-elsewhere
// branch and the Black Elf's (SS425) automatic 2-round fight end - both are
// narrative section routing off the round counter already visible in the
// log, not combat-mechanic changes, same precedent as every other sim here.
//
// All state lives in pt.sim220, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const SIDE_WOUND_DMG = 2;
const MAX_EXTRA_ATTACKERS = 3;

function _emptySideEnemy() { return { name: '', skill: 0, staminaMax: 0 }; }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim220) {
    pt.sim220 = {
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
      sideEnemies: [_emptySideEnemy(), _emptySideEnemy(), _emptySideEnemy()],
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim220;
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
    d.sideEnemies = [0, 1, 2].map(i => existing[i] || _emptySideEnemy());
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
function _sideEnemyNameSafe(d, idx) { return escapeHtml((d.sideEnemies[idx] && d.sideEnemies[idx].name.trim()) || t('battlesim220.ui.extra_attacker_default', { n: idx + 1 })); }

function _enemyDefeated(d) { return d.enemy.staminaMax > 0 && d.enemy.stamina <= (d.player.enemyDefeatThreshold || 0); }

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.playerWoundDamage = 2;
  d.player.enemyAutoWinFirstRound = false;
  d.player.enemyDefeatThreshold = 0;
  d.extraAttackers = 0;
  d.sideEnemies = [_emptySideEnemy(), _emptySideEnemy(), _emptySideEnemy()];
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
    _appendLog(d, t('battlesim220.log.enemy_firststrike', { enemy: _enemyNameSafe(d) }));
  } else {
    const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const enemyAS  = _roll2d6() + d.enemy.skill;
    _appendLog(d, t('battlesim220.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
    if (playerAS === enemyAS) tie = true;
    else playerWins = playerAS > enemyAS;
  }

  if (tie) {
    _appendLog(d, t('battlesim220.log.both_avoided'));
  } else if (playerWins) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - playerWoundDmg);
    _appendLog(d, t('battlesim220.log.you_wound', { enemy: _enemyNameSafe(d), n: playerWoundDmg, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (!_enemyDefeated(d)) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - enemyWoundDmg);
    _appendLog(d, t('battlesim220.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: enemyWoundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Extra simultaneous attackers: each fights its own independent exchange
  // with a fresh player roll every round - covers 2x Goblin/Brigand,
  // 3x Hobbit/Flesh-Feeder, 4x Zombie, and the Warrior+Thief pair. None of
  // them are wounded through this path (only the main "Enemy" slot can be
  // wounded), matching the standard FF "every enemy attacks, you choose one
  // to fight back against" multiple-enemy rule.
  for (let i = 0; i < Math.min(d.extraAttackers, MAX_EXTRA_ATTACKERS) && d.player.stamina > 0; i++) {
    const side = d.sideEnemies[i];
    if (!side || side.staminaMax <= 0) continue;
    const sidePlayerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const sideAS = _roll2d6() + side.skill;
    _appendLog(d, t('battlesim220.log.side_round', { enemy: _sideEnemyNameSafe(d, i), playerAS: sidePlayerAS, enemyAS: sideAS }));
    if (sideAS > sidePlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim220.log.side_wounds', { enemy: _sideEnemyNameSafe(d, i), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side-hit', idx: i });
    } else {
      _appendLog(d, t('battlesim220.log.side_fend', { enemy: _sideEnemyNameSafe(d, i) }));
    }
  }

  if (_enemyDefeated(d)) {
    _appendLog(d, t('battlesim220.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim220.log.fallen', { skull: SVG_SKULL }));
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
      _appendLog(d, t('battlesim220.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim220.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (_enemyDefeated(d)) { _appendLog(d, t('battlesim220.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d, event.idx) : _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim220.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim220.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim220.log.fallen', { skull: SVG_SKULL }));
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
  if (d.log.length) _appendLog(d, t('battlesim220.log.reset_sep'));
  _appendLog(d, t('battlesim220.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim220-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim220.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim220.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && _enemyDefeated(d))            el.innerHTML = t('battlesim220.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && _enemyDefeated(d));
  document.getElementById('sim220-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim220-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim220-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim220-history-summary');
  const listEl = document.getElementById('sim220-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim220.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim220.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim220.history.won') : t('battlesim220.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim220-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim220-player-skill').value      = d.player.skill;
  document.getElementById('sim220-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim220-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim220-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim220-player-luck').value       = d.player.luck;
  document.getElementById('sim220-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim220-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim220-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim220.btn.rolled') : t('battlesim220.btn.roll');

  document.getElementById('sim220-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim220-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim220-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim220-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim220-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim220-player-wounddmg').value  = d.player.playerWoundDamage;
  document.getElementById('sim220-enemy-threshold').value  = d.player.enemyDefeatThreshold;
  document.getElementById('sim220-enemy-firstwin').checked = d.player.enemyAutoWinFirstRound;

  document.getElementById('sim220-extra-count').value = d.extraAttackers;
  for (let i = 0; i < MAX_EXTRA_ATTACKERS; i++) {
    const side = d.sideEnemies[i] || _emptySideEnemy();
    const block = document.getElementById(`sim220-side${i}-block`);
    if (block) block.style.display = i < d.extraAttackers ? '' : 'none';
    const pickEl = document.getElementById(`sim220-side${i}-pick`);
    if (pickEl) pickEl.value = side.name;
    const skillEl = document.getElementById(`sim220-side${i}-skill`);
    if (skillEl) skillEl.value = side.skill;
    const maxEl = document.getElementById(`sim220-side${i}-staminamax`);
    if (maxEl) maxEl.value = side.staminaMax;
  }

  const pendingEl = document.getElementById('sim220-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim220() {
  const overlay = document.getElementById('sim220-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim220(); return; }
  _renderAll();
}

function openSim220() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim220-overlay').classList.add('active');
}

function closeSim220() {
  document.getElementById('sim220-overlay')?.classList.remove('active');
}

export function setSim220Visible(visible) {
  const btn = document.getElementById('sim220-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim220();
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
    <div id="sim220-side${i}-block" style="display:none">
      <div class="inv-edit-row">
        <span class="inv-edit-label bsim-stat-label">${t('battlesim220.ui.extra_attacker', { n: i + 1 })}</span>
        <div class="autocomplete-wrap bsim-enemy-ac">
          <input id="sim220-side${i}-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim220-side${i}-pick-dropdown">
          <ul id="sim220-side${i}-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
        </div>
      </div>
      ${_numField(t('battlesim220.ui.skill'), `sim220-side${i}-skill`)}
      ${_numField(t('battlesim220.ui.stamina_max'), `sim220-side${i}-staminamax`)}
    </div>`;
}

export function initSim220() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim220-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim220-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim220.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim220-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim220.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim220.ui.skill'), 'sim220-player-skill')}
            ${_numField(t('battlesim220.ui.skill_initial'), 'sim220-player-skillmax')}
            ${_numField(t('battlesim220.ui.stamina'), 'sim220-player-stamina')}
            ${_numField(t('battlesim220.ui.stamina_initial'), 'sim220-player-staminamax')}
            ${_numField(t('battlesim220.ui.luck'), 'sim220-player-luck')}
            ${_numField(t('battlesim220.ui.luck_initial'), 'sim220-player-luckmax')}
            ${_numField(t('battlesim220.ui.atkmod'), 'sim220-player-atkmod')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim220.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim220.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim220-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim220-enemy-pick-dropdown">
                <ul id="sim220-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim220.ui.skill'), 'sim220-enemy-skill')}
            ${_numField(t('battlesim220.ui.stamina'), 'sim220-enemy-stamina')}
            ${_numField(t('battlesim220.ui.stamina_max'), 'sim220-enemy-staminamax')}
            ${_numField(t('battlesim220.ui.wound_dmg'), 'sim220-enemy-wounddmg')}
            ${_numField(t('battlesim220.ui.player_wound_dmg'), 'sim220-player-wounddmg')}
            ${_numField(t('battlesim220.ui.defeat_threshold'), 'sim220-enemy-threshold')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim220-enemy-firstwin" class="inv-edit-check"> ${t('battlesim220.ui.enemy_firstwin_toggle')}</label>
            </div>
            ${_numField(t('battlesim220.ui.extra_attackers'), 'sim220-extra-count')}
            ${_sideBlock(0)}
            ${_sideBlock(1)}
            ${_sideBlock(2)}
          </div>
          <div id="sim220-status" class="bsim-status"></div>
          <div id="sim220-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim220.btn.luck_prompt')}</span>
            <button id="sim220-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim220.btn.luck_yes')}</button>
            <button id="sim220-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim220.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim220-round" class="inv-add-btn bsim-action-primary">${t('battlesim220.btn.round')}</button>
            <button id="sim220-reset" class="inv-add-btn">${t('battlesim220.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim220-history-summary">${t('battlesim220.history.summary', { n: 0 })}</summary>
            <div id="sim220-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim220-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim220-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim220);
  document.getElementById('sim220-close').addEventListener('click', closeSim220);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim220(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim220-overlay'),
    open:  openSim220,
    close: closeSim220,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim220();
  });

  document.getElementById('sim220-round').addEventListener('click', _runRound);
  document.getElementById('sim220-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim220-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim220-luck-no').addEventListener('click', _skipLuck);

  document.getElementById('sim220-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim220.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim220-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  for (let i = 0; i < MAX_EXTRA_ATTACKERS; i++) {
    document.getElementById(`sim220-side${i}-pick`).addEventListener('input', e => {
      const d = _data();
      if (!d) return;
      d.sideEnemies[i].name = e.target.value;
      saveState();
    });
  }

  document.getElementById('sim220-enemy-firstwin').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.enemyAutoWinFirstRound = e.target.checked;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim220-player-skill':      ['player', 'skill'],
    'sim220-player-skillmax':   ['player', 'skillInitial'],
    'sim220-player-stamina':    ['player', 'stamina'],
    'sim220-player-staminamax': ['player', 'staminaInitial'],
    'sim220-player-luck':       ['player', 'luck'],
    'sim220-player-luckmax':    ['player', 'luckInitial'],
    'sim220-player-atkmod':     ['player', 'attackModifier'],
    'sim220-enemy-skill':       ['enemy', 'skill'],
    'sim220-enemy-stamina':        ['enemy', 'stamina'],
    'sim220-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim220-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim220-player-wounddmg':      ['player', 'playerWoundDamage'],
    'sim220-enemy-threshold':      ['player', 'enemyDefeatThreshold'],
    'sim220-extra-count':          ['root', 'extraAttackers'],
    'sim220-side0-skill':       ['side0', 'skill'],
    'sim220-side0-staminamax':  ['side0', 'staminaMax'],
    'sim220-side1-skill':       ['side1', 'skill'],
    'sim220-side1-staminamax':  ['side1', 'staminaMax'],
    'sim220-side2-skill':       ['side2', 'skill'],
    'sim220-side2-staminamax':  ['side2', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Attack modifier is the one field allowed to go negative (bare-handed/
    // disarmed/fatigue penalties are always a subtraction) - every other
    // field stays clamped to 0 or above.
    val = id === 'sim220-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim220-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim220-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim220-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim220-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim220-enemy-threshold') val = Math.min(val, Math.max(0, d.enemy.staminaMax - 1));
    if (id === 'sim220-extra-count') val = Math.min(val, MAX_EXTRA_ATTACKERS);
    if (map[0] === 'root') {
      d[map[1]] = val;
    } else if (map[0].startsWith('side')) {
      const idx = Number(map[0].slice(4));
      d.sideEnemies[idx][map[1]] = val;
    } else {
      d[map[0]][map[1]] = val;
    }
    if (id === 'sim220-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim220-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim220-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim220-enemy-staminamax') {
      d.enemy.stamina = Math.min(d.enemy.stamina, val);
      d.player.enemyDefeatThreshold = Math.min(d.player.enemyDefeatThreshold, Math.max(0, val - 1));
    }
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim220-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim220-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim220-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim220-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim220-enemy-pick', 'sim220-enemy-pick-dropdown', enemy => {
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
    _setupEnemyAutocomplete(`sim220-side${i}-pick`, `sim220-side${i}-pick-dropdown`, enemy => {
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
