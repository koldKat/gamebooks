// ── Battle Simulator (Keep of the Lich-Lord, book 239) ─────────────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 239 only) by the caller in boot.js via
// setSim239Visible().
// To remove: delete this file, remove its import line and initSim239()/
// setSim239Visible() calls from boot.js, remove 'sim239' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim239-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim239-btn selectors in
// battlesim.css.
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system (same core numbers and
// Test Your Luck table as books 186/198/200/201/202/222/236): SKILL 1d6+6,
// STAMINA 2d6+12, LUCK 1d6+6, normal wound 2 STAMINA, Attack Strength =
// 2d6+SKILL.
//
// Book-specific knobs, confirmed against the full 400-section read:
// - attackModifier: plain +/- Attack Strength knob, covering this book's
//   one-off temporary SKILL penalties (e.g. "-1 SKILL" from a razor
//   door-handle gash sec.376, "-1 SKILL" while shaking with fear sec.250).
// - yourDamage / enemyDamage: numeric override for STAMINA lost per landed
//   hit (both default 2, the FF standard). Covers this book's fixed/variant
//   damage fights (e.g. Skull Beast's bony shell taking only 1 STAMINA per
//   hit and no LUCK bonus, sec.115/182/160/265/310/337/389; the Chaos
//   Shaman's extra 1 STAMINA drain per round regardless of who wins,
//   sec.58) without hardcoding each named case - set the field for the
//   fight, reset it after.
// - secondEnemy: covers this book's two-named-opponents-at-once fights
//   (e.g. Chaos Pirate Ogre + Orc sec.6, the two Wights sec.76, the two
//   Knights of Alptraum sec.204). Several fights in this book put the
//   player against three or four opponents simultaneously (Lady Lotmora
//   plus two Vampires, sec.120/150/190/309, sometimes joined by a
//   traitorous Kandogor) - the engine only tracks two enemy pools at once,
//   so for those, fight the strongest named foe (Lotmora/Kandogor) as the
//   primary enemy and the accompanying Vampires as the second enemy slot,
//   tracking any further attacker manually via the log; this is a known
//   simplification, consistent with every other sim in this app treating
//   combat as a convenience aid rather than a literal rules engine.
//   This book's many "fight them one at a time" sequences (e.g. the three
//   Whipperwolves sec.95, four Undead Guards sec.222) need no special code
//   at all - just fight the standard single-enemy engine repeatedly,
//   switching enemies via the autocomplete between kills.
// - Baracas's wrestling bout (sec.167) uses a different resolution
//   mechanic entirely (opposed SKILL rolls, no Attack Strength) and is not
//   modelled here; treat it as a standard fight using his SKILL/STAMINA as
//   an approximation, or resolve that one bout by hand per the book text.
//
// All state lives in pt.sim239, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim239) {
    pt.sim239 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        attackModifier: 0,
        yourDamage: 2,
        enemyDamage: 2,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      secondEnemy: { active: false, name: '', skill: 0, stamina: 0, staminaMax: 0, target: 'enemy' },
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim239;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.yourDamage === undefined) d.player.yourDamage = 2;
  if (d.player.enemyDamage === undefined) d.player.enemyDamage = 2;
  if (!d.secondEnemy) d.secondEnemy = { active: false, name: '', skill: 0, stamina: 0, staminaMax: 0, target: 'enemy' };
  if (d.secondEnemy.target === undefined) d.secondEnemy.target = 'enemy';
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
function _secondName(d) { return d.secondEnemy.name.trim() || t('battlesim239.ui.second_default'); }
function _secondNameSafe(d) { return escapeHtml(_secondName(d)); }

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.yourDamage = 2;
  d.player.enemyDamage = 2;
  d.secondEnemy.active = false;
  d.secondEnemy.name = '';
  d.secondEnemy.skill = 0;
  d.secondEnemy.stamina = 0;
  d.secondEnemy.staminaMax = 0;
  d.secondEnemy.target = 'enemy';
}

function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: d.secondEnemy.active ? `${_enemyName(d)} & ${_secondName(d)}` : _enemyName(d), outcome,
    playerStamina: d.player.stamina, playerStaminaMax: d.player.staminaInitial,
    ts: Date.now(),
  });
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _bothAlive(d) {
  return d.player.stamina > 0 && (d.enemy.stamina > 0 || (d.secondEnemy.active && d.secondEnemy.stamina > 0));
}

