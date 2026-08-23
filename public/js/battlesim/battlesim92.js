// ── Battle Simulator (Замъкът на таласъмите / Castle of the Goblins, book 92) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 92 only) by the caller in boot.js via
// setSim92Visible().
// To remove: delete this file, remove its import line and initSim92()/
// setSim92Visible() calls from boot.js, remove 'sim92' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// Table-driven combat, not formula-driven like the other chitanka.info-family
// sims. STRENGTH = pick + 10, LIFE = pick + 20 (both rolled once at battle
// start). d.ratio = playerStrength - enemyStrength is computed once when an
// enemy is selected and stays fixed for the whole fight. Each round, pick
// 1-12, attackLevel = ratio + pick (clamped to the table's -12..+12 range),
// and COMBAT_TABLE[attackLevel] gives BOTH sides' life loss simultaneously -
// this is not "loser takes damage", both sides always lose some amount
// (occasionally 0, occasionally instant death at the two extremes). Table
// verified against the book's own worked example (ratio -5, pick 4, level
// -1 -> enemy loses 8, player loses 4) and against the printed table's
// rendered PDF pages.
//
// book_enemies.attack holds STRENGTH, .hp holds LIFE, .defense unused - same
// convention as the other single-stat-pair Bulgarian sims. 18 combat
// encounters across the book's 375 sections, every entry disambiguated with
// its section number. §199's three-headed dragon (Първа/Втора/Трета глава)
// and §32's six identical dwarves (Джудже) are multi-stage/multi-count
// encounters fought as separate consecutive picks, not a bespoke group mode.
// §324 (Тиквеняк) and §374 (Тиквеняк Първи) are the same final boss reached
// via two different branches, both winning to §375 - kept as two rows since
// they are reached from different sections.
//
// All state lives in pt.sim92, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Ниво на атаката -> { enemy: враг loses this much (or 'dead'), player: играч loses this much (or 'dead') }
const COMBAT_TABLE = {
  '-12': { enemy: 0,   player: 'dead' },
  '-11': { enemy: 0,   player: 'dead' },
  '-10': { enemy: 0,   player: -9 },
  '-9':  { enemy: 0,   player: -8 },
  '-8':  { enemy: -1,  player: -7 },
  '-7':  { enemy: -2,  player: -7 },
  '-6':  { enemy: -3,  player: -6 },
  '-5':  { enemy: -4,  player: -6 },
  '-4':  { enemy: -5,  player: -5 },
  '-3':  { enemy: -6,  player: -5 },
  '-2':  { enemy: -7,  player: -4 },
  '-1':  { enemy: -8,  player: -4 },
  '0':   { enemy: -9,  player: -3 },
  '1':   { enemy: -10, player: -3 },
  '2':   { enemy: -11, player: -3 },
  '3':   { enemy: -12, player: -2 },
  '4':   { enemy: -13, player: -2 },
  '5':   { enemy: -14, player: -2 },
  '6':   { enemy: -15, player: -1 },
  '7':   { enemy: -16, player: -1 },
  '8':   { enemy: -17, player: -1 },
  '9':   { enemy: -18, player: 0 },
  '10':  { enemy: 'dead', player: 0 },
  '11':  { enemy: 'dead', player: 0 },
  '12':  { enemy: 'dead', player: 0 },
};

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim92) {
    pt.sim92 = {
      strength: 0, strengthInitial: 0,
      life: 0, lifeInitial: 0,
      rolled: false,
      ratio: 0,
      enemy: { name: '', strength: 0, life: 0, lifeMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim92;
  if (d.strength === undefined) d.strength = 0;
  if (d.strengthInitial === undefined) d.strengthInitial = 0;
  if (d.life === undefined) d.life = 0;
  if (d.lifeInitial === undefined) d.lifeInitial = 0;
  if (d.rolled === undefined) d.rolled = false;
  if (d.ratio === undefined) d.ratio = 0;
  if (!d.enemy) d.enemy = { name: '', strength: 0, life: 0, lifeMax: 0 };
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _pick() { return 1 + Math.floor(Math.random() * 12); } // random-number table, 1-12

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || 'врагът'; }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
}

function _runRound() {
  const d = _data();
  if (!d || !d.rolled || d.life <= 0 || d.enemy.life <= 0) return;
  d.roundsThisBattle++;

  const pick = _pick();
  const level = Math.max(-12, Math.min(12, d.ratio + pick));
  const row = COMBAT_TABLE[String(level)];
  _appendLog(d, t('battlesim92.log.round', { round: d.roundsThisBattle, pick, ratio: d.ratio, level }));

  if (row.enemy === 'dead') {
    d.enemy.life = 0;
  } else {
    d.enemy.life = Math.max(0, d.enemy.life + row.enemy);
  }
  if (row.player === 'dead') {
    d.life = 0;
  } else {
    d.life = Math.max(0, d.life + row.player);
  }
  _appendLog(d, t('battlesim92.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: row.enemy === 'dead' ? t('battlesim92.log.dead_word') : Math.abs(row.enemy),
    enemyLife: d.enemy.life, enemyLifeMax: d.enemy.lifeMax,
    playerLoss: row.player === 'dead' ? t('battlesim92.log.dead_word') : Math.abs(row.player),
    life: d.life, lifeMax: d.lifeInitial,
  }));

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  if (d.enemy.life <= 0) {
    _appendLog(d, t('battlesim92.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.life <= 0) {
    _appendLog(d, t('battlesim92.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.life = d.enemy.lifeMax;
  d.life = d.lifeInitial;
  if (d.log.length) _appendLog(d, t('battlesim92.log.reset_sep'));
  _appendLog(d, t('battlesim92.log.reset', { enemy: _enemyNameSafe(d) }));
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

function _renderInputs(skipEnemyPick) {
  const d = _data();
  if (!d) return;
  _setVal('sim92-strength', d.strength);
  _setVal('sim92-strengthmax', d.strengthInitial);
  _setVal('sim92-life', d.life);
  _setVal('sim92-lifemax', d.lifeInitial);
  _setVal('sim92-enemy-strength', d.enemy.strength);
  _setVal('sim92-enemy-life', d.enemy.life);
  _setVal('sim92-enemy-lifemax', d.enemy.lifeMax);
  _setVal('sim92-ratio', d.ratio);
  if (!skipEnemyPick) _setVal('sim92-enemy-pick', d.enemy.name);

  const status = document.getElementById('sim92-status');
  if (!d.rolled) {
    status.textContent = t('battlesim92.status.not_ready');
  } else if (d.life <= 0) {
    status.textContent = t('battlesim92.status.fallen');
  } else if (d.enemy.life <= 0 && d.enemy.lifeMax > 0) {
    status.textContent = t('battlesim92.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim92-round').disabled = !d.rolled || d.life <= 0 || d.enemy.life <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim92-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim92-history-summary');
  const listEl = document.getElementById('sim92-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim92.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim92.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim92.history.won') : t('battlesim92.history.lost');
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

export function renderSim92() {
  const overlay = document.getElementById('sim92-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim92(); return; }
  _renderAll();
}

function openSim92() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim92-overlay').classList.add('active');
}

function closeSim92() {
  document.getElementById('sim92-overlay')?.classList.remove('active');
}

export function setSim92Visible(visible) {
  const btn = document.getElementById('sim92-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim92();
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

export function initSim92() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim92-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim92.ui.title')}</span>
        <button id="sim92-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim92-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim92.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim92.ui.strength'), 'sim92-strength')}
            ${_numField(t('battlesim92.ui.strength_initial'), 'sim92-strengthmax')}
            ${_numField(t('battlesim92.ui.life'), 'sim92-life')}
            ${_numField(t('battlesim92.ui.life_initial'), 'sim92-lifemax')}
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim92.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim92-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim92-enemy-pick-dropdown">
                <ul id="sim92-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim92.ui.enemy_strength'), 'sim92-enemy-strength')}
            ${_numField(t('battlesim92.ui.enemy_life'), 'sim92-enemy-life')}
            ${_numField(t('battlesim92.ui.enemy_life_max'), 'sim92-enemy-lifemax')}
            ${_numField(t('battlesim92.ui.ratio'), 'sim92-ratio', null, true)}
          </div>
          <div id="sim92-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim92-round" class="inv-add-btn bsim-action-primary">${t('battlesim92.btn.round')}</button>
            <button id="sim92-reset" class="inv-add-btn">${t('battlesim92.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim92-history-summary">${t('battlesim92.history.summary', { n: 0 })}</summary>
            <div id="sim92-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim92-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim92-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim92);
  document.getElementById('sim92-close').addEventListener('click', closeSim92);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim92(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim92-overlay'),
    open:  openSim92,
    close: closeSim92,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim92();
  });

  document.getElementById('sim92-round').addEventListener('click', _runRound);
  document.getElementById('sim92-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim92-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.strengthInitial = _pick() + 10;
    d.lifeInitial      = _pick() + 20;
    d.strength = d.strengthInitial;
    d.life     = d.lifeInitial;
    d.rolled   = true;
    d.ratio    = d.strength - d.enemy.strength;
    _appendLog(d, t('battlesim92.log.rolled'));
    saveState();
    _renderAll();
  });

  document.getElementById('sim92-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim92-enemy-pick', 'sim92-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name          = enemy.name;
    d.enemy.strength       = enemy.attack ?? 0;
    d.enemy.life           = enemy.hp ?? 0;
    d.enemy.lifeMax        = enemy.hp ?? 0;
    d.roundsThisBattle     = 0;
    d.ratio                = d.strength - d.enemy.strength;
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim92-strength': ['strength'], 'sim92-strengthmax': ['strengthInitial'],
    'sim92-life': ['life'], 'sim92-lifemax': ['lifeInitial'],
    'sim92-enemy-strength': ['enemy', 'strength'], 'sim92-enemy-life': ['enemy', 'life'], 'sim92-enemy-lifemax': ['enemy', 'lifeMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = parseInt(input.value, 10) || 0;
      if (path.length === 1) d[path[0]] = val;
      else d[path[0]][path[1]] = val;
      if (path[0] === 'strength' || (path[0] === 'enemy' && path[1] === 'strength')) d.ratio = d.strength - d.enemy.strength;
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
