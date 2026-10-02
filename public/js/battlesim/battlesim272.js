// Battle Simulator (The Shamutanti Hills, book 272)
// Fighting Fantasy: opposed 2d6 + SKILL; ties miss, normal wounds cost 2 STAMINA.
// Luck modifies a landed hit; narrative bonuses and unmodeled effects are entered manually.
// Two starting meals; 4-point healing is a convenience default, not a fixed book rule.
// Spellcasting and Libra's aid are not simulated.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../core/state.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const MAX_PROVISIONS = 2;
const PROVISIONS_HEAL = 4;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim272) {
    pt.sim272 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        provisionsLeft: 0,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      rolled: false,
      pendingLuck: null,
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim272;
  if (d.rolled === undefined) d.rolled = false;
  if (d.pendingLuck === undefined) d.pendingLuck = null;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.provisionsLeft === undefined) d.player.provisionsLeft = 0;
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
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0) return;
  d.roundsThisBattle++;
  d.pendingLuck = null;

  const playerRoll = _roll2d6() + d.player.skill;
  const enemyRoll   = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim272.log.round', { round: d.roundsThisBattle, playerAS: playerRoll, enemy: _enemyNameSafe(d), enemyAS: enemyRoll }));
  if (playerRoll === enemyRoll) {
    _appendLog(d, t('battlesim272.log.both_avoided'));
  } else if (playerRoll > enemyRoll) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
    _appendLog(d, t('battlesim272.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.enemy.stamina > 0) d.pendingLuck = 'player-hit';
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - 2);
    _appendLog(d, t('battlesim272.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: 2, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuck = 'enemy-hit';
  }

  if (d.enemy.stamina <= 0) {
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim272.log.defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, `${SVG_SKULL} ${t('battlesim272.log.fallen')}`);
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

// Luck costs 1: own hits deal 4/1 damage; incoming hits deal 1/3 (lucky/unlucky).
function _testLuck() {
  const d = _data();
  if (!d || !d.pendingLuck || d.player.luck <= 0) return;
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (d.pendingLuck === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
      _appendLog(d, t('battlesim272.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim272.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= 0) { _appendLog(d, `${SVG_TROPHY} ${t('battlesim272.log.defeated', { enemy: _enemyNameSafe(d) })}`); _recordOutcome(d, 'win'); }
  } else {
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim272.log.luck_hit_lucky', { roll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim272.log.luck_hit_unlucky', { roll, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) { _appendLog(d, `${SVG_SKULL} ${t('battlesim272.log.fallen')}`); _recordOutcome(d, 'loss'); }
  }
  d.pendingLuck = null;
  saveState();
  _renderAll();
}

function _skipLuck() {
  const d = _data();
  if (!d) return;
  d.pendingLuck = null;
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.stamina = d.enemy.staminaMax;
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.pendingLuck = null;
  if (d.log.length) _appendLog(d, t('battlesim272.log.reset_sep'));
  _appendLog(d, t('battlesim272.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Bundles of Herbs ─────────────────────────────────────────────────────────

function _eatProvisions() {
  const d = _data();
  if (!d || _notReady(d)) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim272.alert.provisions_midfight'));
    return;
  }
  if (d.player.provisionsLeft <= 0) return;
  if (d.player.stamina >= d.player.staminaInitial) {
    showAlert(t('battlesim272.alert.stamina_full'));
    return;
  }
  d.player.provisionsLeft--;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + PROVISIONS_HEAL);
  _appendLog(d, t('battlesim272.log.provisions', { before, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim272-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim272.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = `${SVG_SKULL} ${t('battlesim272.status.fallen')}`;
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = `${SVG_TROPHY} ${t('battlesim272.status.victory')}`;
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim272-round').disabled = over || !!d.pendingLuck;
  document.getElementById('sim272-luck-yes').disabled = notReady || !d.pendingLuck || d.player.luck <= 0;
  document.getElementById('sim272-luck-no').disabled  = notReady || !d.pendingLuck;
  document.getElementById('sim272-provisions').disabled =
    notReady || d.player.provisionsLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim272-history-summary');
  const listEl = document.getElementById('sim272-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim272.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim272.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim272.history.won') : t('battlesim272.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim272-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim272-player-skill').value      = d.player.skill;
  document.getElementById('sim272-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim272-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim272-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim272-player-luck').value       = d.player.luck;
  document.getElementById('sim272-player-luckmax').value    = d.player.luckInitial;

  const rollBtn = document.getElementById('sim272-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim272.btn.rolled') : t('battlesim272.btn.roll');

  document.getElementById('sim272-provisions-left').textContent = `${d.player.provisionsLeft}/${MAX_PROVISIONS}`;

  document.getElementById('sim272-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim272-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim272-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim272-enemy-staminamax').value = d.enemy.staminaMax;

  const pendingEl = document.getElementById('sim272-luck-prompt');
  pendingEl.style.display = d.pendingLuck ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim272() {
  const overlay = document.getElementById('sim272-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim272(); return; }
  _renderAll();
}

function openSim272() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim272-overlay').classList.add('active');
}

function closeSim272() {
  document.getElementById('sim272-overlay')?.classList.remove('active');
}

export function setSim272Visible(visible) {
  const btn = document.getElementById('sim272-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim272();
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
  const input    = document.getElementById('sim272-enemy-pick');
  const dropdown = document.getElementById('sim272-enemy-pick-dropdown');
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
      `<li role="option" id="sim272-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">SKILL:${e.attack ?? '?'} STAMINA:${e.hp ?? '?'}</span></li>`
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
    d.pendingLuck = null;
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

export function initSim272() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim272-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim272-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim272.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim272-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim272.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim272.ui.skill'), 'sim272-player-skill')}
            ${_numField(t('battlesim272.ui.skill_initial'), 'sim272-player-skillmax')}
            ${_numField(t('battlesim272.ui.stamina'), 'sim272-player-stamina')}
            ${_numField(t('battlesim272.ui.stamina_initial'), 'sim272-player-staminamax')}
            ${_numField(t('battlesim272.ui.luck'), 'sim272-player-luck')}
            ${_numField(t('battlesim272.ui.luck_initial'), 'sim272-player-luckmax')}
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim272.ui.provisions')}</span>
              <span id="sim272-provisions-left" class="bsim-ae-display"></span>
              <button id="sim272-provisions" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim272.btn.provisions_eat', { n: PROVISIONS_HEAL })}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim272.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim272.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim272-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim272-enemy-pick-dropdown">
                <ul id="sim272-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim272.ui.skill'), 'sim272-enemy-skill')}
            ${_numField(t('battlesim272.ui.stamina'), 'sim272-enemy-stamina')}
            ${_numField(t('battlesim272.ui.stamina_max'), 'sim272-enemy-staminamax')}
          </div>
          <div id="sim272-status" class="bsim-status"></div>
          <div id="sim272-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim272.btn.luck_prompt')}</span>
            <button id="sim272-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim272.btn.luck_yes')}</button>
            <button id="sim272-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim272.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim272-round" class="inv-add-btn bsim-action-primary">${t('battlesim272.btn.round')}</button>
            <button id="sim272-reset" class="inv-add-btn">${t('battlesim272.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim272-history-summary">${t('battlesim272.history.summary', { n: 0 })}</summary>
            <div id="sim272-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim272-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim272-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim272);
  document.getElementById('sim272-close').addEventListener('click', closeSim272);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim272(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim272-overlay'),
    open:  openSim272,
    close: closeSim272,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim272();
  });

  document.getElementById('sim272-round').addEventListener('click', _runRound);
  document.getElementById('sim272-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim272-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim272-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim272-provisions').addEventListener('click', _eatProvisions);

  document.getElementById('sim272-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim272.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim272-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim272-player-skill':      ['player', 'skill'],
    'sim272-player-skillmax':   ['player', 'skillInitial'],
    'sim272-player-stamina':    ['player', 'stamina'],
    'sim272-player-staminamax': ['player', 'staminaInitial'],
    'sim272-player-luck':       ['player', 'luck'],
    'sim272-player-luckmax':    ['player', 'luckInitial'],
    'sim272-enemy-skill':       ['enemy', 'skill'],
    'sim272-enemy-stamina':        ['enemy', 'stamina'],
    'sim272-enemy-staminamax':     ['enemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = Math.max(0, val);
    if (id === 'sim272-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim272-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim272-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim272-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim272-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim272-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim272-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim272-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim272-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim272-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete();
}