function _runRound() {
  const d = _data();
  if (!d || _notReady(d) || !_bothAlive(d) || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  if (d.secondEnemy.active && d.secondEnemy.stamina > 0 && d.enemy.stamina > 0) {
    _runThreeWayRound(d);
  } else {
    // Standard single-enemy round (also used once one of a simultaneous
    // pair has fallen, or for the many "fight them one at a time" pairs
    // in this book, which never need the secondEnemy toggle at all).
    const target = d.enemy.stamina > 0 ? d.enemy : d.secondEnemy;
    const targetName = d.enemy.stamina > 0 ? _enemyNameSafe(d) : _secondNameSafe(d);
    const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const enemyAS  = _roll2d6() + target.skill;
    _appendLog(d, t('battlesim239.log.round', { round: d.roundsThisBattle, playerAS, enemy: targetName, enemyAS }));
    if (playerAS === enemyAS) {
      _appendLog(d, t('battlesim239.log.both_avoided'));
    } else if (playerAS > enemyAS) {
      const dmg = d.player.yourDamage;
      target.stamina = Math.max(0, target.stamina - dmg);
      _appendLog(d, t('battlesim239.log.you_wound', { enemy: targetName, n: dmg, stamina: target.stamina, staminaMax: target.staminaMax }));
      if (target.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit', on: target === d.enemy ? 'enemy' : 'second' });
    } else {
      const dmg = d.player.enemyDamage;
      d.player.stamina = Math.max(0, d.player.stamina - dmg);
      _appendLog(d, t('battlesim239.log.enemy_wounds', { enemy: targetName, n: dmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
    }
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

// Three-way "highest Attack Strength wins" mechanic (sec.109, 225, 293):
// roll Attack Strength for player and both enemies; whichever of the three
// is highest lands a wound on its target this round.
function _runThreeWayRound(d) {
  const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
  const enemy1AS = _roll2d6() + d.enemy.skill;
  const enemy2AS = _roll2d6() + d.secondEnemy.skill;
  _appendLog(d, t('battlesim239.log.round_three', {
    round: d.roundsThisBattle, playerAS,
    e1: _enemyNameSafe(d), e1AS: enemy1AS,
    e2: _secondNameSafe(d), e2AS: enemy2AS,
  }));

  if (playerAS >= enemy1AS && playerAS >= enemy2AS) {
    // Player has the highest (or tied-highest, treated as a hit per this
    // book's ties-favour-the-active-attacker phrasing for these fights) -
    // wound whichever enemy the player has targeted this round.
    const target = d.secondEnemy.target === 'second' ? d.secondEnemy : d.enemy;
    const targetName = d.secondEnemy.target === 'second' ? _secondNameSafe(d) : _enemyNameSafe(d);
    const dmg = d.player.yourDamage;
    target.stamina = Math.max(0, target.stamina - dmg);
    _appendLog(d, t('battlesim239.log.you_wound', { enemy: targetName, n: dmg, stamina: target.stamina, staminaMax: target.staminaMax }));
    if (target.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit', on: d.secondEnemy.target === 'second' ? 'second' : 'enemy' });
  } else if (enemy1AS > enemy2AS) {
    const dmg = d.player.enemyDamage;
    d.player.stamina = Math.max(0, d.player.stamina - dmg);
    _appendLog(d, t('battlesim239.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: dmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  } else {
    const dmg = d.player.enemyDamage;
    d.player.stamina = Math.max(0, d.player.stamina - dmg);
    _appendLog(d, t('battlesim239.log.enemy_wounds', { enemy: _secondNameSafe(d), n: dmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }
}

function _checkBattleEnd(d) {
  if (d.enemy.stamina <= 0 && (!d.secondEnemy.active || d.secondEnemy.stamina <= 0)) {
    _appendLog(d, t('battlesim239.log.defeated', { trophy: SVG_TROPHY, enemy: d.secondEnemy.active ? `${_enemyNameSafe(d)} & ${_secondNameSafe(d)}` : _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim239.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }
}

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome.
function _testLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    const target = event.on === 'second' ? d.secondEnemy : d.enemy;
    const targetName = event.on === 'second' ? _secondNameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      target.stamina = Math.max(0, target.stamina - 1);
      _appendLog(d, t('battlesim239.log.luck_player_hit_lucky', { roll, enemy: targetName, stamina: target.stamina, staminaMax: target.staminaMax }));
    } else {
      target.stamina = Math.min(target.staminaMax, target.stamina + 1);
      _appendLog(d, t('battlesim239.log.luck_player_hit_unlucky', { roll, enemy: targetName, stamina: target.stamina, staminaMax: target.staminaMax }));
    }
  } else {
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim239.log.luck_hit_lucky', { roll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim239.log.luck_hit_unlucky', { roll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim239.log.fallen', { skull: SVG_SKULL }));
      _recordOutcome(d, 'loss');
      d.pendingLuckQueue = [];
    }
  }
  _checkBattleEnd(d);
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
  if (d.secondEnemy.active) d.secondEnemy.stamina = d.secondEnemy.staminaMax;
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim239.log.reset_sep'));
  _appendLog(d, t('battlesim239.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim239-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  const enemyDead = hasEnemy && d.enemy.stamina <= 0 && (!d.secondEnemy.active || d.secondEnemy.stamina <= 0);
  if (notReady)              el.innerHTML = t('battlesim239.status.not_ready');
  else if (d.player.stamina <= 0) el.innerHTML = t('battlesim239.status.fallen', { skull: SVG_SKULL });
  else if (enemyDead)        el.innerHTML = t('battlesim239.status.victory', { trophy: SVG_TROPHY });
  else                       el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || enemyDead;
  document.getElementById('sim239-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim239-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim239-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim239-history-summary');
  const listEl = document.getElementById('sim239-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim239.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim239.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim239.history.won') : t('battlesim239.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim239-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim239-player-skill').value      = d.player.skill;
  document.getElementById('sim239-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim239-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim239-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim239-player-luck').value       = d.player.luck;
  document.getElementById('sim239-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim239-player-atkmod').value     = d.player.attackModifier;
  document.getElementById('sim239-player-yourdmg').value    = d.player.yourDamage;
  document.getElementById('sim239-player-enemydmg').value   = d.player.enemyDamage;

  const rollBtn = document.getElementById('sim239-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim239.btn.rolled') : t('battlesim239.btn.roll');

  document.getElementById('sim239-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim239-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim239-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim239-enemy-staminamax').value = d.enemy.staminaMax;

  document.getElementById('sim239-second-toggle').checked = d.secondEnemy.active;
  document.getElementById('sim239-second-fields').style.display = d.secondEnemy.active ? '' : 'none';
  document.getElementById('sim239-second-name').value = d.secondEnemy.name;
  document.getElementById('sim239-second-skill').value = d.secondEnemy.skill;
  document.getElementById('sim239-second-stamina').value = Math.min(d.secondEnemy.stamina, d.secondEnemy.staminaMax);
  document.getElementById('sim239-second-staminamax').value = d.secondEnemy.staminaMax;
  document.getElementById('sim239-second-target-enemy').checked = d.secondEnemy.target === 'enemy';
  document.getElementById('sim239-second-target-second').checked = d.secondEnemy.target === 'second';

  const pendingEl = document.getElementById('sim239-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim239() {
  const overlay = document.getElementById('sim239-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim239(); return; }
  _renderAll();
}

function openSim239() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim239-overlay').classList.add('active');
}

function closeSim239() {
  document.getElementById('sim239-overlay')?.classList.remove('active');
}

export function setSim239Visible(visible) {
  const btn = document.getElementById('sim239-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim239();
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

function _numField(label, id, allowNegative) {
  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <div class="inv-qty-wrap">
        <button class="inv-qty-btn" data-id="${id}" data-delta="-1">−</button>
        <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="${allowNegative ? 'text' : 'numeric'}">
        <button class="inv-qty-btn" data-id="${id}" data-delta="1">+</button>
      </div>
    </div>`;
}

export function initSim239() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim239-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim239-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim239.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim239-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim239.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim239.ui.skill'), 'sim239-player-skill')}
            ${_numField(t('battlesim239.ui.skill_initial'), 'sim239-player-skillmax')}
            ${_numField(t('battlesim239.ui.stamina'), 'sim239-player-stamina')}
            ${_numField(t('battlesim239.ui.stamina_initial'), 'sim239-player-staminamax')}
            ${_numField(t('battlesim239.ui.luck'), 'sim239-player-luck')}
            ${_numField(t('battlesim239.ui.luck_initial'), 'sim239-player-luckmax')}
            ${_numField(t('battlesim239.ui.atkmod'), 'sim239-player-atkmod', true)}
            ${_numField(t('battlesim239.ui.yourdmg'), 'sim239-player-yourdmg')}
            ${_numField(t('battlesim239.ui.enemydmg'), 'sim239-player-enemydmg')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim239.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim239.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim239-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim239-enemy-pick-dropdown">
                <ul id="sim239-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim239.ui.skill'), 'sim239-enemy-skill')}
            ${_numField(t('battlesim239.ui.stamina'), 'sim239-enemy-stamina')}
            ${_numField(t('battlesim239.ui.stamina_max'), 'sim239-enemy-staminamax')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim239-second-toggle" class="inv-edit-check"> ${t('battlesim239.ui.second_toggle')}</label>
            </div>
            <div id="sim239-second-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim239.ui.second_name')}</span>
                <input id="sim239-second-name" class="inv-edit-input" type="text">
              </div>
              ${_numField(t('battlesim239.ui.skill'), 'sim239-second-skill')}
              ${_numField(t('battlesim239.ui.stamina'), 'sim239-second-stamina')}
              ${_numField(t('battlesim239.ui.stamina_max'), 'sim239-second-staminamax')}
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim239.ui.second_target')}</span>
                <label class="inv-edit-check-label"><input type="radio" name="sim239-second-target" id="sim239-second-target-enemy" checked> ${t('battlesim239.ui.pick')} #1</label>
                <label class="inv-edit-check-label"><input type="radio" name="sim239-second-target" id="sim239-second-target-second"> ${t('battlesim239.ui.second_name')}</label>
              </div>
            </div>
          </div>
          <div id="sim239-status" class="bsim-status"></div>
          <div id="sim239-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim239.btn.luck_prompt')}</span>
            <button id="sim239-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim239.btn.luck_yes')}</button>
            <button id="sim239-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim239.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim239-round" class="inv-add-btn bsim-action-primary">${t('battlesim239.btn.round')}</button>
            <button id="sim239-reset" class="inv-add-btn">${t('battlesim239.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim239-history-summary">${t('battlesim239.history.summary', { n: 0 })}</summary>
            <div id="sim239-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim239-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim239-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim239);
  document.getElementById('sim239-close').addEventListener('click', closeSim239);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim239(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim239-overlay'),
    open:  openSim239,
    close: closeSim239,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim239();
  });

  document.getElementById('sim239-round').addEventListener('click', _runRound);
  document.getElementById('sim239-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim239-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim239-luck-no').addEventListener('click', _skipLuck);

  document.getElementById('sim239-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim239.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim239-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim239-second-toggle').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.secondEnemy.active = e.target.checked;
    if (!d.secondEnemy.active) {
      d.secondEnemy.name = '';
      d.secondEnemy.skill = 0;
      d.secondEnemy.stamina = 0;
      d.secondEnemy.staminaMax = 0;
    }
    saveState();
    _renderInputs();
  });

  document.getElementById('sim239-second-name').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.secondEnemy.name = e.target.value;
    saveState();
  });

  overlay.querySelectorAll('input[name="sim239-second-target"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      d.secondEnemy.target = document.getElementById('sim239-second-target-second').checked ? 'second' : 'enemy';
      saveState();
    });
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim239-player-skill':      ['player', 'skill'],
    'sim239-player-skillmax':   ['player', 'skillInitial'],
    'sim239-player-stamina':    ['player', 'stamina'],
    'sim239-player-staminamax': ['player', 'staminaInitial'],
    'sim239-player-luck':       ['player', 'luck'],
    'sim239-player-luckmax':    ['player', 'luckInitial'],
    'sim239-player-atkmod':     ['player', 'attackModifier'],
    'sim239-player-yourdmg':    ['player', 'yourDamage'],
    'sim239-player-enemydmg':   ['player', 'enemyDamage'],
    'sim239-enemy-skill':       ['enemy', 'skill'],
    'sim239-enemy-stamina':     ['enemy', 'stamina'],
    'sim239-enemy-staminamax':  ['enemy', 'staminaMax'],
    'sim239-second-skill':      ['secondEnemy', 'skill'],
    'sim239-second-stamina':    ['secondEnemy', 'stamina'],
    'sim239-second-staminamax': ['secondEnemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = id === 'sim239-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim239-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim239-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim239-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim239-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim239-second-stamina') val = Math.min(val, d.secondEnemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim239-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim239-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim239-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim239-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    if (id === 'sim239-second-staminamax') d.secondEnemy.stamina = Math.min(d.secondEnemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim239-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim239-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim239-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim239-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim239-enemy-pick', 'sim239-enemy-pick-dropdown', enemy => {
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
