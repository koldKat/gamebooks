// ── Battle Simulator (Майстори на меча, book 740) ───────────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 740 only) by the caller in boot.js via
// setSim740Visible().
// To remove: delete this file, remove its import line and initSim740()/
// setSim740Visible() calls from boot.js, remove 'sim740' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim740-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim740-btn selectors in
// battlesim.css.
//
// Companion volume to book 739 (same author/series/mechanics, different
// bracket): choose one of 4 playable fighters here - Воймир/Брис/Лия/Ясмин
// - each following a different bracket path (Кенои and Сокол, playable in
// book 739, appear here only as NPC opponents). Almost all "duels" in the
// book are pure narrative technique-choice trees with no dice; only 8
// sections across the whole book invoke the book's own formal "Проведи
// Схватка" (Conduct a Duel) dice mechanic, each with an explicit "Твоите
// жизнени точки са X, противниковите - Y, твоето Умение е по-голямо/
// по-малко с Z" stat line. This sim models exactly that mechanic - nothing
// else in the book is randomized (confirmed by reading all 340 sections;
// the only other die usage is standalone "Провери Късмета си" luck checks
// outside of Схватка, handled narratively by the book itself, not modeled
// here).
//
// Схватка rules (identical to book 739's own ПРАВИЛА section II): each
// round, both sides "pick" (roll) a number 1-6. Take (yourRoll -
// enemyRoll), then add your Skill difference vs the enemy (positive if
// your Skill is higher, negative if lower) with its own sign. If the
// result is positive, the enemy loses that many life points. If negative,
// you lose that many (absolute value). If zero, nothing happens and the
// round repeats. Combat ends when either side's life points reach 0.
//
// book_enemies.attack holds the player's Skill delta vs that specific named
// duel (positive = player better skilled, negative = worse, 0 = equal),
// .hp holds the enemy's life points for that duel, .defense unused (0). 8
// rows, one per formal Проведи Схватка instance found in the book (§9,
// §26, §74, §122, §165, §189, §281, §300) - each entry's name records which
// playable character's path it belongs to and the skill delta, since the
// same opponent name (e.g. Джадаг, Сокол) recurs with different stats in
// different bracket rounds.
//
// All state lives in pt.sim740, per-user/per-book via currentPlaythrough().

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
  if (!pt.sim740) {
    pt.sim740 = {
      player: { life: 0, lifeInitial: 0, skillDelta: 0 },
      enemy: { name: '', life: 0, lifeMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim740;
  if (!d.player) d.player = { life: 0, lifeInitial: 0, skillDelta: 0 };
  if (d.player.skillDelta === undefined) d.player.skillDelta = 0;
  if (!d.enemy) d.enemy = { name: '', life: 0, lifeMax: 0 };
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _notReady(d) { return d.player.lifeInitial <= 0; }

function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerLife: d.player.life, playerLifeMax: d.player.lifeInitial,
    ts: Date.now(),
  });
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _runRound() {
  const d = _data();
  if (!d || _notReady(d) || d.player.life <= 0 || d.enemy.life <= 0) return;
  d.roundsThisBattle++;

  const myRoll = _roll1d6();
  const theirRoll = _roll1d6();
  const result = (myRoll - theirRoll) + (d.player.skillDelta || 0);
  _appendLog(d, t('battlesim740.log.round', { round: d.roundsThisBattle, myRoll, theirRoll, result }));

  if (result === 0) {
    _appendLog(d, t('battlesim740.log.tie'));
  } else if (result > 0) {
    d.enemy.life = Math.max(0, d.enemy.life - result);
    _appendLog(d, t('battlesim740.log.you_wound', { enemy: _enemyNameSafe(d), n: result, life: d.enemy.life, lifeMax: d.enemy.lifeMax }));
  } else {
    const n = Math.abs(result);
    d.player.life = Math.max(0, d.player.life - n);
    _appendLog(d, t('battlesim740.log.enemy_wounds', { enemy: _enemyNameSafe(d), n, life: d.player.life, lifeMax: d.player.lifeInitial }));
  }

  if (d.enemy.life <= 0) {
    _appendLog(d, t('battlesim740.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.life <= 0) {
    _appendLog(d, t('battlesim740.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.life = d.enemy.lifeMax;
  d.player.life = d.player.lifeInitial;
  d.roundsThisBattle = 0;
  if (d.log.length) _appendLog(d, t('battlesim740.log.reset_sep'));
  _appendLog(d, t('battlesim740.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim740-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.lifeMax > 0;
  if (notReady)                                  el.innerHTML = t('battlesim740.status.not_ready');
  else if (d.player.life <= 0)                    el.innerHTML = t('battlesim740.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.life <= 0)          el.innerHTML = t('battlesim740.status.victory', { trophy: SVG_TROPHY });
  else                                             el.innerHTML = '';
  const over = notReady || d.player.life <= 0 || (hasEnemy && d.enemy.life <= 0);
  document.getElementById('sim740-round').disabled = over;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim740-history-summary');
  const listEl = document.getElementById('sim740-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim740.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim740.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim740.history.won') : t('battlesim740.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${h.playerLife}/${h.playerLifeMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim740-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim740-player-life').value      = Math.min(d.player.life, d.player.lifeInitial);
  document.getElementById('sim740-player-lifemax').value   = d.player.lifeInitial;
  document.getElementById('sim740-player-skilldelta').value = d.player.skillDelta;

  document.getElementById('sim740-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim740-enemy-life').value    = Math.min(d.enemy.life, d.enemy.lifeMax);
  document.getElementById('sim740-enemy-lifemax').value = d.enemy.lifeMax;

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim740() {
  const overlay = document.getElementById('sim740-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim740(); return; }
  _renderAll();
}

function openSim740() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim740-overlay').classList.add('active');
}

function closeSim740() {
  document.getElementById('sim740-overlay')?.classList.remove('active');
}

export function setSim740Visible(visible) {
  const btn = document.getElementById('sim740-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim740();
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">Умение:${e.attack > 0 ? '+' + e.attack : e.attack} ЖТ:${e.hp ?? '?'}</span></li>`
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

export function initSim740() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim740-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim740.ui.title')}</span>
        <button id="sim740-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim740.ui.you')}</div>
            ${_numField(t('battlesim740.ui.life'), 'sim740-player-life')}
            ${_numField(t('battlesim740.ui.life_initial'), 'sim740-player-lifemax')}
            ${_numField(t('battlesim740.ui.skill_delta'), 'sim740-player-skilldelta')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim740.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim740.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim740-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim740-enemy-pick-dropdown">
                <ul id="sim740-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim740.ui.life'), 'sim740-enemy-life')}
            ${_numField(t('battlesim740.ui.life_max'), 'sim740-enemy-lifemax')}
          </div>
          <div id="sim740-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim740-round" class="inv-add-btn bsim-action-primary">${t('battlesim740.btn.round')}</button>
            <button id="sim740-reset" class="inv-add-btn">${t('battlesim740.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim740-history-summary">${t('battlesim740.history.summary', { n: 0 })}</summary>
            <div id="sim740-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim740-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim740-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim740);
  document.getElementById('sim740-close').addEventListener('click', closeSim740);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim740(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim740-overlay'),
    open:  openSim740,
    close: closeSim740,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim740();
  });

  document.getElementById('sim740-round').addEventListener('click', _runRound);
  document.getElementById('sim740-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim740-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  const FIELD_MAP = {
    'sim740-player-life':       ['player', 'life'],
    'sim740-player-lifemax':    ['player', 'lifeInitial'],
    'sim740-player-skilldelta': ['player', 'skillDelta'],
    'sim740-enemy-life':        ['enemy', 'life'],
    'sim740-enemy-lifemax':     ['enemy', 'lifeMax'],
  };
  const NEGATIVE_ALLOWED = new Set(['sim740-player-skilldelta']);
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = NEGATIVE_ALLOWED.has(id) ? Number(val) : Math.max(0, val);
    if (id === 'sim740-player-life') val = Math.min(val, d.player.lifeInitial);
    if (id === 'sim740-enemy-life') val = Math.min(val, d.enemy.lifeMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim740-player-lifemax') d.player.life = Math.min(d.player.life, val);
    if (id === 'sim740-enemy-lifemax') d.enemy.life = Math.min(d.enemy.life, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim740-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = NEGATIVE_ALLOWED.has(input.id);
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim740-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = NEGATIVE_ALLOWED.has(btnEl.dataset.id);
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim740-enemy-pick', 'sim740-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.player.skillDelta = enemy.attack;
    if (enemy.hp != null)     { d.enemy.life = enemy.hp; d.enemy.lifeMax = enemy.hp; }
    d.roundsThisBattle = 0;
    saveState();
    _renderAll();
  });
}
