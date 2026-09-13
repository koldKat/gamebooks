// ── Battle Simulator (Арена 3, book 716) ────────────────────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 716 only) by the caller in boot.js via
// setSim716Visible().
// To remove: delete this file, remove its import line and initSim716()/
// setSim716Visible() calls from boot.js, remove 'sim716' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// Book 716 has DOZENS of unique per-episode combat formulas (each fight's
// text spells out its own stat combination and threshold), which would be
// impractical to model one-by-one. Instead this implements the book's OWN
// built-in generic "classic bojna sistema" (episode 50 - explicitly offered
// as the simplified alternative for players who don't want to work through
// every special-case formula):
//   ATAKA = SILA + (BARZINA or LOVKOST, player's choice)
//   ZASHTITA = REFLEKS + (whichever of BARZINA/LOVKOST wasn't used above)
//   Each side lands as many hits per round as its BOJNO MAJSTORSTVO; a hit's
//   damage is (attacker's ATAKA + 1d6) - defender's ZASHTITA, floored at 0,
//   subtracted from the defender's IZDRZHLIVOST.
//   If the enemy's starting IZDRZHLIVOST is exactly 10, the fight is
//   "do parva krav" (non-lethal) - the book has the loser recover half their
//   lost points afterward instead of dying.
// The book's own strict phrasing alternates attacker/defender role each
// round (one side always defends while the other attacks); this sim
// resolves both sides' hits within the same round instead, for a faster
// convenience tool - a deliberate simplification, consistent with "sim is
// convenience, not enforcement" (it hands you the arithmetic, you already
// decided the tactics via the book's branching text).
//
// Roster seeded into book_enemies (attack=ATAKA, defense=ZASHTITA,
// pb=BOJNO MAJSTORSTVO, hp=IZDRZHLIVOST), all read straight from the book's
// own stat blocks: Докер (16/6/1/10, non-lethal), Бързака (formula-derived
// from the player's own БЪРЗИНА/РЕФЛЕКС per §29 - seeded with the book's
// face-value 18/12 as a starting point, edit after picking your stats),
// Горилчо (20/6/1/10, non-lethal), Ю Чан and Ю Чен (8/12/4/20 each), Густав
// Хамър (20/8/2/36). The climactic final battle against Юмо Унищожителя
// (§256-288) is NOT covered - the book gives it no symmetric fixed-stat
// block at all, it's pure asymmetric branching against fixed thresholds
// (same structural pattern as book 714/715's non-sim-applicable verdict),
// so there is nothing here for a stat-vs-stat simulator to resolve.
//
// All state lives in pt.sim716, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _roll() { return 1 + Math.floor(Math.random() * 6); }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim716) {
    pt.sim716 = {
      player: {
        sila: 8, barzina: 8, lovkost: 8, reflekt: 4, bm: 2,
        atakaStat: 'barzina',
        izdr: 36, izdrMax: 36,
      },
      enemy: { name: '', ataka: 0, zashtita: 0, bm: 1, izdr: 10, izdrMax: 10, nonlethal: true },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim716;
  if (!d.player) d.player = { sila: 8, barzina: 8, lovkost: 8, reflekt: 4, bm: 2, atakaStat: 'barzina', izdr: 36, izdrMax: 36 };
  if (!d.enemy) d.enemy = { name: '', ataka: 0, zashtita: 0, bm: 1, izdr: 10, izdrMax: 10, nonlethal: true };
  if (d.enemy.nonlethal === undefined) d.enemy.nonlethal = d.enemy.izdrMax <= 10;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _playerAtaka(d)    { return d.player.sila + (d.player.atakaStat === 'barzina' ? d.player.barzina : d.player.lovkost); }
function _playerZashtita(d) { return d.player.reflekt + (d.player.atakaStat === 'barzina' ? d.player.lovkost : d.player.barzina); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
}

function _ready(d) { return !!d && d.enemy.name.trim() !== '' && d.player.izdr > 0 && d.enemy.izdr > 0; }

function _runRound() {
  const d = _data();
  if (!d || !_ready(d)) return;
  d.roundsThisBattle++;

  const pAtaka = _playerAtaka(d);
  const pZashtita = _playerZashtita(d);

  for (let i = 0; i < Math.max(1, d.player.bm); i++) {
    if (d.enemy.izdr <= 0) break;
    const roll = _roll();
    const dmg = Math.max(0, (pAtaka + roll) - d.enemy.zashtita);
    if (dmg > 0) d.enemy.izdr = Math.max(0, d.enemy.izdr - dmg);
    _appendLog(d, t('battlesim716.log.player_hit', { roll, total: pAtaka + roll, zashtita: d.enemy.zashtita, dmg, enemy: _enemyNameSafe(d), izdr: d.enemy.izdr }));
  }
  for (let i = 0; i < Math.max(1, d.enemy.bm); i++) {
    if (d.player.izdr <= 0 || d.enemy.izdr <= 0) break;
    const roll = _roll();
    const dmg = Math.max(0, (d.enemy.ataka + roll) - pZashtita);
    if (dmg > 0) d.player.izdr = Math.max(0, d.player.izdr - dmg);
    _appendLog(d, t('battlesim716.log.enemy_hit', { enemy: _enemyNameSafe(d), roll, total: d.enemy.ataka + roll, zashtita: pZashtita, dmg, izdr: d.player.izdr }));
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

// Per the book's own rule (episode 50): in a non-lethal "do parva krav"
// fight (enemy started with exactly 10 IZDRZHLIVOST), the PLAYER always
// recovers half of THEIR OWN lost points after the battle, win or lose -
// this isn't a consolation prize for the loser, both outcomes heal the
// player the same way since neither side actually dies.
function _checkBattleEnd(d) {
  if (d.enemy.izdr <= 0) {
    if (d.enemy.nonlethal) {
      const recover = Math.floor((d.player.izdrMax - d.player.izdr) / 2);
      d.player.izdr = Math.min(d.player.izdrMax, d.player.izdr + recover);
      _appendLog(d, t('battlesim716.log.defeated_nonlethal', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d), recover }));
    } else {
      _appendLog(d, t('battlesim716.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    }
    _recordOutcome(d, 'win');
  } else if (d.player.izdr <= 0) {
    if (d.enemy.nonlethal) {
      const recover = Math.floor((d.player.izdrMax - d.player.izdr) / 2);
      d.player.izdr = Math.min(d.player.izdrMax, d.player.izdr + recover);
      _appendLog(d, t('battlesim716.log.fallen_nonlethal', { skull: SVG_SKULL, recover }));
    } else {
      _appendLog(d, t('battlesim716.log.fallen', { skull: SVG_SKULL }));
    }
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.izdr = d.enemy.izdrMax;
  d.player.izdr = d.player.izdrMax;
  if (d.log.length) _appendLog(d, t('battlesim716.log.reset_sep'));
  _appendLog(d, t('battlesim716.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">А:${e.attack ?? '?'} З:${e.defense ?? '?'} ПБ:${e.pb ?? '?'} ИЗ:${e.hp ?? '?'}</span></li>`
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

function _renderInputs(skipEnemyPick) {
  const d = _data();
  if (!d) return;
  _setVal('sim716-p-sila', d.player.sila);
  _setVal('sim716-p-barzina', d.player.barzina);
  _setVal('sim716-p-lovkost', d.player.lovkost);
  _setVal('sim716-p-reflekt', d.player.reflekt);
  _setVal('sim716-p-bm', d.player.bm);
  _setVal('sim716-p-izdr', d.player.izdr);
  _setVal('sim716-p-izdrmax', d.player.izdrMax);
  const atakaSel = document.getElementById('sim716-p-atakastat');
  if (atakaSel) atakaSel.value = d.player.atakaStat;
  document.getElementById('sim716-p-ataka').textContent = String(_playerAtaka(d));
  document.getElementById('sim716-p-zashtita').textContent = String(_playerZashtita(d));

  if (!skipEnemyPick) _setVal('sim716-enemy-pick', d.enemy.name);
  _setVal('sim716-enemy-ataka', d.enemy.ataka);
  _setVal('sim716-enemy-zashtita', d.enemy.zashtita);
  _setVal('sim716-enemy-bm', d.enemy.bm);
  _setVal('sim716-enemy-izdr', d.enemy.izdr);
  _setVal('sim716-enemy-izdrmax', d.enemy.izdrMax);
  const nlChk = document.getElementById('sim716-enemy-nonlethal');
  if (nlChk) nlChk.checked = !!d.enemy.nonlethal;

  const status = document.getElementById('sim716-status');
  if (!_ready(d)) {
    status.textContent = t('battlesim716.status.not_ready');
  } else if (d.player.izdr <= 0) {
    status.textContent = t('battlesim716.status.fallen');
  } else if (d.enemy.izdr <= 0) {
    status.textContent = t('battlesim716.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim716-round').disabled = !_ready(d) || d.player.izdr <= 0 || d.enemy.izdr <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim716-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim716-history-summary');
  const listEl = document.getElementById('sim716-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim716.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim716.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim716.history.won') : t('battlesim716.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim716() {
  const overlay = document.getElementById('sim716-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim716(); return; }
  _renderAll();
}

function openSim716() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim716-overlay').classList.add('active');
}

function closeSim716() {
  document.getElementById('sim716-overlay')?.classList.remove('active');
}

export function setSim716Visible(visible) {
  const btn = document.getElementById('sim716-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim716();
}

// ── Init ──────────────────────────────────────────────────────────────────────

function _numField(label, id, width, readonly) {
  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <div class="inv-qty-wrap">
        ${readonly ? '' : `<button class="inv-qty-btn" data-id="${id}" data-delta="-1">−</button>`}
        <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric"${readonly ? ' readonly' : ''}${width ? ` style="width:${width}"` : ''}>
        ${readonly ? '' : `<button class="inv-qty-btn" data-id="${id}" data-delta="1">+</button>`}
      </div>
    </div>`;
}

export function initSim716() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim716-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim716.ui.title')}</span>
        <button id="sim716-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim716.ui.player')}</span></div>
            ${_numField(t('battlesim716.ui.sila'), 'sim716-p-sila')}
            ${_numField(t('battlesim716.ui.barzina'), 'sim716-p-barzina')}
            ${_numField(t('battlesim716.ui.lovkost'), 'sim716-p-lovkost')}
            ${_numField(t('battlesim716.ui.reflekt'), 'sim716-p-reflekt')}
            ${_numField(t('battlesim716.ui.bm'), 'sim716-p-bm')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim716.ui.ataka_stat')}</span>
              <select id="sim716-p-atakastat" class="bsim-select">
                <option value="barzina">${t('battlesim716.ui.ataka_stat_barzina')}</option>
                <option value="lovkost">${t('battlesim716.ui.ataka_stat_lovkost')}</option>
              </select>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim716.ui.ataka')}</span>
              <span id="sim716-p-ataka"></span>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim716.ui.zashtita')}</span>
              <span id="sim716-p-zashtita"></span>
            </div>
            ${_numField(t('battlesim716.ui.izdr'), 'sim716-p-izdr')}
            ${_numField(t('battlesim716.ui.izdrmax'), 'sim716-p-izdrmax')}
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim716.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim716-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim716-enemy-pick-dropdown">
                <ul id="sim716-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim716.ui.enemy_ataka'), 'sim716-enemy-ataka')}
            ${_numField(t('battlesim716.ui.enemy_zashtita'), 'sim716-enemy-zashtita')}
            ${_numField(t('battlesim716.ui.enemy_bm'), 'sim716-enemy-bm')}
            ${_numField(t('battlesim716.ui.enemy_izdr'), 'sim716-enemy-izdr')}
            ${_numField(t('battlesim716.ui.enemy_izdrmax'), 'sim716-enemy-izdrmax')}
            <div class="inv-edit-row">
              <label class="inv-edit-label bsim-stat-label"><input type="checkbox" id="sim716-enemy-nonlethal"> ${t('battlesim716.ui.nonlethal')}</label>
            </div>
          </div>
          <div id="sim716-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim716-round" class="inv-add-btn bsim-action-primary">${t('battlesim716.btn.round')}</button>
            <button id="sim716-reset" class="inv-add-btn">${t('battlesim716.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim716-history-summary">${t('battlesim716.history.summary', { n: 0 })}</summary>
            <div id="sim716-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim716-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim716-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim716);
  document.getElementById('sim716-close').addEventListener('click', closeSim716);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim716(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim716-overlay'),
    open:  openSim716,
    close: closeSim716,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim716();
  });

  document.getElementById('sim716-round').addEventListener('click', _runRound);
  document.getElementById('sim716-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim716-p-atakastat').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.atakaStat = e.target.value === 'lovkost' ? 'lovkost' : 'barzina';
    saveState();
    _renderInputs(true);
  });

  document.getElementById('sim716-enemy-nonlethal').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.enemy.nonlethal = e.target.checked;
    saveState();
  });

  document.getElementById('sim716-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim716-enemy-pick', 'sim716-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name       = enemy.name;
    d.enemy.ataka      = enemy.attack ?? 0;
    d.enemy.zashtita   = enemy.defense ?? 0;
    d.enemy.bm         = enemy.pb ?? 1;
    d.enemy.izdr       = enemy.hp ?? 10;
    d.enemy.izdrMax    = enemy.hp ?? 10;
    d.enemy.nonlethal  = (enemy.hp ?? 10) <= 10;
    d.roundsThisBattle = 0;
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim716-p-sila': ['player', 'sila'], 'sim716-p-barzina': ['player', 'barzina'],
    'sim716-p-lovkost': ['player', 'lovkost'], 'sim716-p-reflekt': ['player', 'reflekt'],
    'sim716-p-bm': ['player', 'bm'], 'sim716-p-izdr': ['player', 'izdr'], 'sim716-p-izdrmax': ['player', 'izdrMax'],
    'sim716-enemy-ataka': ['enemy', 'ataka'], 'sim716-enemy-zashtita': ['enemy', 'zashtita'],
    'sim716-enemy-bm': ['enemy', 'bm'], 'sim716-enemy-izdr': ['enemy', 'izdr'], 'sim716-enemy-izdrmax': ['enemy', 'izdrMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = Math.max(0, parseInt(input.value, 10) || 0);
      d[path[0]][path[1]] = val;
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
