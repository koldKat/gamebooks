// ── Battle Simulator (Fangs of Fury, book 235) ────────────────────────────────
// Self-contained module. Imports from state.js, confirm.js, charsheet.js and
// util.js. Visibility is gated (book 235 only) by the caller in boot.js via
// setSim235Visible().
// To remove: delete this file, remove its import line and initSim235()/
// setSim235Visible()/renderSim235() calls from boot.js, remove 'sim235' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim235-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js, remove #sim235-btn from battlesim.css
// (shared with the other bsim-* buttons, so only remove it if all are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system (SKILL 1d6+6, STAMINA
// 2d6+12, LUCK 1d6+6, normal wound 2 STAMINA, Test Your Luck costs 1 LUCK) -
// this book's own printed rules are the standard FF text verbatim, unlike
// book 222 (no Provisions) - this book DOES have the usual 10-meal
// Provisions system (+4 STAMINA/meal) plus a one-off Potion of Skill/
// Strength/Fortune choice, same "apply by hand with the existing steppers"
// precedent as every other book's potions here.
//
// attackModifier + enemyWoundDamage cover every "-N SKILL this fight"/
// "unusual wound size" case found in the roster pass:
// - Horned Devil (§130): "Reduce your SKILL by 2 for this combat only."
// - Mage Warrior(s) (§246, §396 x3): -2 SKILL for the fight if the player
//   doesn't carry a Wand (fold in via attackModifier by hand).
// - Dragonman (§89, §117): a pre-fight STAMINA loss (4 points) if the
//   player has no Black Cube, applied once before the fight starts with
//   the ordinary STAMINA stepper - not a per-round mechanic.
//
// Deliberately NOT modeled, matching this app's precedent for narrative
// branching that isn't itself a combat-math change: Jinxana's (§152)
// instant-death-with-no-fight branch if the player carries neither a Wand
// nor a Black Cube (the book kills you outright before any Attack Round);
// the Schizoid Genie's (§329) unfightable-without-a-Wand branch (routes
// straight to §30, no combat happens at all); the "Bridge Guard Orc(s)"
// encounter (§221), where a 1d6 roll (not modeled here) sets how many
// identical Orcs join the fight - roll the die by hand, then just re-pick
// the same "BRIDGE GUARD ORC(S) (§221)" entry from the Enemy dropdown and
// re-fight it that many times in sequence; and every other "Fight each in
// turn" multi-enemy encounter (§82, §84, §138, §310, §347, §396) - this
// book always resolves multiple creatures sequentially, one full battle at
// a time, never simultaneously, so no extra side-enemy machinery is
// needed: defeat the first, then re-pick the next name from the same
// Enemy dropdown. Also not modeled: the fourteen-Walls-of-Defence Bracelet
// timer (a narrative pressure gauge unrelated to combat math - track it on
// paper as the book instructs) and one-off STAMINA/SKILL/LUCK gains or
// losses from non-combat paragraphs (apply by hand with the steppers, same
// as any other book here).
//
// All state lives in pt.sim235, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const MAX_PROVISIONS = 10;
const PROVISIONS_HEAL = 4;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim235) {
    pt.sim235 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        provisionsLeft: MAX_PROVISIONS,
        attackModifier: 0,
        enemyWoundDamage: 2,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim235;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.provisionsLeft === undefined) d.player.provisionsLeft = MAX_PROVISIONS;
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
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

