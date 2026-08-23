// ── Battle Simulator (Варварският бог / The Barbarian God, book 82) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 82 only) by the caller in boot.js via
// setSim82Visible().
// To remove: delete this file, remove its import line and initSim82()/
// setSim82Visible() calls from boot.js, remove 'sim82' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// A single clean mechanic, verified against the book's own worked example
// (enemy Strength 12, player Strength 7, table-pick 8 -> sum 15 > 12 ->
// enemy loses 2 ЖИЗНЕНИ ТОЧКИ). Life points (start = 50 + a table-pick,
// same non-dice "point at a table" convention as every other sim's
// precedent) fall into four Levels, each with its own Strength bonus:
// I "healthy" 62-41 (+5), II "wounded" 40-16 (+3), III "maimed" 15-1 (+1),
// IV "dead" 0 (game over). Two combat skills (ЗА РЪКОПАШЕН БОЙ /
// БОЙ С ХЛАДНИ ОРЪЖИЯ) are ALSO tiered by the same four Levels (1/0/0 and
// 2/1/0) rather than independently trained - the fight text states which
// one applies for a given encounter, so both a player's Strength and their
// current skill tier are fully derived from current Life, not tracked as
// separate numbers. Player Strength (this fight) = Level bonus + tiered
// value of whichever skill the fight calls for.
//
// Each round only the PLAYER picks a random number 1-12 (added to their own
// Strength) - the enemy's Strength is a fixed number with no roll of its
// own. If the player's total is higher, the enemy loses 2 ЖИЗНЕНИ ТОЧКИ; if
// lower, the player loses 2; a tie costs both 1. Repeat until someone is
// out. A handful of encounters state a "fight until N points are lost"
// framing instead of a separate enemy HP number - those roster rows use N
// directly as the enemy's HP, but the same early-stop convention on the
// PLAYER's side (ending before their absolute Life reaches 0) isn't
// separately enforced here; watch the round count and stop by hand for
// those specific fights, same "note it, handle manually" precedent as every
// other sim's book-specific exceptions.
//
// book_enemies.attack holds the enemy's fixed Strength, .hp holds their
// Life points (or the stated loss-threshold for the handful of encounters
// that only give one). 15 rows read from all 777 sections (this book's
// combat is a minor thread against exploration/dialogue, hence the thinner
// roster); one same-name/same-stat/same-destination pair (mounted
// barbarian §120=§454) is merged into one row.
//
// All state lives in pt.sim82, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const LEVEL_BONUS = { 1: 5, 2: 3, 3: 1, 4: 0 };
const SKILL_TIER = {
  unarmed: { 1: 1, 2: 0, 3: 0, 4: 0 },
  melee:   { 1: 2, 2: 1, 3: 0, 4: 0 },
};

function _levelFromLife(life) {
  if (life >= 41) return 1;
  if (life >= 16) return 2;
  if (life >= 1) return 3;
  return 4;
}

function _playerStrength(d) {
  const lvl = _levelFromLife(d.life);
  return LEVEL_BONUS[lvl] + SKILL_TIER[d.skill][lvl];
}

