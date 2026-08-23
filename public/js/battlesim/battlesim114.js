// ── Battle Simulator (Огнена пустиня / Fiery Desert, book 114) ─────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 114 only) by the caller in boot.js via
// setSim114Visible().
// To remove: delete this file, remove its import line and initSim114()/
// setSim114Visible() calls from boot.js, remove 'sim114' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// Same chitanka.info-family symmetric-STRENGTH formula as book 86 (both
// sides pick a number, add own STRENGTH, higher total deals 2 LIFE damage,
// tie = no damage - the rules never resolve a genuine draw). Different
// LIFE constant though: pick + 20 here, not book 86's pick + 30 - worth
// keeping distinct rather than copy-pasting the wrong book's number.
//
// One real per-book mechanic (rules p.11, "СРАЖЕНИЯ"): owning the
// "бързоходни ботуши" (fast boots, found before the §278/§400 Agamor
// fights) lets the PLAYER pick two numbers each exchange and use the
// higher one, while the enemy still only picks one - a toggle, not
// baked into any specific enemy, since it's an inventory state the
// player carries across fights, not a fixed encounter property.
//
// book_enemies.attack holds STRENGTH (this book has one combat stat,
// same convention as book 86), .hp holds LIFE, .defense is unused.
// 40 rows, read from all 420 sections directly (no front-matter roster
// appendix, same as book 86) - several duplicate-stat names (Дракон,
// Трол, Змия, Василиск, Наемник) are genuinely separate encounters at
// different sections, disambiguated by section number in the name since
// autocomplete has no other way to tell them apart. Агамор (final boss)
// has two distinct fights, §278 (first, tougher) and §400 (rematch,
// weaker) - both real, not a data error.
//
// All state lives in pt.sim114, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=1467';
import { showAlert } from '../confirm.js?v=1467';
import { getPlayBtnRow } from '../charsheet.js?v=1467';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=1467';
import { t } from '../i18n.js?v=1467';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const WOUND_DMG = 2;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim114) {
    pt.sim114 = {
      strength: 0, strengthInitial: 0,
      life: 0, lifeInitial: 0,
      rolled: false,
      fastBoots: false,
      enemy: { name: '', strength: 0, life: 0, lifeMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim114;
  if (d.strength === undefined) d.strength = 0;
  if (d.strengthInitial === undefined) d.strengthInitial = 0;
  if (d.life === undefined) d.life = 0;
  if (d.lifeInitial === undefined) d.lifeInitial = 0;
  if (d.rolled === undefined) d.rolled = false;
  if (d.fastBoots === undefined) d.fastBoots = false;
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

  let yourPick;
  if (d.fastBoots) {
    const a = _pick(), b = _pick();
    yourPick = Math.max(a, b);
    _appendLog(d, t('battlesim114.log.boots_pick', { a, b, yourPick }));
  } else {
    yourPick = _pick();
  }
  const enemyPick = _pick();
  const yourTotal = yourPick + d.strength;
  const enemyTotal = enemyPick + d.enemy.strength;
  _appendLog(d, t('battlesim114.log.round', { round: d.roundsThisBattle, yourPick, strength: d.strength, yourTotal, enemy: _enemyNameSafe(d), enemyPick, enemyStrength: d.enemy.strength, enemyTotal }));

  if (yourTotal > enemyTotal) {
    d.enemy.life = Math.max(0, d.enemy.life - WOUND_DMG);
    _appendLog(d, t('battlesim114.log.you_hit', { enemy: _enemyNameSafe(d), n: WOUND_DMG, life: d.enemy.life, lifeMax: d.enemy.lifeMax }));
  } else if (enemyTotal > yourTotal) {
    d.life = Math.max(0, d.life - WOUND_DMG);
    _appendLog(d, t('battlesim114.log.enemy_hits', { n: WOUND_DMG, life: d.life, lifeMax: d.lifeInitial }));
  } else {
    _appendLog(d, t('battlesim114.log.tie'));
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  if (d.enemy.life <= 0) {
    _appendLog(d, t('battlesim114.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.life <= 0) {
    _appendLog(d, t('battlesim114.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.life = d.enemy.lifeMax;
  d.life = d.lifeInitial;
  if (d.log.length) _appendLog(d, t('battlesim114.log.reset_sep'));
  _appendLog(d, t('battlesim114.log.reset', { enemy: _enemyNameSafe(d) }));
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
  _setVal('sim114-strength', d.strength);
  _setVal('sim114-strengthmax', d.strengthInitial);
  _setVal('sim114-life', d.life);
  _setVal('sim114-lifemax', d.lifeInitial);
  _setChecked('sim114-fast-boots', d.fastBoots);
  _setVal('sim114-enemy-strength', d.enemy.strength);
  _setVal('sim114-enemy-life', d.enemy.life);
  _setVal('sim114-enemy-lifemax', d.enemy.lifeMax);
  if (!skipEnemyPick) _setVal('sim114-enemy-pick', d.enemy.name);

  const status = document.getElementById('sim114-status');
  if (!d.rolled) {
    status.textContent = t('battlesim114.status.not_ready');
  } else if (d.life <= 0) {
    status.textContent = t('battlesim114.status.fallen');
  } else if (d.enemy.life <= 0 && d.enemy.lifeMax > 0) {
    status.textContent = t('battlesim114.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim114-round').disabled = !d.rolled || d.life <= 0 || d.enemy.life <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim114-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim114-history-summary');
  const listEl = document.getElementById('sim114-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim114.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim114.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim114.history.won') : t('battlesim114.history.lost');
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

export function renderSim114() {
  const overlay = document.getElementById('sim114-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim114(); return; }
  _renderAll();
}

function openSim114() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim114-overlay').classList.add('active');
}

function closeSim114() {
  document.getElementById('sim114-overlay')?.classList.remove('active');
}

export function setSim114Visible(visible) {
  const btn = document.getElementById('sim114-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim114();
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

export function initSim114() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim114-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim114.ui.title')}</span>
        <button id="sim114-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim114-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim114.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim114.ui.strength'), 'sim114-strength')}
            ${_numField(t('battlesim114.ui.strength_initial'), 'sim114-strengthmax')}
            ${_numField(t('battlesim114.ui.life'), 'sim114-life')}
            ${_numField(t('battlesim114.ui.life_initial'), 'sim114-lifemax')}
            <div class="inv-edit-row bsim-ae-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim114-fast-boots" class="inv-edit-check"> ${t('battlesim114.ui.fast_boots_toggle')}</label>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim114.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim114-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim114-enemy-pick-dropdown">
                <ul id="sim114-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim114.ui.enemy_strength'), 'sim114-enemy-strength')}
            ${_numField(t('battlesim114.ui.enemy_life'), 'sim114-enemy-life')}
            ${_numField(t('battlesim114.ui.enemy_life_max'), 'sim114-enemy-lifemax')}
          </div>
          <div id="sim114-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim114-round" class="inv-add-btn bsim-action-primary">${t('battlesim114.btn.round')}</button>
            <button id="sim114-reset" class="inv-add-btn">${t('battlesim114.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim114-history-summary">${t('battlesim114.history.summary', { n: 0 })}</summary>
            <div id="sim114-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim114-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim114-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim114);
  document.getElementById('sim114-close').addEventListener('click', closeSim114);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim114(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim114-overlay'),
    open:  openSim114,
    close: closeSim114,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim114();
  });

  document.getElementById('sim114-round').addEventListener('click', _runRound);
  document.getElementById('sim114-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim114-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.strengthInitial = Math.ceil(_pick() / 2) + 10;
    d.lifeInitial      = _pick() + 20;
    d.strength = d.strengthInitial;
    d.life     = d.lifeInitial;
    d.rolled   = true;
    _appendLog(d, t('battlesim114.log.rolled'));
    saveState();
    _renderAll();
  });

  document.getElementById('sim114-fast-boots').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.fastBoots = e.target.checked;
    saveState();
  });

  document.getElementById('sim114-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim114-enemy-pick', 'sim114-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name        = enemy.name;
    d.enemy.strength     = enemy.attack ?? 0;
    d.enemy.life         = enemy.hp ?? 0;
    d.enemy.lifeMax      = enemy.hp ?? 0;
    d.roundsThisBattle   = 0;
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim114-strength': ['strength'], 'sim114-strengthmax': ['strengthInitial'],
    'sim114-life': ['life'], 'sim114-lifemax': ['lifeInitial'],
    'sim114-enemy-strength': ['enemy', 'strength'], 'sim114-enemy-life': ['enemy', 'life'], 'sim114-enemy-lifemax': ['enemy', 'lifeMax'],
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
