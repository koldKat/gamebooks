// ── Battle Simulator (Space Assassin, book 208) ─────────────────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 208 only) by the caller in boot.js via
// setSim208Visible().
// To remove: delete this file, remove its import line and initSim208()/
// setSim208Visible() calls from boot.js, remove 'sim208' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with battlesim8.js/battlesim829.js/battlesim286.js/battlesim198.js/
// battlesim199.js/battlesim200.js/battlesim186.js/battlesim201.js/
// battlesim202.js/battlesim203.js/battlesim204.js/battlesim205.js/
// battlesim206.js/battlesim207.js, so only remove it if all fifteen are gone).
//
// No unified combat system - two completely separate ones, selected via a
// mode toggle (same shape as book 186's hand-to-hand/phaser/ship split):
// - Hand-to-hand: standard Fighting Fantasy opposed 2d6+SKILL Attack
//   Strength rolls, flat 2 STAMINA per hit. LUCK is tracked (rules p.1) but
//   never referenced by either combat system's own resolution steps, same
//   as book 186 - it's for narrative Test Your Luck moments only.
// - Gunfire: NOT opposed - each side rolls under their own SKILL to hit
//   (attacker fires first every round, then the defender fires back if
//   still alive). Damage depends on the firing side's weapon: electric
//   lash flat 2, assault blaster 1d6, unarmed 1 (rules p.1 explicitly
//   covers unarmed gunfire at 1pt/hit). "If your opponent's weapon is not
//   specified, treat it as an assault blaster" (rules p.1) - default enemy
//   weapon is assault blaster. A hit that would wound you first rolls an
//   ARMOUR test: 2d6 <= current ARMOUR negates the wound entirely; ARMOUR
//   then degrades by 1 regardless of the test's outcome (identical
//   mechanic/wording to Test Your Luck, applied on every test, not just
//   on failures).
//
// One book-specific boss encounter modeled directly rather than as a
// generic knob, since nothing else in the book resembles it: the Deity
// (§308) has a fixed six-weapon table and uses one at random each round
// (rolled here) instead of a single fixed SKILL/weapon - whip SKILL10/dmg3,
// bolas SKILL9/dmg2, spear SKILL7/dmg1, electric lash SKILL8/dmg2, assault
// blaster SKILL6/dmg1-6, disintegrator SKILL5/instant death on any hit. A
// "Deity fight (§308)" checkbox switches gunfire mode into this table.
//
// One generic recurring per-round checkbox, reused from book 186's
// enemyExtraAttack shape: "Enemy fires/attacks twice per round" (covers
// §211's Guard Robot, which explicitly fires twice per combat round).
//
// Deliberately NOT modeled, same precedent as every other sim in this app:
// the point-buy weapon/armour shopping step during character creation
// (rules p.1 - a one-time Adventure Sheet setup, not a battle mechanic;
// just set the Weapon field to whatever was actually bought), grenades
// (an explicitly pre-fight, book-gated, narrative-only action - apply
// 1d6 damage per target by hand with the STAMINA steppers when the book
// allows it), the many one-off "lose N STAMINA/ARMOUR" narrative penalties
// printed outside of a fight (apply by hand), and the entire ~33-section
// vehicle wargame starting at §381 (SHIELDS/STATUS/map system - a
// genuinely separate mini-game the user explicitly chose to skip; its
// map/scoresheet aren't even present in the source text extraction).
//
// All state lives in pt.sim208, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=14';
import { showAlert } from '../confirm.js?v=6';
import { getPlayBtnRow } from '../charsheet.js?v=106';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=89';
import { t } from '../i18n.js?v=73';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Deity (§308) weapon table - rolled fresh each round when deityMode is on.
const DEITY_WEAPONS = [
  { name: 'battlesim208.weapon.whip',       skill: 10, dmg: 3,        instant: false },
  { name: 'battlesim208.weapon.bolas',      skill: 9,  dmg: 2,        instant: false },
  { name: 'battlesim208.weapon.spear',      skill: 7,  dmg: 1,        instant: false },
  { name: 'battlesim208.weapon.lash',       skill: 8,  dmg: 2,        instant: false },
  { name: 'battlesim208.weapon.blaster',    skill: 6,  dmg: null,     instant: false }, // 1d6
  { name: 'battlesim208.weapon.disintegrator', skill: 5, dmg: null,   instant: true  },
];

