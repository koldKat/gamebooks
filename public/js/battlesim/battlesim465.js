// ── Battle Simulator (Свръхразум / "Superintellect", book 465) ──
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 465 only) by the caller in boot.js via
// setSim465Visible().
// To remove: delete this file, remove its import line and initSim465()/
// setSim465Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with every other battlesimN.js, so only remove it if all of them are gone).
// Also remove 'sim465' from SIM_HISTORY_KEYS in server/db/xp.js, and remove
// 'sim465-overlay' from ALL_PANEL_OVERLAY_IDS in util.js and the #sim465-btn
// selectors in battlesim.css.
//
// This book's own combat system is NOT the SKILL/STAMINA/LUCK engine used by
// every other sim in this app (battlesim221.js and its clones) - it has no
// per-character skill stat at all. Per the book's own "ПРАВИЛА НА ИГРАТА"
// (rules text, see book_frontmatter): both sides simply roll 2d6 each round,
// whoever rolls higher lands one hit on the other (ties = no effect), and
// each enemy is described only by how many hits it takes to defeat it (its
// "УДАРА" count). The player's own health is not a per-fight stat either -
// it is the single "individual defensive field" (fixed at 50 hits for the
// entire game, no re-roll, no per-book starting range) that persists across
// every fight in the book, so the "player field" input here is meant to be
// hand-synced by the reader to whatever their current field total is in
// their own paper log, exactly like the enemyDefeatThreshold-style manual
// inputs in every other sim in this app.
//
// This is a genuinely different, much simpler mechanic than the FF-style
// engine, so this file is a fresh bespoke implementation rather than a clone
// of battlesim221.js - there is no skill/attackModifier/luck/pendingLuckQueue
// machinery here because none of it exists in this book.
//
// This book's own pre-existing book_sections rows (imported before this
// sweep reached it) were kept as-is rather than rebuilt from the raw PDF -
// unlike every other book handled this session, this one's reachability
// signature (259/261, 0 broken links) was healthy enough that a full rebuild
// wasn't warranted. Two genuine dropped-destination bugs were found and
// fixed by cross-referencing the raw PDF text directly against the stored
// html: §20 (both of its choices were entirely missing from the stored
// html/choices) and §44 (one of its two choices, the jet-escape branch to
// §189, was missing). A third apparent gap, §121, was extensively searched
// for (every "verb ending in на/-" line in the raw PDF followed by a bare
// destination number, every scene involving a robot/hypnotizer that could
// plausibly lead there) and never found referenced anywhere else in the
// book - it is accepted as a genuine benign single-section orphan, not
// corruption.
//
// A separate, more consequential bug was also found and fixed: 11 sections
// (12, 19, 58, 74, 76, 98, 107, 135, 176, 227, 245) had their enemy
// stat-block hit-thresholds (e.g. "ПЪРВИ КОРАБ - 5 УДАРА", meaning "first
// ship takes 5 hits to destroy") wrongly auto-linkified as if the "5" were
// a destination, i.e. stored as `<a href="#section-5">5</a> УДАРА`. Section
// 5 exists in the book (an unrelated Oracle/horoscope scene), so this didn't
// show up as a broken link or a reachability gap - it silently added a false
// edge to the graph and would have sent a reader who clicked it to the wrong
// section mid-combat-setup. Fixed by stripping the anchor from all 25
// instances and recomputing each section's `choices` column from what
// actually remains linked.
//
// All state lives in pt.sim465, per-user/per-book via currentPlaythrough().

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
  if (!pt.sim465) {
    pt.sim465 = {
      player: { field: 50, fieldInitial: 50, woundDamage: 1 },
      enemy: { name: '', woundDamage: 1, stamina: 0, staminaMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim465;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.woundDamage === undefined) d.player.woundDamage = 1;
  if (d.enemy.woundDamage === undefined) d.enemy.woundDamage = 1;
  return d;
}

function _roll2d6() { return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _enemyDefeated(d) { return d.enemy.staminaMax > 0 && d.enemy.stamina <= 0; }
function _hasEnemy(d) { return d.enemy.staminaMax > 0; }

function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerField: d.player.field, playerFieldMax: d.player.fieldInitial,
    ts: Date.now(),
  });
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _runRound() {
  const d = _data();
  if (!d || !_hasEnemy(d) || d.player.field <= 0 || _enemyDefeated(d)) return;
  d.roundsThisBattle++;

  const enemyWoundDmg  = Math.max(1, d.enemy.woundDamage || 1);
  const playerWoundDmg = Math.max(1, d.player.woundDamage || 1);

  const playerRoll = _roll2d6();
  const enemyRoll  = _roll2d6();
  _appendLog(d, t('battlesim465.log.round', { round: d.roundsThisBattle, playerRoll, enemy: _enemyNameSafe(d), enemyRoll }));

  if (playerRoll === enemyRoll) {
    _appendLog(d, t('battlesim465.log.both_avoided'));
  } else if (playerRoll > enemyRoll) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - playerWoundDmg);
    _appendLog(d, t('battlesim465.log.you_wound', { enemy: _enemyNameSafe(d), n: playerWoundDmg, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
  } else {
    d.player.field = Math.max(0, d.player.field - enemyWoundDmg);
    _appendLog(d, t('battlesim465.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: enemyWoundDmg, field: d.player.field, fieldMax: d.player.fieldInitial }));
  }

  if (_enemyDefeated(d)) {
    _appendLog(d, t('battlesim465.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.field <= 0) {
    _appendLog(d, t('battlesim465.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.stamina = d.enemy.staminaMax;
  d.roundsThisBattle = 0;
  if (d.log.length) _appendLog(d, t('battlesim465.log.reset_sep'));
  _appendLog(d, t('battlesim465.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim465-status');
  if (!d || !el) return;
  const hasEnemy = _hasEnemy(d);
  if (d.player.field <= 0)                el.innerHTML = t('battlesim465.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && _enemyDefeated(d)) el.innerHTML = t('battlesim465.status.victory', { trophy: SVG_TROPHY });
  else                                    el.innerHTML = '';
  const over = !hasEnemy || d.player.field <= 0 || _enemyDefeated(d);
  document.getElementById('sim465-round').disabled = over;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim465-history-summary');
  const listEl = document.getElementById('sim465-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim465.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim465.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim465.history.won') : t('battlesim465.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim465.ui.field')} ${h.playerField}/${h.playerFieldMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim465-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim465-player-field').value    = Math.min(d.player.field, d.player.fieldInitial);
  document.getElementById('sim465-player-fieldmax').value = d.player.fieldInitial;
  document.getElementById('sim465-player-wounddmg').value = d.player.woundDamage;

  document.getElementById('sim465-enemy-pick').value       = d.enemy.name;
  document.getElementById('sim465-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim465-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim465-enemy-wounddmg').value   = d.enemy.woundDamage;

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim465() {
  const overlay = document.getElementById('sim465-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim465(); return; }
  _renderAll();
}

function openSim465() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim465-overlay').classList.add('active');
}

function closeSim465() {
  document.getElementById('sim465-overlay')?.classList.remove('active');
}

export function setSim465Visible(visible) {
  const btn = document.getElementById('sim465-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim465();
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim465.ui.hits_abbrev')}:${e.hp ?? '?'}</span></li>`
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

export function initSim465() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim465-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim465-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim465.ui.you')}</div>
            ${_numField(t('battlesim465.ui.field'), 'sim465-player-field')}
            ${_numField(t('battlesim465.ui.field_initial'), 'sim465-player-fieldmax')}
            ${_numField(t('battlesim465.ui.player_wound_dmg'), 'sim465-player-wounddmg')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim465.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim465.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim465-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim465-enemy-pick-dropdown">
                <ul id="sim465-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim465.ui.stamina'), 'sim465-enemy-stamina')}
            ${_numField(t('battlesim465.ui.stamina_max'), 'sim465-enemy-staminamax')}
            ${_numField(t('battlesim465.ui.wound_dmg'), 'sim465-enemy-wounddmg')}
          </div>
          <div id="sim465-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim465-round" class="inv-add-btn bsim-action-primary">${t('battlesim465.btn.round')}</button>
            <button id="sim465-reset" class="inv-add-btn">${t('battlesim465.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim465-history-summary">${t('battlesim465.history.summary', { n: 0 })}</summary>
            <div id="sim465-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim465-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim465-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim465);
  document.getElementById('sim465-close').addEventListener('click', closeSim465);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim465(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim465-overlay'),
    open:  openSim465,
    close: closeSim465,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim465();
  });

  document.getElementById('sim465-round').addEventListener('click', _runRound);
  document.getElementById('sim465-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim465-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim465-player-field':      ['player', 'field'],
    'sim465-player-fieldmax':   ['player', 'fieldInitial'],
    'sim465-player-wounddmg':   ['player', 'woundDamage'],
    'sim465-enemy-stamina':     ['enemy', 'stamina'],
    'sim465-enemy-staminamax':  ['enemy', 'staminaMax'],
    'sim465-enemy-wounddmg':    ['enemy', 'woundDamage'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = Math.max(0, val);
    if (id === 'sim465-player-field') val = Math.min(val, d.player.fieldInitial);
    if (id === 'sim465-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim465-player-fieldmax') d.player.field = Math.min(d.player.field, val);
    if (id === 'sim465-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim465-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim465-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const next = Math.max(0, Number(input.value) || 0) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim465-enemy-pick', 'sim465-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name = enemy.name;
    if (enemy.hp != null) { d.enemy.stamina = enemy.hp; d.enemy.staminaMax = enemy.hp; }
    d.roundsThisBattle = 0;
    saveState();
    _renderAll();
  });
}
