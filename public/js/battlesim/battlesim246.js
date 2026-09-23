// ── Battle Simulator (Return to Firetop Mountain, book 246) ─────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 246 only) by the caller in boot.js via
// setSim246Visible().
// To remove: delete this file, remove its import line and initSim246()/
// setSim246Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js modules, so only remove it if all are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system (SKILL 1d6+6, STAMINA
// 2d6+12, LUCK 1d6+6, normal wound 2 STAMINA, Test Your Luck as usual).
//
// This book's full enemy roster (45 stat blocks across every fight in the
// book, including each named slot of every multi-enemy encounter) is seeded
// in book_enemies. Rather than hardcode 12+ bespoke per-monster mechanics,
// three general knobs (reused from the book198/200/201 pattern) cover every
// special rule found in a full read-through:
// - attackModifier: covers SKILL-reduction fights (Metallix -2 while
//   disarmed, Vampire Bat -2 in darkness, Chaos Beast Man's mid-fight
//   transform into Mutant Beast Lord - just re-pick the stronger enemy).
// - requiredWeapon toggle + reducedWoundDamage: covers "only a silver
//   dagger truly hurts this thing" (Vampire sec.254 - 0 damage without one;
//   Death Head sec.277 - 1 STAMINA instead of 2 without one).
// - instantKillThreshold: covers "you don't wear it down, you finish it
//   outright" fights - Undead Chaos Warrior (sec.2: win a round, then roll
//   1 die, 5-6 kills it outright, 1-4 nothing) and the ghost-like
//   Doppelgangers (sec.159/8: no STAMINA loss on either side, winner
//   re-rolls both dice, a double decides it) both boil down to the same
//   shape - win a round, then a follow-up roll (default 1d6, threshold 5)
//   decides whether the enemy dies instantly instead of losing STAMINA.
//
// Deliberately NOT modeled: Zagor's four-Elemental staged pre-duel fight
// (sec.14/55/94/186, decided by which golden dragon's tooth you throw, not
// by combat rolls) and the two Inquisitor riddles/coin-count/age puzzle -
// none of these are dice-vs-dice battles a sim has anything to calculate.
// The final SKILL 11/STAMINA 18 Zagor duel itself (sec.27, "no armour, long
// knives") is standard combat and is in the enemy roster as normal.
//
// All state lives in pt.sim246, per-user/per-book via currentPlaythrough().

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
  if (!pt.sim246) {
    pt.sim246 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        attackModifier: 0,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      hasRequiredWeapon: true,
      reducedWoundDamage: 0,
      instantKillThreshold: 0,
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim246;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.hasRequiredWeapon === undefined) d.hasRequiredWeapon = true;
  if (d.reducedWoundDamage === undefined) d.reducedWoundDamage = 0;
  if (d.instantKillThreshold === undefined) d.instantKillThreshold = 0;
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

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.hasRequiredWeapon = true;
  d.reducedWoundDamage = 0;
  d.instantKillThreshold = 0;
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
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  const normalWoundDmg = d.hasRequiredWeapon ? 2 : Math.max(0, d.reducedWoundDamage || 0);
  const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim246.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
  if (playerAS === enemyAS) {
    _appendLog(d, t('battlesim246.log.both_avoided'));
  } else if (playerAS > enemyAS) {
    // Instant-kill fights (Undead Chaos Warrior, Doppelgangers): winning a
    // round doesn't wear STAMINA down - instead roll again to see if this
    // is the blow that finishes it.
    if (d.instantKillThreshold > 0) {
      const roll = _roll1d6();
      if (roll >= d.instantKillThreshold) {
        d.enemy.stamina = 0;
        _appendLog(d, t('battlesim246.log.instant_kill', { roll, threshold: d.instantKillThreshold, enemy: _enemyNameSafe(d) }));
      } else {
        _appendLog(d, t('battlesim246.log.instant_kill_miss', { roll, threshold: d.instantKillThreshold, enemy: _enemyNameSafe(d) }));
      }
    } else if (normalWoundDmg <= 0) {
      _appendLog(d, t('battlesim246.log.no_effect', { enemy: _enemyNameSafe(d) }));
    } else {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - normalWoundDmg);
      _appendLog(d, t('battlesim246.log.you_wound', { enemy: _enemyNameSafe(d), n: normalWoundDmg, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
      if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
    }
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - 2);
    _appendLog(d, t('battlesim246.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: 2, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  if (d.enemy.stamina <= 0) {
    _appendLog(d, t('battlesim246.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim246.log.fallen', { skull: SVG_SKULL }));
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
      _appendLog(d, t('battlesim246.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim246.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= 0) { _appendLog(d, t('battlesim246.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim246.log.luck_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim246.log.luck_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim246.log.fallen', { skull: SVG_SKULL }));
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
  if (d.log.length) _appendLog(d, t('battlesim246.log.reset_sep'));
  _appendLog(d, t('battlesim246.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim246-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim246.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim246.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = t('battlesim246.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim246-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim246-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim246-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim246-history-summary');
  const listEl = document.getElementById('sim246-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim246.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim246.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim246.history.won') : t('battlesim246.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim246-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim246-player-skill').value      = d.player.skill;
  document.getElementById('sim246-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim246-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim246-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim246-player-luck').value       = d.player.luck;
  document.getElementById('sim246-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim246-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim246-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim246.btn.rolled') : t('battlesim246.btn.roll');

  document.getElementById('sim246-enemy-pick').value       = d.enemy.name;
  document.getElementById('sim246-enemy-skill').value      = d.enemy.skill;
  document.getElementById('sim246-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim246-enemy-staminamax').value = d.enemy.staminaMax;

  document.getElementById('sim246-weapon').checked = d.hasRequiredWeapon;
  document.getElementById('sim246-reduced-dmg').value = d.reducedWoundDamage;
  document.getElementById('sim246-reduced-dmg').disabled = d.hasRequiredWeapon;
  document.getElementById('sim246-instant-threshold').value = d.instantKillThreshold;

  const pendingEl = document.getElementById('sim246-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim246() {
  const overlay = document.getElementById('sim246-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim246(); return; }
  _renderAll();
}

function openSim246() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim246-overlay').classList.add('active');
}

function closeSim246() {
  document.getElementById('sim246-overlay')?.classList.remove('active');
}

export function setSim246Visible(visible) {
  const btn = document.getElementById('sim246-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim246();
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

// ── Init ──────────────────────────────────────────────────────────────────

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

export function initSim246() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim246-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim246-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim246.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim246-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim246.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim246.ui.skill'), 'sim246-player-skill')}
            ${_numField(t('battlesim246.ui.skill_initial'), 'sim246-player-skillmax')}
            ${_numField(t('battlesim246.ui.stamina'), 'sim246-player-stamina')}
            ${_numField(t('battlesim246.ui.stamina_initial'), 'sim246-player-staminamax')}
            ${_numField(t('battlesim246.ui.luck'), 'sim246-player-luck')}
            ${_numField(t('battlesim246.ui.luck_initial'), 'sim246-player-luckmax')}
            ${_numField(t('battlesim246.ui.atkmod'), 'sim246-player-atkmod')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim246.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim246.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim246-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim246-enemy-pick-dropdown">
                <ul id="sim246-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim246.ui.skill'), 'sim246-enemy-skill')}
            ${_numField(t('battlesim246.ui.stamina'), 'sim246-enemy-stamina')}
            ${_numField(t('battlesim246.ui.stamina_max'), 'sim246-enemy-staminamax')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim246-weapon" class="inv-edit-check"> ${t('battlesim246.ui.required_weapon')}</label>
            </div>
            ${_numField(t('battlesim246.ui.reduced_dmg'), 'sim246-reduced-dmg')}
            ${_numField(t('battlesim246.ui.instant_threshold'), 'sim246-instant-threshold')}
          </div>
          <div id="sim246-status" class="bsim-status"></div>
          <div id="sim246-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim246.btn.luck_prompt')}</span>
            <button id="sim246-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim246.btn.luck_yes')}</button>
            <button id="sim246-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim246.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim246-round" class="inv-add-btn bsim-action-primary">${t('battlesim246.btn.round')}</button>
            <button id="sim246-reset" class="inv-add-btn">${t('battlesim246.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim246-history-summary">${t('battlesim246.history.summary', { n: 0 })}</summary>
            <div id="sim246-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim246-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim246-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim246);
  document.getElementById('sim246-close').addEventListener('click', closeSim246);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim246(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim246-overlay'),
    open:  openSim246,
    close: closeSim246,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim246();
  });

  document.getElementById('sim246-round').addEventListener('click', _runRound);
  document.getElementById('sim246-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim246-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim246-luck-no').addEventListener('click', _skipLuck);

  document.getElementById('sim246-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim246.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim246-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim246-weapon').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.hasRequiredWeapon = e.target.checked;
    saveState();
    _renderInputs();
  });

  const FIELD_MAP = {
    'sim246-player-skill':      ['player', 'skill'],
    'sim246-player-skillmax':   ['player', 'skillInitial'],
    'sim246-player-stamina':    ['player', 'stamina'],
    'sim246-player-staminamax': ['player', 'staminaInitial'],
    'sim246-player-luck':       ['player', 'luck'],
    'sim246-player-luckmax':    ['player', 'luckInitial'],
    'sim246-player-atkmod':     ['player', 'attackModifier'],
    'sim246-enemy-skill':       ['enemy', 'skill'],
    'sim246-enemy-stamina':     ['enemy', 'stamina'],
    'sim246-enemy-staminamax':  ['enemy', 'staminaMax'],
    'sim246-reduced-dmg':       ['reducedWoundDamage', null],
    'sim246-instant-threshold': ['instantKillThreshold', null],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    const allowNegative = id === 'sim246-player-atkmod';
    val = allowNegative ? Number(val) : Math.max(0, val);
    if (id === 'sim246-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim246-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim246-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim246-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim246-instant-threshold') val = Math.min(val, 6);
    if (map[1] === null) d[map[0]] = val;
    else d[map[0]][map[1]] = val;
    if (id === 'sim246-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim246-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim246-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim246-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim246-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim246-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim246-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim246-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim246-enemy-pick', 'sim246-enemy-pick-dropdown', enemy => {
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