function _pick12() { return 1 + Math.floor(Math.random() * 12); }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim82) {
    pt.sim82 = {
      life: 50, lifeInitial: 50,
      skill: 'unarmed',
      enemy: { name: '', strength: 0, hp: 0, hpMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim82;
  if (d.life === undefined) d.life = 50;
  if (d.lifeInitial === undefined) d.lifeInitial = 50;
  if (!d.skill) d.skill = 'unarmed';
  if (!d.enemy) d.enemy = { name: '', strength: 0, hp: 0, hpMax: 0 };
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

function _ready(d) { return !!d && d.enemy.name.trim() !== '' && d.life > 0 && d.enemy.hp > 0; }

function _runRound() {
  const d = _data();
  if (!d || !_ready(d)) return;
  d.roundsThisBattle++;

  const pick = _pick12();
  const strength = _playerStrength(d);
  const total = pick + strength;

  _appendLog(d, t('battlesim82.log.round', { round: d.roundsThisBattle, pick, strength, total, enemyStrength: d.enemy.strength }));

  if (total > d.enemy.strength) {
    d.enemy.hp = Math.max(0, d.enemy.hp - 2);
    _appendLog(d, t('battlesim82.log.win', { enemy: _enemyNameSafe(d), hp: d.enemy.hp, hpMax: d.enemy.hpMax }));
  } else if (total < d.enemy.strength) {
    d.life = Math.max(0, d.life - 2);
    _appendLog(d, t('battlesim82.log.lose', { life: d.life, lifeMax: d.lifeInitial }));
  } else {
    d.enemy.hp = Math.max(0, d.enemy.hp - 1);
    d.life = Math.max(0, d.life - 1);
    _appendLog(d, t('battlesim82.log.tie', { enemy: _enemyNameSafe(d), hp: d.enemy.hp, hpMax: d.enemy.hpMax, life: d.life, lifeMax: d.lifeInitial }));
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  if (d.enemy.hp <= 0) {
    _appendLog(d, t('battlesim82.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.life <= 0) {
    _appendLog(d, t('battlesim82.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.hp = d.enemy.hpMax;
  d.life = d.lifeInitial;
  if (d.log.length) _appendLog(d, t('battlesim82.log.reset_sep'));
  _appendLog(d, t('battlesim82.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">С:${e.attack ?? '?'} ЖТ:${e.hp ?? '?'}</span></li>`
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

const LEVEL_LABEL_KEY = { 1: 'battlesim82.ui.level1', 2: 'battlesim82.ui.level2', 3: 'battlesim82.ui.level3', 4: 'battlesim82.ui.level4' };

function _renderInputs(skipEnemyPick) {
  const d = _data();
  if (!d) return;
  _setVal('sim82-life', d.life);
  _setVal('sim82-lifemax', d.lifeInitial);
  const skillSel = document.getElementById('sim82-skill');
  if (skillSel) skillSel.value = d.skill;
  _setVal('sim82-enemy-strength', d.enemy.strength);
  _setVal('sim82-enemy-hp', d.enemy.hp);
  _setVal('sim82-enemy-hpmax', d.enemy.hpMax);
  if (!skipEnemyPick) _setVal('sim82-enemy-pick', d.enemy.name);

  const lvl = _levelFromLife(d.life);
  const strength = _playerStrength(d);
  const lvlEl = document.getElementById('sim82-level');
  if (lvlEl) lvlEl.textContent = t(LEVEL_LABEL_KEY[lvl]);
  const strEl = document.getElementById('sim82-strength');
  if (strEl) strEl.textContent = String(strength);

  const status = document.getElementById('sim82-status');
  if (!_ready(d)) {
    status.textContent = t('battlesim82.status.not_ready');
  } else if (d.life <= 0) {
    status.textContent = t('battlesim82.status.fallen');
  } else if (d.enemy.hp <= 0 && d.enemy.hpMax > 0) {
    status.textContent = t('battlesim82.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim82-round').disabled = !_ready(d) || d.life <= 0 || d.enemy.hp <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim82-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim82-history-summary');
  const listEl = document.getElementById('sim82-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim82.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim82.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim82.history.won') : t('battlesim82.history.lost');
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

export function renderSim82() {
  const overlay = document.getElementById('sim82-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim82(); return; }
  _renderAll();
}

function openSim82() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim82-overlay').classList.add('active');
}

function closeSim82() {
  document.getElementById('sim82-overlay')?.classList.remove('active');
}

export function setSim82Visible(visible) {
  const btn = document.getElementById('sim82-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim82();
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

export function initSim82() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim82-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim82.ui.title')}</span>
        <button id="sim82-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            ${_numField(t('battlesim82.ui.life'), 'sim82-life')}
            ${_numField(t('battlesim82.ui.life_initial'), 'sim82-lifemax')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim82.ui.skill')}</span>
              <select id="sim82-skill" class="bsim-select">
                <option value="unarmed">${t('battlesim82.ui.skill_unarmed')}</option>
                <option value="melee">${t('battlesim82.ui.skill_melee')}</option>
              </select>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim82.ui.level')}</span>
              <span id="sim82-level"></span>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim82.ui.strength')}</span>
              <span id="sim82-strength"></span>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim82.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim82-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim82-enemy-pick-dropdown">
                <ul id="sim82-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim82.ui.enemy_strength'), 'sim82-enemy-strength')}
            ${_numField(t('battlesim82.ui.enemy_hp'), 'sim82-enemy-hp')}
            ${_numField(t('battlesim82.ui.enemy_hp_max'), 'sim82-enemy-hpmax')}
          </div>
          <div id="sim82-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim82-round" class="inv-add-btn bsim-action-primary">${t('battlesim82.btn.round')}</button>
            <button id="sim82-reset" class="inv-add-btn">${t('battlesim82.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim82-history-summary">${t('battlesim82.history.summary', { n: 0 })}</summary>
            <div id="sim82-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim82-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim82-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim82);
  document.getElementById('sim82-close').addEventListener('click', closeSim82);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim82(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim82-overlay'),
    open:  openSim82,
    close: closeSim82,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim82();
  });

  document.getElementById('sim82-round').addEventListener('click', _runRound);
  document.getElementById('sim82-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim82-skill').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.skill = e.target.value === 'melee' ? 'melee' : 'unarmed';
    saveState();
    _renderInputs(true);
  });

  document.getElementById('sim82-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim82-enemy-pick', 'sim82-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name       = enemy.name;
    d.enemy.strength   = enemy.attack ?? 0;
    d.enemy.hp         = enemy.hp ?? 0;
    d.enemy.hpMax      = enemy.hp ?? 0;
    d.roundsThisBattle = 0;
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim82-life': ['life'], 'sim82-lifemax': ['lifeInitial'],
    'sim82-enemy-strength': ['enemy', 'strength'], 'sim82-enemy-hp': ['enemy', 'hp'], 'sim82-enemy-hpmax': ['enemy', 'hpMax'],
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
