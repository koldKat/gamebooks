// ── Battle Simulator (Войната на Понтиак / War of Pontiac, book 83) ────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 83 only) by the caller in boot.js via
// setSim83Visible().
// To remove: delete this file, remove its import line and initSim83()/
// setSim83Visible() calls from boot.js, remove 'sim83' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// Rules p.5-6 ("ПРИЛОЖЕНИЕ ЗА ПРОВЕЖДАНЕ НА БИТКИ СЪС СЛУЧАЙНИ ЧИСЛА" -
// the random-number combat appendix, explicitly scoped to single combat
// only, not mass battles): each exchange is TWO number-picks made by the
// acting side, not an opposed roll - pick a number for yourself (added to
// your STRENGTH + the WEAPON you're using this fight) and a number for the
// opponent (added to their DEFENSE); if your total is >= theirs, they lose
// 2 ENDURANCE, otherwise you do. When the opponent attacks you instead,
// the same two picks happen but using the opponent's ATTACK stat for
// their side. The book's own enemy table gives every foe a DEFENSE,
// ATTACK and ENDURANCE value (book_enemies.defense/attack/hp respectively)
// - see the 12-entry roster on rules p.6.
//
// The book never states a separate player DEFENSE stat - STRENGTH is the
// only combat stat on the character sheet (rules p.4: "ДНЕВНИК НА
// ПРИКЛЮЧЕНИЕТО", Сила/Бързина/Престиж/Издръжливост). Modeled here as:
// your own STRENGTH ALONE (no weapon bonus - the rules only ever grant
// that while attacking, part Б) is used as your defense roll when the
// enemy strikes back, since it's the only value the book gives you.
// Flagged as an assumption, not a stated rule - if it plays wrong
// against the physical book, this is the spot to revisit.
//
// WEAPON bonus is a free-entry number, not a fixed catalog: the rules
// explicitly restrict which weapon is usable to whatever a given episode
// names ("Можеш да се биеш само с оръжията, споменати в съответния
// епизод"), and no weapon/bonus table is given anywhere in the book -
// the reader is expected to already know the bonus from earlier in the
// story. Left as a manual stepper for the player to set per fight.
//
// One "round" here = one full exchange: you strike once, then (if both
// sides are still standing) the enemy strikes back once - matching every
// other sim in this app's pattern of "player acts, then enemy acts" per
// round, since the book's own text doesn't specify how many strikes make
// up a "round" beyond "continues until someone's ENDURANCE reaches 0".
//
// All state lives in pt.sim83, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=1464';
import { showAlert } from '../confirm.js?v=1464';
import { getPlayBtnRow } from '../charsheet.js?v=1464';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=1464';
import { t } from '../i18n.js?v=1464';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const WOUND_DMG = 2;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim83) {
    pt.sim83 = {
      strength: 5, strengthInitial: 5,
      weapon: 0,
      endurance: 50, enduranceInitial: 50,
      enemy: { name: '', attack: 0, defense: 0, endurance: 0, enduranceMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim83;
  if (d.strength === undefined) d.strength = 5;
  if (d.strengthInitial === undefined) d.strengthInitial = 5;
  if (d.weapon === undefined) d.weapon = 0;
  if (d.endurance === undefined) d.endurance = 50;
  if (d.enduranceInitial === undefined) d.enduranceInitial = 50;
  if (!d.enemy) d.enemy = { name: '', attack: 0, defense: 0, endurance: 0, enduranceMax: 0 };
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _pick() { return 1 + Math.floor(Math.random() * 12); } // "магическа дузина"-style number pick, 1-12

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || 'врагът'; }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
}

function _playerStrike() {
  const d = _data();
  const yourPick = _pick();
  const enemyPick = _pick();
  const yourTotal = yourPick + d.strength + d.weapon;
  const enemyTotal = enemyPick + d.enemy.defense;
  _appendLog(d, t('battlesim83.log.you_strike', { yourPick, strength: d.strength, weapon: d.weapon, yourTotal, enemy: _enemyNameSafe(d), enemyPick, defense: d.enemy.defense, enemyTotal }));
  if (yourTotal >= enemyTotal) {
    d.enemy.endurance = Math.max(0, d.enemy.endurance - WOUND_DMG);
    _appendLog(d, t('battlesim83.log.you_hit', { enemy: _enemyNameSafe(d), n: WOUND_DMG, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax }));
  } else {
    d.endurance = Math.max(0, d.endurance - WOUND_DMG);
    _appendLog(d, t('battlesim83.log.you_miss', { n: WOUND_DMG, endurance: d.endurance, enduranceMax: d.enduranceInitial }));
  }
}

function _enemyStrike() {
  const d = _data();
  const enemyPick = _pick();
  const yourPick = _pick();
  const enemyTotal = enemyPick + d.enemy.attack;
  // No weapon bonus here: the rules only ever grant it while attacking
  // (part Б - "СИЛА + точките на ОРЪЖИЕТО, КОЕТО ЩЕ ИЗПОЛЗВАШ"), never
  // while defending, so this uses STRENGTH alone.
  const yourTotal = yourPick + d.strength;
  _appendLog(d, t('battlesim83.log.enemy_strikes', { enemy: _enemyNameSafe(d), enemyPick, attack: d.enemy.attack, enemyTotal, yourPick, strength: d.strength, yourTotal }));
  if (enemyTotal >= yourTotal) {
    d.endurance = Math.max(0, d.endurance - WOUND_DMG);
    _appendLog(d, t('battlesim83.log.enemy_hits', { enemy: _enemyNameSafe(d), n: WOUND_DMG, endurance: d.endurance, enduranceMax: d.enduranceInitial }));
  } else {
    d.enemy.endurance = Math.max(0, d.enemy.endurance - WOUND_DMG);
    _appendLog(d, t('battlesim83.log.enemy_misses', { enemy: _enemyNameSafe(d), n: WOUND_DMG, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax }));
  }
}

function _checkBattleEnd(d) {
  if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim83.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim83.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _runRound() {
  const d = _data();
  if (!d || d.endurance <= 0 || d.enemy.endurance <= 0) return;
  d.roundsThisBattle++;
  _appendLog(d, t('battlesim83.log.round', { round: d.roundsThisBattle }));
  _playerStrike();
  if (d.endurance > 0 && d.enemy.endurance > 0) _enemyStrike();
  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.endurance = d.enemy.enduranceMax;
  d.endurance = d.enduranceInitial;
  if (d.log.length) _appendLog(d, t('battlesim83.log.reset_sep'));
  _appendLog(d, t('battlesim83.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${e.attack ?? '?'}/${e.defense ?? '?'}/${e.hp ?? '?'}</span></li>`
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
  _setVal('sim83-strength', d.strength);
  _setVal('sim83-strengthmax', d.strengthInitial);
  _setVal('sim83-weapon', d.weapon);
  _setVal('sim83-endurance', d.endurance);
  _setVal('sim83-endurancemax', d.enduranceInitial);
  _setVal('sim83-enemy-attack', d.enemy.attack);
  _setVal('sim83-enemy-defense', d.enemy.defense);
  _setVal('sim83-enemy-endurance', d.enemy.endurance);
  _setVal('sim83-enemy-endurancemax', d.enemy.enduranceMax);
  if (!skipEnemyPick) _setVal('sim83-enemy-pick', d.enemy.name);

  const status = document.getElementById('sim83-status');
  if (d.endurance <= 0) {
    status.textContent = t('battlesim83.status.fallen');
  } else if (d.enemy.endurance <= 0 && d.enemy.enduranceMax > 0) {
    status.textContent = t('battlesim83.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim83-round').disabled = d.endurance <= 0 || d.enemy.endurance <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim83-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim83-history-summary');
  const listEl = document.getElementById('sim83-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim83.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim83.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim83.history.won') : t('battlesim83.history.lost');
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

export function renderSim83() {
  const overlay = document.getElementById('sim83-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim83(); return; }
  _renderAll();
}

function openSim83() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim83-overlay').classList.add('active');
}

function closeSim83() {
  document.getElementById('sim83-overlay')?.classList.remove('active');
}

export function setSim83Visible(visible) {
  const btn = document.getElementById('sim83-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim83();
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

export function initSim83() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim83-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim83.ui.title')}</span>
        <button id="sim83-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            ${_numField(t('battlesim83.ui.strength'), 'sim83-strength')}
            ${_numField(t('battlesim83.ui.strength_initial'), 'sim83-strengthmax')}
            ${_numField(t('battlesim83.ui.weapon'), 'sim83-weapon')}
            ${_numField(t('battlesim83.ui.endurance'), 'sim83-endurance')}
            ${_numField(t('battlesim83.ui.endurance_initial'), 'sim83-endurancemax')}
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim83.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim83-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim83-enemy-pick-dropdown">
                <ul id="sim83-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim83.ui.enemy_attack'), 'sim83-enemy-attack')}
            ${_numField(t('battlesim83.ui.enemy_defense'), 'sim83-enemy-defense')}
            ${_numField(t('battlesim83.ui.enemy_endurance'), 'sim83-enemy-endurance')}
            ${_numField(t('battlesim83.ui.enemy_endurance_max'), 'sim83-enemy-endurancemax')}
          </div>
          <div id="sim83-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim83-round" class="inv-add-btn bsim-action-primary">${t('battlesim83.btn.round')}</button>
            <button id="sim83-reset" class="inv-add-btn">${t('battlesim83.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim83-history-summary">${t('battlesim83.history.summary', { n: 0 })}</summary>
            <div id="sim83-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim83-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim83-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim83);
  document.getElementById('sim83-close').addEventListener('click', closeSim83);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim83(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim83-overlay'),
    open:  openSim83,
    close: closeSim83,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim83();
  });

  document.getElementById('sim83-round').addEventListener('click', _runRound);
  document.getElementById('sim83-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim83-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim83-enemy-pick', 'sim83-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name          = enemy.name;
    d.enemy.attack         = enemy.attack ?? 0;
    d.enemy.defense        = enemy.defense ?? 0;
    d.enemy.endurance      = enemy.hp ?? 0;
    d.enemy.enduranceMax   = enemy.hp ?? 0;
    d.roundsThisBattle     = 0;
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim83-strength': ['strength'], 'sim83-strengthmax': ['strengthInitial'],
    'sim83-weapon': ['weapon'],
    'sim83-endurance': ['endurance'], 'sim83-endurancemax': ['enduranceInitial'],
    'sim83-enemy-attack': ['enemy', 'attack'], 'sim83-enemy-defense': ['enemy', 'defense'],
    'sim83-enemy-endurance': ['enemy', 'endurance'], 'sim83-enemy-endurancemax': ['enemy', 'enduranceMax'],
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