const HAND_WOUND_DMG = 2;
const LASH_DMG = 2;
const UNARMED_DMG = 1;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim208) {
    pt.sim208 = {
      skill: 0, skillInitial: 0,
      stamina: 0, staminaInitial: 0,
      luck: 0, luckInitial: 0,
      armour: 0, armourInitial: 0,
      rolled: false,
      mode: 'handtohand', // 'handtohand' | 'gunfire'
      weapon: 'lash', // 'lash' | 'blaster' | 'unarmed' - your gunfire weapon
      enemyWeapon: 'blaster', // enemy's gunfire weapon - defaults to assault blaster per rules p.1
      enemyExtraAttack: false, // §211 Guard Robot fires twice per round
      deityMode: false, // §308 - random weapon table instead of fixed enemy SKILL/weapon
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim208;
  if (d.skill === undefined) d.skill = 0;
  if (d.skillInitial === undefined) d.skillInitial = 0;
  if (d.stamina === undefined) d.stamina = 0;
  if (d.staminaInitial === undefined) d.staminaInitial = 0;
  if (d.luck === undefined) d.luck = 0;
  if (d.luckInitial === undefined) d.luckInitial = 0;
  if (d.armour === undefined) d.armour = 0;
  if (d.armourInitial === undefined) d.armourInitial = 0;
  if (d.rolled === undefined) d.rolled = false;
  if (d.mode === undefined) d.mode = 'handtohand';
  if (d.weapon === undefined) d.weapon = 'lash';
  if (d.enemyWeapon === undefined) d.enemyWeapon = 'blaster';
  if (d.enemyExtraAttack === undefined) d.enemyExtraAttack = false;
  if (d.deityMode === undefined) d.deityMode = false;
  if (!d.enemy) d.enemy = { name: '', skill: 0, stamina: 0, staminaMax: 0 };
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
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

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: _enemyName(d), outcome, mode: d.mode, ts: Date.now() });
}

// ── Hand-to-hand ─────────────────────────────────────────────────────────────

