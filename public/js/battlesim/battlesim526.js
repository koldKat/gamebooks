// ── Battle Simulator (GrailQuest 1: The Castle of Darkness, book 526) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 526 only) by the caller in boot.js via
// setSim526Visible().
// To remove: delete this file, remove its import line and initSim526()/
// setSim526Visible() calls from boot.js, remove 'sim526' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// GrailQuest's own single-roll LIFE POINTS system - simpler than any FF/Lone
// Wolf sim in this app, no opposed-roll comparison. Each round, both sides
// roll 2d6 independently (not compared against each other): a roll meeting
// or beating a hit threshold (7 by default, "more than 6") lands a hit for
// (roll - 6) damage, plus any flat weapon bonus; a miss deals nothing. Armour
// subtracts a flat amount from incoming damage before LIFE POINTS. At 5 or
// fewer LIFE POINTS a combatant falls unconscious (not dead); at 0, dead -
// tracked as a distinct status rather than folded into a single "loss".
//
// Weapon/armour toggles from the book's own rules-summary page: EJ (a named
// magic sword) lowers the hit threshold to 4 and adds +5 damage; Dagger adds
// +2 damage at the normal threshold; Dragonskin jacket subtracts 4 from
// incoming damage. Only one weapon is ever wielded at a time (not enforced
// in code, matching every other sim's precedent of noting rather than
// enforcing story constraints).
//
// Mean Jake's opening duel (a first-to-lose-10-in-one-hit brawl, not the
// reduce-to-0/5 pattern) and the Sleep/EXPERIENCE mechanics (both between-
// fight bookkeeping, not combat-round math) are deliberately NOT modeled,
// same precedent as every other sim in this app - apply those by hand.
//
// book_enemies.attack holds the enemy's flat damage bonus, .hp holds LIFE
// POINTS, .defense unused. 13 rows: a partial roster gathered from the
// book's own stat-block sentences ("X has N LIFE POINTS... does +N
// damage"), not mapped to exact section numbers - add more via the in-app
// enemy editor as needed.
//
// All state lives in pt.sim526, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=1467';
import { showAlert } from '../confirm.js?v=1467';
import { getPlayBtnRow } from '../charsheet.js?v=1467';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=1467';
import { t } from '../i18n.js?v=1467';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const DEFAULT_HIT_REQ = 7; // "score more than 6"
const UNCONSCIOUS_AT = 5;  // "5 or fewer LIFE POINTS, falls unconscious"

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim526) {
    pt.sim526 = {
      life: 0, lifeInitial: 0,
      hitReq: DEFAULT_HIT_REQ,
      damageBonus: 0,
      armour: 0,
      rolled: false,
      enemy: { name: '', hitReq: DEFAULT_HIT_REQ, damageBonus: 0, armour: 0, life: 0, lifeMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim526;
  if (d.life === undefined) d.life = 0;
  if (d.lifeInitial === undefined) d.lifeInitial = 0;
  if (d.hitReq === undefined) d.hitReq = DEFAULT_HIT_REQ;
  if (d.damageBonus === undefined) d.damageBonus = 0;
  if (d.armour === undefined) d.armour = 0;
  if (d.rolled === undefined) d.rolled = false;
  if (!d.enemy) d.enemy = { name: '', hitReq: DEFAULT_HIT_REQ, damageBonus: 0, armour: 0, life: 0, lifeMax: 0 };
  if (d.enemy.hitReq === undefined) d.enemy.hitReq = DEFAULT_HIT_REQ;
  if (d.enemy.damageBonus === undefined) d.enemy.damageBonus = 0;
  if (d.enemy.armour === undefined) d.enemy.armour = 0;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _roll2d6() { return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _statusOf(life) {
  if (life <= 0) return 'dead';
  if (life <= UNCONSCIOUS_AT) return 'unconscious';
  return 'ok';
}

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
}

function _resolveAttack(roll, hitReq, damageBonus, targetArmour) {
  if (roll < hitReq) return 0;
  return Math.max(0, roll - 6 + damageBonus - targetArmour);
}

function _runRound() {
  const d = _data();
  if (!d || !d.rolled) return;
  if (_statusOf(d.life) !== 'ok' || _statusOf(d.enemy.life) !== 'ok') return;
  d.roundsThisBattle++;

  const playerRoll = _roll2d6();
  const playerDmg = _resolveAttack(playerRoll, d.hitReq, d.damageBonus, d.enemy.armour);
  if (playerDmg > 0) {
    d.enemy.life = Math.max(0, d.enemy.life - playerDmg);
    _appendLog(d, t('battlesim526.log.you_hit', { roll: playerRoll, enemy: _enemyNameSafe(d), n: playerDmg, life: d.enemy.life, lifeMax: d.enemy.lifeMax }));
  } else {
    _appendLog(d, t('battlesim526.log.you_miss', { roll: playerRoll }));
  }

  if (_statusOf(d.enemy.life) === 'ok') {
    const enemyRoll = _roll2d6();
    const enemyDmg = _resolveAttack(enemyRoll, d.enemy.hitReq, d.enemy.damageBonus, d.armour);
    if (enemyDmg > 0) {
      d.life = Math.max(0, d.life - enemyDmg);
      _appendLog(d, t('battlesim526.log.enemy_hits', { roll: enemyRoll, enemy: _enemyNameSafe(d), n: enemyDmg, life: d.life, lifeMax: d.lifeInitial }));
    } else {
      _appendLog(d, t('battlesim526.log.enemy_miss', { enemy: _enemyNameSafe(d), roll: enemyRoll }));
    }
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const enemyStatus = _statusOf(d.enemy.life);
  const playerStatus = _statusOf(d.life);
  if (enemyStatus === 'dead') {
    _appendLog(d, t('battlesim526.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (enemyStatus === 'unconscious') {
    _appendLog(d, t('battlesim526.log.enemy_unconscious', { enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (playerStatus === 'dead') {
    _appendLog(d, t('battlesim526.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  } else if (playerStatus === 'unconscious') {
    _appendLog(d, t('battlesim526.log.you_unconscious'));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.life = d.enemy.lifeMax;
  d.life = d.lifeInitial;
  if (d.log.length) _appendLog(d, t('battlesim526.log.reset_sep'));
  _appendLog(d, t('battlesim526.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">+${e.attack ?? 0}/${e.hp ?? '?'}LP</span></li>`
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
  _setVal('sim526-life', d.life);
  _setVal('sim526-lifemax', d.lifeInitial);
  _setVal('sim526-hitreq', d.hitReq);
  _setVal('sim526-dmgbonus', d.damageBonus);
  _setVal('sim526-armour', d.armour);
  _setVal('sim526-enemy-hitreq', d.enemy.hitReq);
  _setVal('sim526-enemy-dmgbonus', d.enemy.damageBonus);
  _setVal('sim526-enemy-armour', d.enemy.armour);
  _setVal('sim526-enemy-life', d.enemy.life);
  _setVal('sim526-enemy-lifemax', d.enemy.lifeMax);
  if (!skipEnemyPick) _setVal('sim526-enemy-pick', d.enemy.name);

  const rollBtn = document.getElementById('sim526-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim526.btn.rolled') : t('battlesim526.btn.roll');

  const status = document.getElementById('sim526-status');
  const playerStatus = _statusOf(d.life);
  const enemyStatus = _statusOf(d.enemy.life);
  if (!d.rolled) {
    status.textContent = t('battlesim526.status.not_ready');
  } else if (playerStatus === 'dead') {
    status.textContent = t('battlesim526.status.fallen');
  } else if (playerStatus === 'unconscious') {
    status.textContent = t('battlesim526.status.you_unconscious');
  } else if (enemyStatus !== 'ok' && d.enemy.lifeMax > 0) {
    status.textContent = t('battlesim526.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim526-round').disabled = !d.rolled || playerStatus !== 'ok' || enemyStatus !== 'ok';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim526-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim526-history-summary');
  const listEl = document.getElementById('sim526-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim526.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim526.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim526.history.won') : t('battlesim526.history.lost');
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

export function renderSim526() {
  const overlay = document.getElementById('sim526-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim526(); return; }
  _renderAll();
}

function openSim526() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim526-overlay').classList.add('active');
}

function closeSim526() {
  document.getElementById('sim526-overlay')?.classList.remove('active');
}

export function setSim526Visible(visible) {
  const btn = document.getElementById('sim526-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim526();
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

export function initSim526() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim526-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim526.ui.title')}</span>
        <button id="sim526-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim526.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim526-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim526.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim526.ui.life'), 'sim526-life')}
            ${_numField(t('battlesim526.ui.life_initial'), 'sim526-lifemax')}
            ${_numField(t('battlesim526.ui.hitreq'), 'sim526-hitreq')}
            ${_numField(t('battlesim526.ui.dmgbonus'), 'sim526-dmgbonus')}
            ${_numField(t('battlesim526.ui.armour'), 'sim526-armour')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim526.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim526.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim526-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim526-enemy-pick-dropdown">
                <ul id="sim526-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim526.ui.hitreq'), 'sim526-enemy-hitreq')}
            ${_numField(t('battlesim526.ui.dmgbonus'), 'sim526-enemy-dmgbonus')}
            ${_numField(t('battlesim526.ui.armour'), 'sim526-enemy-armour')}
            ${_numField(t('battlesim526.ui.enemy_life'), 'sim526-enemy-life')}
            ${_numField(t('battlesim526.ui.enemy_life_max'), 'sim526-enemy-lifemax')}
          </div>
          <div id="sim526-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim526-round" class="inv-add-btn bsim-action-primary">${t('battlesim526.btn.round')}</button>
            <button id="sim526-reset" class="inv-add-btn">${t('battlesim526.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim526-history-summary">${t('battlesim526.history.summary', { n: 0 })}</summary>
            <div id="sim526-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim526-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim526-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim526);
  document.getElementById('sim526-close').addEventListener('click', closeSim526);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim526(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim526-overlay'),
    open:  openSim526,
    close: closeSim526,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim526();
  });

  document.getElementById('sim526-round').addEventListener('click', _runRound);
  document.getElementById('sim526-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim526-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    // "Roll two dice together. Roll again, see if that's any better. Roll a
    // third time if you like, and pick whichever is best."
    d.lifeInitial = Math.max(_roll2d6(), _roll2d6(), _roll2d6());
    d.life = d.lifeInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim526.log.rolled', { life: d.lifeInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim526-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim526-enemy-pick', 'sim526-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name          = enemy.name;
    d.enemy.damageBonus    = enemy.attack ?? 0;
    d.enemy.life           = enemy.hp ?? 0;
    d.enemy.lifeMax        = enemy.hp ?? 0;
    d.enemy.hitReq          = DEFAULT_HIT_REQ;
    d.enemy.armour          = 0;
    d.roundsThisBattle     = 0;
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim526-life': ['life'], 'sim526-lifemax': ['lifeInitial'],
    'sim526-hitreq': ['hitReq'], 'sim526-dmgbonus': ['damageBonus'], 'sim526-armour': ['armour'],
    'sim526-enemy-hitreq': ['enemy', 'hitReq'], 'sim526-enemy-dmgbonus': ['enemy', 'damageBonus'], 'sim526-enemy-armour': ['enemy', 'armour'],
    'sim526-enemy-life': ['enemy', 'life'], 'sim526-enemy-lifemax': ['enemy', 'lifeMax'],
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
