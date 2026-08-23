// ── Battle Simulator (Проклятието на меча / Curse of the Sword, book 122) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 122 only) by the caller in boot.js via
// setSim122Visible().
// To remove: delete this file, remove its import line and initSim122()/
// setSim122Visible() calls from boot.js, remove 'sim122' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// This book is structurally different from every other sim in this app: it
// offers THREE independent combat systems, switchable even mid-fight at the
// player's choice, built around a per-fight "БОЕН КОД" (Battle Code) rather
// than a fixed COMBAT SKILL/SKILL stat.
//
// System 1 ("point comparison") is the book's primary, most-used method: at
// each individual fight section, the text states the exact formula to sum
// (e.g. "Battle Code = СИЛА + kendo points") and a printed threshold - a
// single static comparison with no dice and nothing to simulate. This sim
// does not model System 1's resolution; it just shows the enemy's printed
// threshold as a reference number (book_enemies.defense) since it's faster
// to read off the roster than to re-derive from the fight text.
//
// Systems 2 and 3 ARE modeled, since both are round-based, dice-driven, and
// benefit from automation the same way every other sim in this app does:
// each round both sides roll 2d6, add it to their own total (player: roll +
// Battle Code; enemy: roll + БОЙНИ КАЧЕСТВА), and the difference is applied
// to whichever side lost the exchange. System 2 applies the difference to
// ИЗДРЪЖЛИВОСТ (Endurance) - fight ends at 0. System 3 applies the
// difference to the player's own Battle Code instead, leaving Endurance
// untouched entirely - fight ends only if Battle Code reaches 0 (forced
// worst branch); otherwise the player checks their current, evolving Battle
// Code against the section's own threshold whenever they choose to stop.
// The book explicitly allows switching between Systems 2 and 3 from round to
// round within the same fight, so the system selector is live, not locked in
// at fight start.
//
// Deliberately NOT modeled: chargen/skill-journal tracking (СИЛА, ЛОВКОСТ,
// БЪРЗИНА, the 15 selectable skills, weapon choice) - each fight states its
// own Battle Code formula in the text, so the player computes it externally
// from their journal and enters the result directly, same free-form-entry
// precedent as attackModifier in every other sim. Also not modeled: several
// fights' asymmetric early-stop conditions ("battle ends if either side
// loses more than N points" rather than at 0/the printed threshold) - apply
// those by hand by watching the log, same "note it, handle manually"
// precedent as book 325's §4 exception.
//
// book_enemies.attack holds БОЙНИ КАЧЕСТВА (the enemy's own per-round dice
// bonus), .hp holds ИЗДРЪЖЛИВОСТ (Endurance, spent by System 2), .defense
// holds the informational System-1 threshold described above - a different
// repurposing than every other sim's precedent, since this book needs a
// third distinct number. 35 rows read from all 74 flagged sections (many
// flagged sections turned out to be chargen/training branches with no
// fight); a few same-name/same-stat/same-destination groups (kenjutsu master
// §110=§120, Uesugi warband §260=§270, Kenshin Uesugi's duel §302=§306) are
// merged into one row each.
//
// All state lives in pt.sim122, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=1467';
import { showAlert } from '../confirm.js?v=1467';
import { getPlayBtnRow } from '../charsheet.js?v=1467';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=1467';
import { t } from '../i18n.js?v=1467';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _roll2d6() { return 1 + Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6); }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim122) {
    pt.sim122 = {
      battleCode: 0, battleCodeInitial: 0,
      endurance: 0, enduranceInitial: 0,
      system: 2,
      enemy: { name: '', battleQualities: 0, endurance: 0, enduranceMax: 0, threshold: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim122;
  if (d.battleCode === undefined) d.battleCode = 0;
  if (d.battleCodeInitial === undefined) d.battleCodeInitial = 0;
  if (d.endurance === undefined) d.endurance = 0;
  if (d.enduranceInitial === undefined) d.enduranceInitial = 0;
  if (d.system === undefined) d.system = 2;
  if (!d.enemy) d.enemy = { name: '', battleQualities: 0, endurance: 0, enduranceMax: 0, threshold: 0 };
  if (d.enemy.threshold === undefined) d.enemy.threshold = 0;
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

function _ready(d) { return !!d && d.enemy.name.trim() !== '' && d.endurance > 0 && d.enemy.endurance > 0 && d.battleCode > 0; }

function _runRound() {
  const d = _data();
  if (!d || !_ready(d)) return;
  d.roundsThisBattle++;

  const playerRoll = _roll2d6();
  const enemyRoll   = _roll2d6();
  const playerTotal = playerRoll + d.battleCode;
  const enemyTotal   = enemyRoll + d.enemy.battleQualities;
  const diff = Math.abs(playerTotal - enemyTotal);

  _appendLog(d, t('battlesim122.log.round', {
    round: d.roundsThisBattle, playerRoll, battleCode: d.battleCode, playerTotal,
    enemyRoll, battleQualities: d.enemy.battleQualities, enemyTotal,
  }));

  if (playerTotal > enemyTotal) {
    if (d.system === 2) {
      d.enemy.endurance = Math.max(0, d.enemy.endurance - diff);
      _appendLog(d, t('battlesim122.log.win_en', { diff, enemy: _enemyNameSafe(d), endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax }));
    } else {
      d.battleCode = d.battleCode + diff;
      _appendLog(d, t('battlesim122.log.win_bc', { diff, battleCode: d.battleCode }));
    }
  } else if (enemyTotal > playerTotal) {
    if (d.system === 2) {
      d.endurance = Math.max(0, d.endurance - diff);
      _appendLog(d, t('battlesim122.log.lose_en', { diff, endurance: d.endurance, enduranceMax: d.enduranceInitial }));
    } else {
      d.battleCode = Math.max(0, d.battleCode - diff);
      _appendLog(d, t('battlesim122.log.lose_bc', { diff, battleCode: d.battleCode }));
    }
  } else {
    _appendLog(d, t('battlesim122.log.tie'));
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  if (d.system === 2 && d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim122.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.endurance <= 0 || (d.system === 3 && d.battleCode <= 0)) {
    _appendLog(d, t('battlesim122.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.endurance = d.enemy.enduranceMax;
  d.endurance = d.enduranceInitial;
  d.battleCode = d.battleCodeInitial;
  if (d.log.length) _appendLog(d, t('battlesim122.log.reset_sep'));
  _appendLog(d, t('battlesim122.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">EN:${e.hp ?? '?'} BQ:${e.attack ?? '?'}</span></li>`
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
  _setVal('sim122-bc', d.battleCode);
  _setVal('sim122-bcinitial', d.battleCodeInitial);
  _setVal('sim122-en', d.endurance);
  _setVal('sim122-enmax', d.enduranceInitial);
  _setVal('sim122-enemy-bq', d.enemy.battleQualities);
  _setVal('sim122-enemy-en', d.enemy.endurance);
  _setVal('sim122-enemy-enmax', d.enemy.enduranceMax);
  _setVal('sim122-enemy-threshold', d.enemy.threshold);
  if (!skipEnemyPick) _setVal('sim122-enemy-pick', d.enemy.name);

  const sysSel = document.getElementById('sim122-system');
  if (sysSel) sysSel.value = String(d.system);

  const status = document.getElementById('sim122-status');
  if (!_ready(d)) {
    status.textContent = t('battlesim122.status.not_ready');
  } else if (d.endurance <= 0 || (d.system === 3 && d.battleCode <= 0)) {
    status.textContent = t('battlesim122.status.fallen');
  } else if (d.system === 2 && d.enemy.endurance <= 0) {
    status.textContent = t('battlesim122.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim122-round').disabled = !_ready(d) || d.endurance <= 0 || (d.system === 2 && d.enemy.endurance <= 0) || (d.system === 3 && d.battleCode <= 0);
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim122-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim122-history-summary');
  const listEl = document.getElementById('sim122-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim122.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim122.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim122.history.won') : t('battlesim122.history.lost');
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

export function renderSim122() {
  const overlay = document.getElementById('sim122-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim122(); return; }
  _renderAll();
}

function openSim122() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim122-overlay').classList.add('active');
}

function closeSim122() {
  document.getElementById('sim122-overlay')?.classList.remove('active');
}

export function setSim122Visible(visible) {
  const btn = document.getElementById('sim122-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim122();
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

export function initSim122() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim122-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim122.ui.title')}</span>
        <button id="sim122-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim122.ui.system')}</span>
              <select id="sim122-system" class="bsim-select">
                <option value="2">${t('battlesim122.ui.system2')}</option>
                <option value="3">${t('battlesim122.ui.system3')}</option>
              </select>
            </div>
            ${_numField(t('battlesim122.ui.bc'), 'sim122-bc')}
            ${_numField(t('battlesim122.ui.bc_initial'), 'sim122-bcinitial')}
            ${_numField(t('battlesim122.ui.en'), 'sim122-en')}
            ${_numField(t('battlesim122.ui.en_initial'), 'sim122-enmax')}
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim122.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim122-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim122-enemy-pick-dropdown">
                <ul id="sim122-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim122.ui.enemy_bq'), 'sim122-enemy-bq')}
            ${_numField(t('battlesim122.ui.enemy_en'), 'sim122-enemy-en')}
            ${_numField(t('battlesim122.ui.enemy_en_max'), 'sim122-enemy-enmax')}
            ${_numField(t('battlesim122.ui.enemy_threshold'), 'sim122-enemy-threshold', null, true)}
          </div>
          <div id="sim122-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim122-round" class="inv-add-btn bsim-action-primary">${t('battlesim122.btn.round')}</button>
            <button id="sim122-reset" class="inv-add-btn">${t('battlesim122.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim122-history-summary">${t('battlesim122.history.summary', { n: 0 })}</summary>
            <div id="sim122-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim122-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim122-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim122);
  document.getElementById('sim122-close').addEventListener('click', closeSim122);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim122(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim122-overlay'),
    open:  openSim122,
    close: closeSim122,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim122();
  });

  document.getElementById('sim122-round').addEventListener('click', _runRound);
  document.getElementById('sim122-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim122-system').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.system = parseInt(e.target.value, 10) === 3 ? 3 : 2;
    saveState();
    _renderInputs(true);
  });

  document.getElementById('sim122-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim122-enemy-pick', 'sim122-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name             = enemy.name;
    d.enemy.battleQualities   = enemy.attack ?? 0;
    d.enemy.endurance         = enemy.hp ?? 0;
    d.enemy.enduranceMax      = enemy.hp ?? 0;
    d.enemy.threshold         = enemy.defense ?? 0;
    d.roundsThisBattle        = 0;
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim122-bc': ['battleCode'], 'sim122-bcinitial': ['battleCodeInitial'],
    'sim122-en': ['endurance'], 'sim122-enmax': ['enduranceInitial'],
    'sim122-enemy-bq': ['enemy', 'battleQualities'], 'sim122-enemy-en': ['enemy', 'endurance'], 'sim122-enemy-enmax': ['enemy', 'enduranceMax'],
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
