// ── Battle Simulator (Stealer of Souls, book 230, Fighting Fantasy 34 by Keith Martin) ──
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 230 only) by the caller in boot.js via
// setSim230Visible().
// To remove: delete this file, remove its import line and initSim230()/
// setSim230Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with the other battlesimNNN.js modules, so only remove it if all are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system (SKILL 1d6+6, STAMINA
// 2d6+12, LUCK 1d6+6), Test Your Luck table, generic per-encounter knobs
// (attackModifier/enemyWoundDamage/winAfterHits/enemyAutoWinFirstRound/
// pairedFight+sideEnemy) reused verbatim from books 200-203/224-229.
//
// Provisions: 10 meals, each restores 4 STAMINA (never above Initial) -
// confirmed verbatim from this book's own "Stamina and Provisions" rules
// text. No other reusable companion/item mechanic exists in this book (a
// two-dose Potion of Healing at §204 and Luck Powder at §39 are one-off
// narrative loot, not guaranteed setup items - not modeled, same precedent
// as excluding non-combat narrative one-offs in books 226/228).
//
// 47 stat-block encounters extracted across 36 sections. Multi-enemy
// fights are mixed per this book's own rules ("sometimes you will have to
// fight them all together; sometimes... one after the other") - sections
// explicitly saying "together" (§87 Hobgoblins, §310 Natives, §363 Orcs,
// and the first two of three Orcs at §185) use the pairedFight+sideEnemy
// toggle; sections saying "one at a time" (§6, §59, §120, §281, §348) use
// plain sequential re-pick, same as any single-enemy fight.
//
// Structural note: BFS from §1 reaches 398/400 sections. §5 and §391 are
// confirmed genuine orphans - grepped the entire source HTML for both as
// link targets and as plain "turn to" text; neither appears anywhere
// except its own section header. No dynamic/puzzle mechanism explains
// either (checked the §119 date-code puzzle, unrelated). Treated as an
// original 1980s print error, not an extraction bug - same precedent as
// book 202/229's disclosed unreachable sections.
//
// All state lives in pt.sim230, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const MAX_PROVISIONS = 10;
const PROVISIONS_HEAL = 4;
const SIDE_WOUND_DMG = 2;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim230) {
    pt.sim230 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        provisionsLeft: MAX_PROVISIONS,
        attackModifier: 0,
        enemyWoundDamage: 2,
        winAfterHits: 0,
        enemyAutoWinFirstRound: false,
        hitsLandedThisFight: 0,
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
  const d = pt.sim230;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.provisionsLeft === undefined) d.player.provisionsLeft = MAX_PROVISIONS;
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.winAfterHits === undefined) d.player.winAfterHits = 0;
  if (d.player.enemyAutoWinFirstRound === undefined) d.player.enemyAutoWinFirstRound = false;
  if (d.player.hitsLandedThisFight === undefined) d.player.hitsLandedThisFight = 0;
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

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }
function _sideEnemyNameSafe(d) { return escapeHtml(d.sideEnemy.name.trim() || t('battlesim.default_side_enemy')); }

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.winAfterHits = 0;
  d.player.enemyAutoWinFirstRound = false;
  d.player.hitsLandedThisFight = 0;
  d.pairedFight = false;
  d.sideEnemy = { name: '', skill: 0, staminaMax: 0 };
}

// Uncapped (not trimmed to a rolling window) - the admin dashboard aggregates
// battle counts app-wide from this array, so per-user history needs to be a
// true lifetime total.
function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerStamina: d.player.stamina, playerStaminaMax: d.player.staminaInitial,
    ts: Date.now(),
  });
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _firstRoundOverride(d) {
  if (d.player.enemyAutoWinFirstRound) {
    _appendLog(d, t('battlesim230.log.enemy_firststrike', { enemy: _enemyNameSafe(d) }));
    return 'enemy';
  }
  return null;
}