function _enemyDefeated(d) { return d.enemy.staminaMax > 0 && d.enemy.stamina <= 0; }

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
}

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
  d.roundsThisBattle++;

  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim235.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));

  if (playerAS === enemyAS) {
    _appendLog(d, t('battlesim235.log.both_avoided'));
  } else if (playerAS > enemyAS) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
    _appendLog(d, t('battlesim235.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (!_enemyDefeated(d)) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
    _appendLog(d, t('battlesim235.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  if (_enemyDefeated(d)) {
    _appendLog(d, t('battlesim235.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim235.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

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
      _appendLog(d, t('battlesim235.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim235.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (_enemyDefeated(d)) { _appendLog(d, t('battlesim235.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim235.log.luck_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim235.log.luck_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim235.log.fallen', { skull: SVG_SKULL }));
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
  if (d.log.length) _appendLog(d, t('battlesim235.log.reset_sep'));
  _appendLog(d, t('battlesim235.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Provisions ───────────────────────────────────────────────────────────────

function _eatProvisions() {
  const d = _data();
  if (!d || _notReady(d)) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim235.alert.provisions_midfight'));
    return;
  }
  if (d.player.provisionsLeft <= 0) return;
  if (d.player.stamina >= d.player.staminaInitial) {
    showAlert(t('battlesim235.alert.stamina_full'));
    return;
  }
  d.player.provisionsLeft--;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + PROVISIONS_HEAL);
  _appendLog(d, t('battlesim235.log.provisions', { before, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim235-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim235.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim235.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && _enemyDefeated(d))            el.innerHTML = t('battlesim235.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && _enemyDefeated(d));
  document.getElementById('sim235-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim235-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim235-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim235-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim235-history-summary');
  const listEl = document.getElementById('sim235-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim235.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim235.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim235.history.won') : t('battlesim235.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim235-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim235-player-skill').value      = d.player.skill;
  document.getElementById('sim235-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim235-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim235-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim235-player-luck').value       = d.player.luck;
  document.getElementById('sim235-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim235-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim235-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim235.btn.rolled') : t('battlesim235.btn.roll');

  document.getElementById('sim235-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim235-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim235-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim235-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim235-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim235-enemy-wounddmg').value   = d.player.enemyWoundDamage;

  const pendingEl = document.getElementById('sim235-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim235() {
  const overlay = document.getElementById('sim235-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim235(); return; }
  _renderAll();
}

function openSim235() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim235-overlay').classList.add('active');
}

function closeSim235() {
  document.getElementById('sim235-overlay')?.classList.remove('active');
}

export function setSim235Visible(visible) {
  const btn = document.getElementById('sim235-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim235();
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

export function initSim235() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim235-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim235-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim235.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim235-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim235.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim235.ui.skill'), 'sim235-player-skill')}
            ${_numField(t('battlesim235.ui.skill_initial'), 'sim235-player-skillmax')}
            ${_numField(t('battlesim235.ui.stamina'), 'sim235-player-stamina')}
            ${_numField(t('battlesim235.ui.stamina_initial'), 'sim235-player-staminamax')}
            ${_numField(t('battlesim235.ui.luck'), 'sim235-player-luck')}
            ${_numField(t('battlesim235.ui.luck_initial'), 'sim235-player-luckmax')}
            ${_numField(t('battlesim235.ui.atkmod'), 'sim235-player-atkmod')}
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim235.ui.provisions')}</span>
              <span id="sim235-provisions-left" class="bsim-ae-display"></span>
              <button id="sim235-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim235.btn.provisions_eat', { n: PROVISIONS_HEAL })}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim235.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim235.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim235-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim235-enemy-pick-dropdown">
                <ul id="sim235-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim235.ui.skill'), 'sim235-enemy-skill')}
            ${_numField(t('battlesim235.ui.stamina'), 'sim235-enemy-stamina')}
            ${_numField(t('battlesim235.ui.stamina_max'), 'sim235-enemy-staminamax')}
            ${_numField(t('battlesim235.ui.wound_dmg'), 'sim235-enemy-wounddmg')}
          </div>
          <div id="sim235-status" class="bsim-status"></div>
          <div id="sim235-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim235.btn.luck_prompt')}</span>
            <button id="sim235-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim235.btn.luck_yes')}</button>
            <button id="sim235-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim235.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim235-round" class="inv-add-btn bsim-action-primary">${t('battlesim235.btn.round')}</button>
            <button id="sim235-reset" class="inv-add-btn">${t('battlesim235.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim235-history-summary">${t('battlesim235.history.summary', { n: 0 })}</summary>
            <div id="sim235-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim235-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim235-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim235);
  document.getElementById('sim235-close').addEventListener('click', closeSim235);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim235(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim235-overlay'),
    open:  openSim235,
    close: closeSim235,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim235();
  });

  document.getElementById('sim235-round').addEventListener('click', _runRound);
  document.getElementById('sim235-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim235-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim235-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim235-provisions').addEventListener('click', _eatProvisions);

  document.getElementById('sim235-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim235.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim235-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim235-player-skill':      ['player', 'skill'],
    'sim235-player-skillmax':   ['player', 'skillInitial'],
    'sim235-player-stamina':    ['player', 'stamina'],
    'sim235-player-staminamax': ['player', 'staminaInitial'],
    'sim235-player-luck':       ['player', 'luck'],
    'sim235-player-luckmax':    ['player', 'luckInitial'],
    'sim235-player-atkmod':     ['player', 'attackModifier'],
    'sim235-enemy-skill':       ['enemy', 'skill'],
    'sim235-enemy-stamina':        ['enemy', 'stamina'],
    'sim235-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim235-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Attack modifier is the one field allowed to go negative (a
    // no-Wand/disarmed penalty is always a subtraction) - every other
    // field stays clamped to 0 or above.
    val = id === 'sim235-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim235-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim235-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim235-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim235-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim235-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim235-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim235-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim235-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim235-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim235-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim235-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim235-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim235-enemy-pick', 'sim235-enemy-pick-dropdown', enemy => {
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