function _runHandToHandRound() {
  const d = _data();
  if (!d || _notReady(d) || d.stamina <= 0 || d.enemy.stamina <= 0) return;
  d.roundsThisBattle++;

  const playerAS = _roll2d6() + d.skill;
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim208.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));

  if (playerAS > enemyAS) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - HAND_WOUND_DMG);
    _appendLog(d, t('battlesim208.log.you_wound', { enemy: _enemyNameSafe(d), n: HAND_WOUND_DMG, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
  } else if (playerAS < enemyAS) {
    d.stamina = Math.max(0, d.stamina - HAND_WOUND_DMG);
    _appendLog(d, t('battlesim208.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: HAND_WOUND_DMG, stamina: d.stamina, staminaMax: d.staminaInitial }));
  } else {
    _appendLog(d, t('battlesim208.log.both_avoided'));
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

// ── Gunfire ──────────────────────────────────────────────────────────────────
// Roll under own SKILL to hit (rules p.1). Attacker always fires first each
// round; the defender fires back if it survived.

function _weaponDamage(weapon) {
  if (weapon === 'lash')    return { amount: LASH_DMG, note: '' };
  if (weapon === 'unarmed') return { amount: UNARMED_DMG, note: '' };
  const r = _roll1d6();
  return { amount: r, note: ` (1d6 roll ${r})` }; // assault blaster
}

// A hit against the player tests ARMOUR (2d6 <= current ARMOUR negates the
// wound; ARMOUR then always drops by 1, win or lose the test - identical
// wording/shape to Test Your Luck). Hits the player deals out never test
// anything - only the player wears armour in this book.
function _resolvePlayerHit(d, dmg) {
  const before = d.armour;
  const roll = _roll2d6();
  d.armour = Math.max(0, d.armour - 1);
  if (roll <= before) {
    _appendLog(d, t('battlesim208.log.armour_absorb', { roll, before, armour: d.armour }));
    return;
  }
  d.stamina = Math.max(0, d.stamina - dmg.amount);
  const dmgText = Number.isFinite(dmg.amount) ? t('battlesim208.log.dmg_amount', { n: dmg.amount, note: dmg.note }) : t('battlesim208.log.dmg_fatal', { note: dmg.note });
  _appendLog(d, t('battlesim208.log.armour_penetrate', { roll, before, dmgText, armour: d.armour, stamina: d.stamina, staminaMax: d.staminaInitial }));
}

function _runGunfireRound() {
  const d = _data();
  if (!d || _notReady(d) || d.stamina <= 0 || d.enemy.stamina <= 0) return;
  d.roundsThisBattle++;
  _appendLog(d, t('battlesim208.log.gunfire_round', { round: d.roundsThisBattle }));

  const shots = d.enemyExtraAttack ? 2 : 1;

  const playerRoll = _roll2d6();
  _appendLog(d, t('battlesim208.log.you_fire', { roll: playerRoll, skill: d.skill }));
  if (playerRoll < d.skill) {
    const dmg = _weaponDamage(d.weapon);
    d.enemy.stamina = Math.max(0, d.enemy.stamina - dmg.amount);
    _appendLog(d, t('battlesim208.log.you_hit', { enemy: _enemyNameSafe(d), n: dmg.amount, note: dmg.note, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
  } else {
    _appendLog(d, t('battlesim208.log.miss'));
  }

  if (d.enemy.stamina > 0) {
    for (let i = 0; i < shots && d.stamina > 0; i++) {
      let enemySkill = d.enemy.skill, weaponLabel = null, dmg;
      if (d.deityMode) {
        // "Use the gunfire rules for all the deity's weapons" (§308) - even
        // the disintegrator's instant-destruction still goes through the
        // normal ARMOUR test below (Infinity floors STAMINA at 0 via
        // Math.max in _resolvePlayerHit, but only if the test is failed).
        const w = DEITY_WEAPONS[Math.floor(Math.random() * DEITY_WEAPONS.length)];
        enemySkill  = w.skill;
        weaponLabel = w.name;
        dmg = w.instant ? { amount: Infinity, note: ' - instant destruction' } : (w.dmg != null ? { amount: w.dmg, note: '' } : _weaponDamage('blaster'));
      } else {
        dmg = _weaponDamage(d.enemyWeapon);
      }
      const enemyRoll = _roll2d6();
      _appendLog(d, t('battlesim208.log.enemy_fires', { enemy: _enemyNameSafe(d), weapon: weaponLabel ? t('battlesim208.log.enemy_fires_weapon_suffix', { weapon: escapeHtml(t(weaponLabel)) }) : '', roll: enemyRoll, skill: enemySkill }));
      if (enemyRoll < enemySkill) {
        _resolvePlayerHit(d, dmg);
      } else {
        _appendLog(d, t('battlesim208.log.miss'));
      }
      if (d.stamina <= 0) break;
    }
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  if (d.enemy.stamina <= 0) {
    _appendLog(d, t('battlesim208.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.stamina <= 0) {
    _appendLog(d, t('battlesim208.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _runRound() {
  const d = _data();
  if (!d) return;
  if (d.mode === 'handtohand') _runHandToHandRound();
  else _runGunfireRound();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.stamina = d.enemy.staminaMax;
  d.stamina = d.staminaInitial;
  if (d.log.length) _appendLog(d, t('battlesim208.log.reset_sep'));
  _appendLog(d, t('battlesim208.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
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

function _setupAutocomplete(inputId, dropdownId, onSelect) {
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${e.attack ?? '?'}/${e.hp ?? '?'}</span></li>`
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

// ── Render ───────────────────────────────────────────────────────────────────

function _setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function _setChecked(id, v) { const el = document.getElementById(id); if (el) el.checked = v; }

function _renderInputs(skipEnemyPick) {
  const d = _data();
  if (!d) return;
  _setVal('sim208-skill', d.skill);
  _setVal('sim208-skillmax', d.skillInitial);
  _setVal('sim208-stamina', d.stamina);
  _setVal('sim208-staminamax', d.staminaInitial);
  _setVal('sim208-luck', d.luck);
  _setVal('sim208-luckmax', d.luckInitial);
  _setVal('sim208-armour', d.armour);
  _setVal('sim208-armourmax', d.armourInitial);
  document.getElementById('sim208-mode').value = d.mode;
  document.getElementById('sim208-weapon').value = d.weapon;
  document.getElementById('sim208-enemy-weapon').value = d.enemyWeapon;
  _setChecked('sim208-enemy-extra', d.enemyExtraAttack);
  _setChecked('sim208-deity-mode', d.deityMode);
  _setVal('sim208-enemy-skill', d.enemy.skill);
  _setVal('sim208-enemy-stamina', d.enemy.stamina);
  _setVal('sim208-enemy-staminamax', d.enemy.staminaMax);
  if (!skipEnemyPick) _setVal('sim208-enemy-pick', d.enemy.name);

  document.getElementById('sim208-gunfire-fields').style.display = d.mode === 'gunfire' ? '' : 'none';

  const status = document.getElementById('sim208-status');
  if (!d.rolled) {
    status.textContent = t('battlesim208.status.not_ready');
  } else if (d.stamina <= 0) {
    status.textContent = t('battlesim208.status.fallen');
  } else if (d.enemy.stamina <= 0 && d.enemy.staminaMax > 0) {
    status.textContent = t('battlesim208.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim208-round').disabled = !d.rolled || d.stamina <= 0 || d.enemy.stamina <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim208-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim208-history-summary');
  const listEl = document.getElementById('sim208-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim208.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim208.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim208.history.won') : t('battlesim208.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${escapeHtml(h.mode === 'gunfire' ? 'gunfire' : 'hand-to-hand')} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim208() {
  const overlay = document.getElementById('sim208-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim208(); return; }
  _renderAll();
}

function openSim208() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim208-overlay').classList.add('active');
}

function closeSim208() {
  document.getElementById('sim208-overlay')?.classList.remove('active');
}

export function setSim208Visible(visible) {
  const btn = document.getElementById('sim208-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim208();
}

// ── Init ──────────────────────────────────────────────────────────────────────

function _numField(label, id, width) {
  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <div class="inv-qty-wrap">
        <button class="inv-qty-btn" data-id="${id}" data-delta="-1">−</button>
        <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric"${width ? ` style="width:${width}"` : ''}>
        <button class="inv-qty-btn" data-id="${id}" data-delta="1">+</button>
      </div>
    </div>`;
}

export function initSim208() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim208-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim208-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim208-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim208.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim208.ui.skill'), 'sim208-skill')}
            ${_numField(t('battlesim208.ui.skill_initial'), 'sim208-skillmax')}
            ${_numField(t('battlesim208.ui.stamina'), 'sim208-stamina')}
            ${_numField(t('battlesim208.ui.stamina_initial'), 'sim208-staminamax')}
            ${_numField(t('battlesim208.ui.luck'), 'sim208-luck')}
            ${_numField(t('battlesim208.ui.luck_initial'), 'sim208-luckmax')}
            ${_numField(t('battlesim208.ui.armour'), 'sim208-armour')}
            ${_numField(t('battlesim208.ui.armour_initial'), 'sim208-armourmax')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim208.ui.combat_type')}</span>
              <select id="sim208-mode" class="inv-edit-input bsim-select">
                <option value="handtohand">${t('battlesim208.ui.mode_handtohand')}</option>
                <option value="gunfire">${t('battlesim208.ui.mode_gunfire')}</option>
              </select>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim208.ui.your_weapon')}</span>
              <select id="sim208-weapon" class="inv-edit-input bsim-select">
                <option value="lash">${t('battlesim208.ui.weapon_lash', { n: LASH_DMG })}</option>
                <option value="blaster">${t('battlesim208.ui.weapon_blaster')}</option>
                <option value="unarmed">${t('battlesim208.ui.weapon_unarmed', { n: UNARMED_DMG })}</option>
              </select>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim208.ui.enemy_weapon')}</span>
              <select id="sim208-enemy-weapon" class="inv-edit-input bsim-select">
                <option value="blaster">${t('battlesim208.ui.weapon_blaster')}</option>
                <option value="lash">${t('battlesim208.ui.weapon_lash', { n: LASH_DMG })}</option>
                <option value="unarmed">${t('battlesim208.ui.weapon_unarmed', { n: UNARMED_DMG })}</option>
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim208-enemy-extra" class="inv-edit-check"> ${t('battlesim208.ui.enemy_extra_toggle')}</label>
            </div>
            <div id="sim208-gunfire-fields">
              <div class="inv-edit-row bsim-ae-row">
                <label class="inv-edit-check-label"><input type="checkbox" id="sim208-deity-mode" class="inv-edit-check"> ${t('battlesim208.ui.deity_toggle')}</label>
              </div>
              <div class="bsim-tech-desc">${t('battlesim208.ui.armour_desc')}</div>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim208.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim208-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim208-enemy-pick-dropdown">
                <ul id="sim208-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim208.ui.enemy_skill'), 'sim208-enemy-skill')}
            ${_numField(t('battlesim208.ui.enemy_stamina'), 'sim208-enemy-stamina')}
            ${_numField(t('battlesim208.ui.enemy_stamina_max'), 'sim208-enemy-staminamax')}
          </div>
          <div id="sim208-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim208-round" class="inv-add-btn bsim-action-primary">${t('battlesim208.btn.round')}</button>
            <button id="sim208-reset" class="inv-add-btn">${t('battlesim208.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim208-history-summary">${t('battlesim208.history.summary', { n: 0 })}</summary>
            <div id="sim208-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim208-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim208-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim208);
  document.getElementById('sim208-close').addEventListener('click', closeSim208);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim208(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim208-overlay'),
    open:  openSim208,
    close: closeSim208,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim208();
  });

  document.getElementById('sim208-round').addEventListener('click', _runRound);
  document.getElementById('sim208-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim208-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.skillInitial   = _roll1d6() + 6;
    d.staminaInitial = _roll2d6() + 12;
    d.luckInitial    = _roll1d6() + 6;
    d.armourInitial  = _roll1d6() + 6;
    d.skill   = d.skillInitial;
    d.stamina = d.staminaInitial;
    d.luck    = d.luckInitial;
    d.armour  = d.armourInitial;
    d.rolled  = true;
    _appendLog(d, t('battlesim208.log.rolled'));
    saveState();
    _renderAll();
  });

  document.getElementById('sim208-mode').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.mode = e.target.value;
    d.roundsThisBattle = 0;
    saveState();
    _renderInputs();
  });
  document.getElementById('sim208-weapon').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.weapon = e.target.value;
    saveState();
  });
  document.getElementById('sim208-enemy-weapon').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.enemyWeapon = e.target.value;
    saveState();
  });
  document.getElementById('sim208-enemy-extra').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.enemyExtraAttack = e.target.checked;
    saveState();
  });
  document.getElementById('sim208-deity-mode').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.deityMode = e.target.checked;
    saveState();
  });

  document.getElementById('sim208-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim208-enemy-pick', 'sim208-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name        = enemy.name;
    d.enemy.skill        = enemy.attack ?? 0;
    d.enemy.stamina      = enemy.hp ?? 0;
    d.enemy.staminaMax   = enemy.hp ?? 0;
    d.roundsThisBattle   = 0;
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim208-skill': ['skill'], 'sim208-skillmax': ['skillInitial'],
    'sim208-stamina': ['stamina'], 'sim208-staminamax': ['staminaInitial'],
    'sim208-luck': ['luck'], 'sim208-luckmax': ['luckInitial'],
    'sim208-armour': ['armour'], 'sim208-armourmax': ['armourInitial'],
    'sim208-enemy-skill': ['enemy', 'skill'], 'sim208-enemy-stamina': ['enemy', 'stamina'], 'sim208-enemy-staminamax': ['enemy', 'staminaMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = parseInt(input.value, 10) || 0;
      if (path.length === 1) d[path[0]] = val;
      else d[path[0]][path[1]] = val;
      saveState();
      _renderInputs(true);
    });
  }
  overlay.querySelectorAll('.inv-qty-btn').forEach(btn2 => {
    btn2.addEventListener('click', () => {
      const input = document.getElementById(btn2.dataset.id);
      if (!input) return;
      const delta = parseInt(btn2.dataset.delta, 10);
      input.value = (parseInt(input.value, 10) || 0) + delta;
      input.dispatchEvent(new Event('change'));
    });
  });
}