function _runRound() {
  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  const isFirstRound = d.roundsThisBattle === 0;
  d.roundsThisBattle++;

  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const override = isFirstRound ? _firstRoundOverride(d) : null;

  let playerWins = false, tie = false;
  if (override === 'enemy') {
    playerWins = false;
  } else {
    const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const enemyAS  = _roll2d6() + d.enemy.skill;
    _appendLog(d, t('battlesim230.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
    if (playerAS === enemyAS) tie = true;
    else playerWins = playerAS > enemyAS;
  }

  if (tie) {
    _appendLog(d, t('battlesim230.log.both_avoided'));
  } else if (playerWins) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
    d.player.hitsLandedThisFight++;
    _appendLog(d, t('battlesim230.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.stamina > 0) {
      d.enemy.stamina = 0;
      _appendLog(d, t('battlesim230.log.press_advantage'));
    }
    if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
    _appendLog(d, t('battlesim230.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Paired fight: a second, independent exchange with its own fresh player
  // roll every round - covers any two-attacker encounters in this book. The
  // side attacker is never wounded through this path.
  if (d.pairedFight && d.sideEnemy.staminaMax > 0 && d.player.stamina > 0) {
    const sidePlayerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    _appendLog(d, t('battlesim230.log.side_round', { enemy: _sideEnemyNameSafe(d), playerAS: sidePlayerAS, enemyAS: sideAS }));
    if (sideAS > sidePlayerAS) {
      d.player.stamina = Math.max(0, d.player.stamina - SIDE_WOUND_DMG);
      _appendLog(d, t('battlesim230.log.side_wounds', { enemy: _sideEnemyNameSafe(d), n: SIDE_WOUND_DMG, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'side-hit' });
    } else {
      _appendLog(d, t('battlesim230.log.side_fend', { enemy: _sideEnemyNameSafe(d) }));
    }
  }

  if (d.enemy.stamina <= 0) {
    _appendLog(d, t('battlesim230.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim230.log.fallen', { skull: SVG_SKULL }));
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
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
      _appendLog(d, t('battlesim230.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim230.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= 0) { _appendLog(d, t('battlesim230.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.kind === 'side-hit' ? _sideEnemyNameSafe(d) : _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim230.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim230.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim230.log.fallen', { skull: SVG_SKULL }));
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
  if (d.log.length) _appendLog(d, t('battlesim230.log.reset_sep'));
  _appendLog(d, t('battlesim230.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Provisions ──────────────────────────────────────────────────────────────

function _eatProvisions() {
  const d = _data();
  if (!d || _notReady(d)) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim230.alert.provisions_midfight'));
    return;
  }
  if (d.player.provisionsLeft <= 0) return;
  if (d.player.stamina >= d.player.staminaInitial) {
    showAlert(t('battlesim230.alert.stamina_full'));
    return;
  }
  d.player.provisionsLeft--;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + PROVISIONS_HEAL);
  _appendLog(d, t('battlesim230.log.provisions', { before, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  saveState();
  _renderAll();
}


// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim230-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim230.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim230.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = t('battlesim230.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim230-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim230-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim230-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim230-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim230-history-summary');
  const listEl = document.getElementById('sim230-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim230.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim230.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim230.history.won') : t('battlesim230.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim230-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim230-player-skill').value      = d.player.skill;
  document.getElementById('sim230-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim230-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim230-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim230-player-luck').value       = d.player.luck;
  document.getElementById('sim230-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim230-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim230-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim230.btn.rolled') : t('battlesim230.btn.roll');


  document.getElementById('sim230-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim230-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim230-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim230-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim230-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim230-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim230-enemy-winhits').value    = d.player.winAfterHits;
  document.getElementById('sim230-enemy-firstwin').checked = d.player.enemyAutoWinFirstRound;

  document.getElementById('sim230-paired').checked = d.pairedFight;
  document.getElementById('sim230-side-pick').value = d.sideEnemy.name;
  document.getElementById('sim230-side-skill').value = d.sideEnemy.skill;
  document.getElementById('sim230-side-staminamax').value = d.sideEnemy.staminaMax;
  document.getElementById('sim230-side-fields').style.display = d.pairedFight ? '' : 'none';

  const pendingEl = document.getElementById('sim230-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim230() {
  const overlay = document.getElementById('sim230-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim230(); return; }
  _renderAll();
}

function openSim230() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim230-overlay').classList.add('active');
}

function closeSim230() {
  document.getElementById('sim230-overlay')?.classList.remove('active');
}

export function setSim230Visible(visible) {
  const btn = document.getElementById('sim230-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim230();
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

export function initSim230() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim230-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim230-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim230.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim230-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim230.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim230.ui.skill'), 'sim230-player-skill')}
            ${_numField(t('battlesim230.ui.skill_initial'), 'sim230-player-skillmax')}
            ${_numField(t('battlesim230.ui.stamina'), 'sim230-player-stamina')}
            ${_numField(t('battlesim230.ui.stamina_initial'), 'sim230-player-staminamax')}
            ${_numField(t('battlesim230.ui.luck'), 'sim230-player-luck')}
            ${_numField(t('battlesim230.ui.luck_initial'), 'sim230-player-luckmax')}
            ${_numField(t('battlesim230.ui.atkmod'), 'sim230-player-atkmod')}
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim230.ui.provisions')}</span>
              <span id="sim230-provisions-left" class="bsim-ae-display"></span>
              <button id="sim230-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim230.btn.provisions_eat', { n: PROVISIONS_HEAL })}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim230.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim230.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim230-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim230-enemy-pick-dropdown">
                <ul id="sim230-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim230.ui.skill'), 'sim230-enemy-skill')}
            ${_numField(t('battlesim230.ui.stamina'), 'sim230-enemy-stamina')}
            ${_numField(t('battlesim230.ui.stamina_max'), 'sim230-enemy-staminamax')}
            ${_numField(t('battlesim230.ui.wound_dmg'), 'sim230-enemy-wounddmg')}
            ${_numField(t('battlesim230.ui.win_after_hits'), 'sim230-enemy-winhits')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim230-enemy-firstwin" class="inv-edit-check"> ${t('battlesim230.ui.enemy_firstwin_toggle')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim230-paired" class="inv-edit-check"> ${t('battlesim230.ui.paired_toggle')}</label>
            </div>
            <div id="sim230-side-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim230.ui.pick')}</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="sim230-side-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim230-side-pick-dropdown">
                  <ul id="sim230-side-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField(t('battlesim230.ui.skill'), 'sim230-side-skill')}
              ${_numField(t('battlesim230.ui.stamina_max'), 'sim230-side-staminamax')}
            </div>
          </div>
          <div id="sim230-status" class="bsim-status"></div>
          <div id="sim230-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim230.btn.luck_prompt')}</span>
            <button id="sim230-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim230.btn.luck_yes')}</button>
            <button id="sim230-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim230.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim230-round" class="inv-add-btn bsim-action-primary">${t('battlesim230.btn.round')}</button>
            <button id="sim230-reset" class="inv-add-btn">${t('battlesim230.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim230-history-summary">${t('battlesim230.history.summary', { n: 0 })}</summary>
            <div id="sim230-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim230-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim230-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim230);
  document.getElementById('sim230-close').addEventListener('click', closeSim230);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim230(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim230-overlay'),
    open:  openSim230,
    close: closeSim230,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim230();
  });

  document.getElementById('sim230-round').addEventListener('click', _runRound);
  document.getElementById('sim230-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim230-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim230-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim230-provisions').addEventListener('click', _eatProvisions);

  document.getElementById('sim230-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim230.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });


  document.getElementById('sim230-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim230-side-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim230-paired').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.pairedFight = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim230-enemy-firstwin').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.enemyAutoWinFirstRound = e.target.checked;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim230-player-skill':      ['player', 'skill'],
    'sim230-player-skillmax':   ['player', 'skillInitial'],
    'sim230-player-stamina':    ['player', 'stamina'],
    'sim230-player-staminamax': ['player', 'staminaInitial'],
    'sim230-player-luck':       ['player', 'luck'],
    'sim230-player-luckmax':    ['player', 'luckInitial'],
    'sim230-player-atkmod':     ['player', 'attackModifier'],
    'sim230-enemy-skill':       ['enemy', 'skill'],
    'sim230-enemy-stamina':        ['enemy', 'stamina'],
    'sim230-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim230-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim230-enemy-winhits':        ['player', 'winAfterHits'],
    'sim230-side-skill':        ['sideEnemy', 'skill'],
    'sim230-side-staminamax':   ['sideEnemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Attack modifier is the one field allowed to go negative - every other
    // field stays clamped to 0 or above.
    val = id === 'sim230-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim230-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim230-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim230-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim230-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim230-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim230-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim230-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim230-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim230-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim230-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim230-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim230-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim230-enemy-pick', 'sim230-enemy-pick-dropdown', enemy => {
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
  _setupEnemyAutocomplete('sim230-side-pick', 'sim230-side-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.sideEnemy.name = enemy.name;
    if (enemy.attack != null) d.sideEnemy.skill = enemy.attack;
    if (enemy.hp != null)     d.sideEnemy.staminaMax = enemy.hp;
    saveState();
    _renderAll();
  });
}
