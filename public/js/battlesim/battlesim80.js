// ── Battle Simulator (Бойците на Орм / The Fighters of Orm, book 80) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 80 only) by the caller in boot.js via
// setSim80Visible().
// To remove: delete this file, remove its import line and initSim80()/
// setSim80Visible() calls from boot.js, remove 'sim80' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// A single clean system ("Стандартна схватка"), unlike book 122's three
// switchable systems - every one of the 117 fight-referencing sections in
// this book cites it, and the handful that don't are just narrative
// aftermath text reusing the word "схватка", not alternate mechanics.
//
// Each round:
// 1. Order: both sides roll 1d6, add it to their own Интерактивен статус.
//    Whoever's total is higher strikes first; if the gap is 3 or more, that
//    side gets two consecutive strikes before the other gets to hit back.
//    A tied order roll is resolved as player-first with no double strike -
//    the book's own text doesn't cover ties, so this is a judgment call.
// 2. Each strike: attacker's Офанзивен статус + a fresh 1d6, minus the
//    defender's Дефанзивен статус, floored at 0, subtracted from the
//    defender's Живот.
// 3. Repeat rounds until either side's Живот reaches 0.
//
// This is a closed, 5-fighter tournament cast (you play one, the other 4
// are your possible opponents) rather than a growing roster read section by
// section - book_enemies holds their starting stats straight from the
// book's own introduction. Both the player's own stats and the currently
// selected opponent's stats are plain editable fields (no chargen dice):
// this book lets you spend prize money between fights to permanently raise
// Офанзивен/Дефанзивен/Интерактивен/Живот, so both sides' numbers are
// expected to grow over the course of a playthrough and are entered/adjusted
// by hand, same free-form-entry precedent as every other sim in this app.
//
// book_enemies.attack holds Офанзивен статус, .hp holds Живот, .defense
// holds Дефанзивен статус, .pb (otherwise-unused "personal best"-style 4th
// numeric column, same repurposing precedent as battlesim829.js) holds
// Интерактивен статус.
//
// All state lives in pt.sim80, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=1462';
import { showAlert } from '../confirm.js?v=1462';
import { getPlayBtnRow } from '../charsheet.js?v=1462';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=1462';
import { t } from '../i18n.js?v=1462';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim80) {
    pt.sim80 = {
      offensive: 0, defensive: 0, interactive: 0,
      life: 20, lifeInitial: 20,
      enemy: { name: '', offensive: 0, defensive: 0, interactive: 0, life: 0, lifeMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim80;
  if (d.offensive === undefined) d.offensive = 0;
  if (d.defensive === undefined) d.defensive = 0;
  if (d.interactive === undefined) d.interactive = 0;
  if (d.life === undefined) d.life = 20;
  if (d.lifeInitial === undefined) d.lifeInitial = 20;
  if (!d.enemy) d.enemy = { name: '', offensive: 0, defensive: 0, interactive: 0, life: 0, lifeMax: 0 };
  if (d.enemy.interactive === undefined) d.enemy.interactive = 0;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
}

function _strike(attackerLabel, offensive, roll, defenderDefensive) {
  return Math.max(0, offensive + roll - defenderDefensive);
}

function _runRound() {
  const d = _data();
  if (!d || d.life <= 0 || d.enemy.life <= 0) return;
  d.roundsThisBattle++;

  const pRoll = _roll1d6();
  const eRoll = _roll1d6();
  const pOrder = d.interactive + pRoll;
  const eOrder = d.enemy.interactive + eRoll;
  const gap = pOrder - eOrder;
  const playerFirst = gap >= 0;
  const doubleStrike = Math.abs(gap) >= 3;

  _appendLog(d, t('battlesim80.log.order', {
    round: d.roundsThisBattle, pRoll, pOrder, eRoll, eOrder,
    first: playerFirst ? t('battlesim80.log.you') : _enemyNameSafe(d),
  }));
  if (doubleStrike) _appendLog(d, t('battlesim80.log.double', { who: playerFirst ? t('battlesim80.log.you') : _enemyNameSafe(d) }));

  const sequence = [];
  if (playerFirst) {
    sequence.push('player');
    if (doubleStrike) sequence.push('player');
    sequence.push('enemy');
  } else {
    sequence.push('enemy');
    if (doubleStrike) sequence.push('enemy');
    sequence.push('player');
  }

  for (const side of sequence) {
    if (d.life <= 0 || d.enemy.life <= 0) break;
    const roll = _roll1d6();
    if (side === 'player') {
      const dmg = _strike('player', d.offensive, roll, d.enemy.defensive);
      d.enemy.life = Math.max(0, d.enemy.life - dmg);
      _appendLog(d, t('battlesim80.log.hit_enemy', { roll, dmg, enemy: _enemyNameSafe(d), life: d.enemy.life, lifeMax: d.enemy.lifeMax }));
    } else {
      const dmg = _strike('enemy', d.enemy.offensive, roll, d.defensive);
      d.life = Math.max(0, d.life - dmg);
      _appendLog(d, t('battlesim80.log.hit_player', { roll, dmg, life: d.life, lifeMax: d.lifeInitial }));
    }
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  if (d.enemy.life <= 0) {
    _appendLog(d, t('battlesim80.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.life <= 0) {
    _appendLog(d, t('battlesim80.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.life = d.enemy.lifeMax;
  d.life = d.lifeInitial;
  if (d.log.length) _appendLog(d, t('battlesim80.log.reset_sep'));
  _appendLog(d, t('battlesim80.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">Ж:${e.hp ?? '?'} О:${e.attack ?? '?'} Д:${e.defense ?? '?'} И:${e.pb ?? '?'}</span></li>`
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
  _setVal('sim80-off', d.offensive);
  _setVal('sim80-def', d.defensive);
  _setVal('sim80-int', d.interactive);
  _setVal('sim80-life', d.life);
  _setVal('sim80-lifemax', d.lifeInitial);
  _setVal('sim80-enemy-off', d.enemy.offensive);
  _setVal('sim80-enemy-def', d.enemy.defensive);
  _setVal('sim80-enemy-int', d.enemy.interactive);
  _setVal('sim80-enemy-life', d.enemy.life);
  _setVal('sim80-enemy-lifemax', d.enemy.lifeMax);
  if (!skipEnemyPick) _setVal('sim80-enemy-pick', d.enemy.name);

  const status = document.getElementById('sim80-status');
  if (d.life <= 0) {
    status.textContent = t('battlesim80.status.fallen');
  } else if (d.enemy.life <= 0 && d.enemy.lifeMax > 0) {
    status.textContent = t('battlesim80.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim80-round').disabled = d.life <= 0 || d.enemy.life <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim80-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim80-history-summary');
  const listEl = document.getElementById('sim80-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim80.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim80.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim80.history.won') : t('battlesim80.history.lost');
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

export function renderSim80() {
  const overlay = document.getElementById('sim80-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim80(); return; }
  _renderAll();
}

function openSim80() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim80-overlay').classList.add('active');
}

function closeSim80() {
  document.getElementById('sim80-overlay')?.classList.remove('active');
}

export function setSim80Visible(visible) {
  const btn = document.getElementById('sim80-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim80();
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

export function initSim80() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim80-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim80.ui.title')}</span>
        <button id="sim80-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            ${_numField(t('battlesim80.ui.off'), 'sim80-off')}
            ${_numField(t('battlesim80.ui.def'), 'sim80-def')}
            ${_numField(t('battlesim80.ui.int'), 'sim80-int')}
            ${_numField(t('battlesim80.ui.life'), 'sim80-life')}
            ${_numField(t('battlesim80.ui.life_initial'), 'sim80-lifemax')}
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim80.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim80-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim80-enemy-pick-dropdown">
                <ul id="sim80-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim80.ui.enemy_off'), 'sim80-enemy-off')}
            ${_numField(t('battlesim80.ui.enemy_def'), 'sim80-enemy-def')}
            ${_numField(t('battlesim80.ui.enemy_int'), 'sim80-enemy-int')}
            ${_numField(t('battlesim80.ui.enemy_life'), 'sim80-enemy-life')}
            ${_numField(t('battlesim80.ui.enemy_life_max'), 'sim80-enemy-lifemax')}
          </div>
          <div id="sim80-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim80-round" class="inv-add-btn bsim-action-primary">${t('battlesim80.btn.round')}</button>
            <button id="sim80-reset" class="inv-add-btn">${t('battlesim80.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim80-history-summary">${t('battlesim80.history.summary', { n: 0 })}</summary>
            <div id="sim80-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim80-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim80-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim80);
  document.getElementById('sim80-close').addEventListener('click', closeSim80);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim80(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim80-overlay'),
    open:  openSim80,
    close: closeSim80,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim80();
  });

  document.getElementById('sim80-round').addEventListener('click', _runRound);
  document.getElementById('sim80-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim80-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim80-enemy-pick', 'sim80-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name         = enemy.name;
    d.enemy.offensive     = enemy.attack ?? 0;
    d.enemy.defensive     = enemy.defense ?? 0;
    d.enemy.interactive   = enemy.pb ?? 0;
    d.enemy.life          = enemy.hp ?? 0;
    d.enemy.lifeMax       = enemy.hp ?? 0;
    d.roundsThisBattle    = 0;
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim80-off': ['offensive'], 'sim80-def': ['defensive'], 'sim80-int': ['interactive'],
    'sim80-life': ['life'], 'sim80-lifemax': ['lifeInitial'],
    'sim80-enemy-off': ['enemy', 'offensive'], 'sim80-enemy-def': ['enemy', 'defensive'], 'sim80-enemy-int': ['enemy', 'interactive'],
    'sim80-enemy-life': ['enemy', 'life'], 'sim80-enemy-lifemax': ['enemy', 'lifeMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = Math.max(0, parseInt(input.value, 10) || 0);
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
