// ── Battle Simulator (Terrors Out of Time, book 541) ─────────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 541 only) by the caller in boot.js via
// setSim541Visible().
// To remove: delete this file, remove its import line and initSim541()/
// setSim541Visible() calls from boot.js, remove 'sim541' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim541-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim541-btn selectors in
// battlesim.css.
//
// This is NOT a Fighting Fantasy SKILL/STAMINA/LUCK book. It's a
// Lovecraftian investigator game with five attributes (Strength, Stamina,
// Mentality, Endurance, Dexterity) and a "Conflict Table" resolver: your
// attacking attribute rating is cross-indexed against the opponent's
// matching defending attribute rating to get a new 2d6 target number
// (roll <= target succeeds; the table's own edges collapse to an
// automatic success/failure, printed as "A"/"-"). The book's own worked
// example (Strength 7 vs opponent Strength 8 -> target 6) was used to
// verify the transcription below, read directly from the source PDF's
// Conflict Table (pp. attached to the "Combat" rules section), not
// reconstructed from memory: the table's values are exactly
//   7 + attacker - defender - (attacker > defender ? 1 : 0),
//   clamped to '-' below 2 and 'A' above 11.
// Weapons have a "STA damage / END damage" factor (book's own style,
// e.g. "Club 3/-"); fists are 2/0. Rolling double-1 on the 2d6 doubles
// that hit's damage, per the book's own rule, for both sides.
//
// The book's actual combat isn't a uniform repeatable round - nearly
// every encounter is a bespoke, narrative, single Conflict Table check
// (a lock, a grapple, a specific creature ability), and few of them
// describe a genuine back-and-forth duel. This sim generalizes the
// reusable core (attacker rolls vs Conflict Table, hit applies weapon
// damage; if the enemy survives it attacks back the same way) into a
// repeatable round, which is a simplification of the book's own more
// varied, per-encounter presentation - same precedent as this app's
// other bespoke sims (e.g. book 753's ATAKA/ЗАЩИТА generalization).
// The player picks which attribute (Strength/Dexterity/Mentality) is
// being tested each round, matching the book's "match your X against
// its X" phrasing; STAMINA and ENDURANCE are the two health pools, per
// the book's own Insanity and Death rules (either reaching 0 ends the
// adventure).
//
// 24 roster entries seeded into book_enemies from a full-book scan
// (name records which attribute was being tested, since encounters here
// give a single contextual value rather than a full FF-style stat
// block - there is no uniform monster stat block format in this book).
//
// All state lives in pt.sim541, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _conflictTarget(attacker, defender) {
  const raw = 7 + attacker - defender - (attacker > defender ? 1 : 0);
  if (raw < 2) return '-';
  if (raw > 11) return 'A';
  return raw;
}

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim541) {
    pt.sim541 = {
      player: {
        strength: 0, dexterity: 0, mentality: 0,
        stamina: 0, staminaInitial: 0,
        endurance: 0, enduranceInitial: 0,
        weaponSta: 2, weaponEnd: 0,
      },
      attribute: 'strength',
      enemy: { name: '', value: 0, sta: 0, staMax: 0, end: 0, endMax: 0, weaponSta: 2, weaponEnd: 0 },
      rolled: false,
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim541;
  if (d.rolled === undefined) d.rolled = false;
  if (!d.attribute) d.attribute = 'strength';
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  if (d.player.weaponSta === undefined) d.player.weaponSta = 2;
  if (d.player.weaponEnd === undefined) d.player.weaponEnd = 0;
  if (!d.enemy) d.enemy = { name: '', value: 0, sta: 0, staMax: 0, end: 0, endMax: 0, weaponSta: 2, weaponEnd: 0 };
  if (d.enemy.weaponSta === undefined) d.enemy.weaponSta = 2;
  if (d.enemy.weaponEnd === undefined) d.enemy.weaponEnd = 0;
  if (d.enemy.end === undefined) d.enemy.end = 0;
  if (d.enemy.endMax === undefined) d.enemy.endMax = 0;
  return d;
}

function _notReady(d) { return !d.rolled; }
function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }
function _roll2d6pair() { return [_roll1d6(), _roll1d6()]; }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _playerAttr(d) { return d.player[d.attribute]; }

function _enemyDefeated(d) { return (d.enemy.staMax > 0 || d.enemy.endMax > 0) && (d.enemy.sta <= 0 || d.enemy.end <= 0); }
function _playerDefeated(d) { return d.rolled && (d.player.stamina <= 0 || d.player.endurance <= 0); }
function _hasEnemy(d) { return d.enemy.staMax > 0 || d.enemy.endMax > 0; }
function _battleOver(d) { return _notReady(d) || _playerDefeated(d) || (_hasEnemy(d) && _enemyDefeated(d)); }

function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerStamina: d.player.stamina, playerStaminaMax: d.player.staminaInitial,
    playerEndurance: d.player.endurance, playerEnduranceMax: d.player.enduranceInitial,
    ts: Date.now(),
  });
}

function _applyDamage(target, staKey, staMaxKey, endKey, endMaxKey, staDmg, endDmg, doubled) {
  const mult = doubled ? 2 : 1;
  if (staDmg) target[staKey] = Math.max(0, target[staKey] - staDmg * mult);
  if (endDmg) target[endKey] = Math.max(0, target[endKey] - endDmg * mult);
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _runRound() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  d.roundsThisBattle++;

  // Player attacks.
  const pTarget = _conflictTarget(_playerAttr(d), d.enemy.value);
  const [pd1, pd2] = _roll2d6pair();
  const pRoll = pd1 + pd2;
  const pDouble1 = pd1 === 1 && pd2 === 1;
  const pSuccess = pTarget === 'A' || (pTarget !== '-' && pRoll <= pTarget);
  if (pSuccess) {
    _applyDamage(d.enemy, 'sta', 'staMax', 'end', 'endMax', d.player.weaponSta, d.player.weaponEnd, pDouble1);
    _appendLog(d, t('battlesim541.log.you_hit', {
      round: d.roundsThisBattle, target: pTarget, roll: pRoll, enemy: _enemyNameSafe(d),
      sta: d.enemy.sta, staMax: d.enemy.staMax, end: d.enemy.end, endMax: d.enemy.endMax,
    }));
  } else {
    _appendLog(d, t('battlesim541.log.you_miss', { round: d.roundsThisBattle, target: pTarget, roll: pRoll, enemy: _enemyNameSafe(d) }));
  }

  if (_hasEnemy(d) && _enemyDefeated(d)) {
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim541.log.defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
    saveState();
    _renderAll();
    return;
  }

  // Enemy attacks back (Conflict Table is symmetric - swap attacker/defender).
  const eTarget = _conflictTarget(d.enemy.value, _playerAttr(d));
  const [ed1, ed2] = _roll2d6pair();
  const eRoll = ed1 + ed2;
  const eDouble1 = ed1 === 1 && ed2 === 1;
  const eSuccess = eTarget === 'A' || (eTarget !== '-' && eRoll <= eTarget);
  if (eSuccess) {
    _applyDamage(d.player, 'stamina', 'staminaInitial', 'endurance', 'enduranceInitial', d.enemy.weaponSta, d.enemy.weaponEnd, eDouble1);
    _appendLog(d, t('battlesim541.log.enemy_hits', {
      enemy: _enemyNameSafe(d), target: eTarget, roll: eRoll,
      stamina: d.player.stamina, staminaMax: d.player.staminaInitial,
      endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial,
    }));
  } else {
    _appendLog(d, t('battlesim541.log.enemy_miss', { enemy: _enemyNameSafe(d), target: eTarget, roll: eRoll }));
  }

  if (_playerDefeated(d)) {
    _appendLog(d, `${SVG_SKULL} ${t('battlesim541.log.fallen')}`);
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.sta = d.enemy.staMax;
  d.enemy.end = d.enemy.endMax;
  d.player.stamina = d.player.staminaInitial;
  d.player.endurance = d.player.enduranceInitial;
  d.roundsThisBattle = 0;
  if (d.log.length) _appendLog(d, t('battlesim541.log.reset_sep'));
  _appendLog(d, t('battlesim541.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim541-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  if (notReady)                                  el.innerHTML = t('battlesim541.status.not_ready');
  else if (_playerDefeated(d))                   el.innerHTML = `${SVG_SKULL} ${t('battlesim541.status.fallen')}`;
  else if (_hasEnemy(d) && _enemyDefeated(d))    el.innerHTML = `${SVG_TROPHY} ${t('battlesim541.status.victory')}`;
  else                                            el.innerHTML = '';
  document.getElementById('sim541-round').disabled = _battleOver(d);
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim541-history-summary');
  const listEl = document.getElementById('sim541-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim541.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim541.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim541.history.won') : t('battlesim541.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STA ${h.playerStamina}/${h.playerStaminaMax} · END ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim541-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim541-player-strength').value  = d.player.strength;
  document.getElementById('sim541-player-dexterity').value = d.player.dexterity;
  document.getElementById('sim541-player-mentality').value = d.player.mentality;
  document.getElementById('sim541-player-stamina').value      = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim541-player-staminamax').value   = d.player.staminaInitial;
  document.getElementById('sim541-player-endurance').value    = Math.min(d.player.endurance, d.player.enduranceInitial);
  document.getElementById('sim541-player-endurancemax').value = d.player.enduranceInitial;
  document.getElementById('sim541-player-weaponsta').value = d.player.weaponSta;
  document.getElementById('sim541-player-weaponend').value = d.player.weaponEnd;
  document.getElementById('sim541-attribute').value = d.attribute;

  const rollBtn = document.getElementById('sim541-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim541.btn.rolled') : t('battlesim541.btn.roll');

  document.getElementById('sim541-enemy-pick').value = d.enemy.name;
  document.getElementById('sim541-enemy-value').value = d.enemy.value;
  document.getElementById('sim541-enemy-sta').value    = Math.min(d.enemy.sta, d.enemy.staMax);
  document.getElementById('sim541-enemy-stamax').value = d.enemy.staMax;
  document.getElementById('sim541-enemy-end').value    = Math.min(d.enemy.end, d.enemy.endMax);
  document.getElementById('sim541-enemy-endmax').value = d.enemy.endMax;
  document.getElementById('sim541-enemy-weaponsta').value = d.enemy.weaponSta;
  document.getElementById('sim541-enemy-weaponend').value = d.enemy.weaponEnd;

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim541() {
  const overlay = document.getElementById('sim541-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim541(); return; }
  _renderAll();
}

function openSim541() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim541-overlay').classList.add('active');
}

function closeSim541() {
  document.getElementById('sim541-overlay')?.classList.remove('active');
}

export function setSim541Visible(visible) {
  const btn = document.getElementById('sim541-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim541();
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

function _setupEnemyAutocomplete() {
  const input    = document.getElementById('sim541-enemy-pick');
  const dropdown = document.getElementById('sim541-enemy-pick-dropdown');
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
      `<li role="option" id="sim541-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${e.attack ?? '?'}</span></li>`
    ).join('');
    activeIdx = -1;
    dropdown.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
  }

  function select(enemy) {
    const d = _data();
    if (!d || !enemy) return;
    input.value = enemy.name;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.value = enemy.attack;
    d.roundsThisBattle = 0;
    closeDropdown();
    saveState();
    _renderAll();
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

export function initSim541() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim541-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim541-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim541.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim541-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim541.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim541.ui.strength'), 'sim541-player-strength')}
            ${_numField(t('battlesim541.ui.dexterity'), 'sim541-player-dexterity')}
            ${_numField(t('battlesim541.ui.mentality'), 'sim541-player-mentality')}
            ${_numField(t('battlesim541.ui.stamina'), 'sim541-player-stamina')}
            ${_numField(t('battlesim541.ui.stamina_initial'), 'sim541-player-staminamax')}
            ${_numField(t('battlesim541.ui.endurance'), 'sim541-player-endurance')}
            ${_numField(t('battlesim541.ui.endurance_initial'), 'sim541-player-endurancemax')}
            ${_numField(t('battlesim541.ui.weapon_sta'), 'sim541-player-weaponsta')}
            ${_numField(t('battlesim541.ui.weapon_end'), 'sim541-player-weaponend')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim541.ui.attribute')}</span>
              <select id="sim541-attribute" class="inv-edit-input">
                <option value="strength">${t('battlesim541.ui.strength')}</option>
                <option value="dexterity">${t('battlesim541.ui.dexterity')}</option>
                <option value="mentality">${t('battlesim541.ui.mentality')}</option>
              </select>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim541.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim541.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim541-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim541-enemy-pick-dropdown">
                <ul id="sim541-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim541.ui.enemy_value'), 'sim541-enemy-value')}
            ${_numField(t('battlesim541.ui.stamina'), 'sim541-enemy-sta')}
            ${_numField(t('battlesim541.ui.stamina_max'), 'sim541-enemy-stamax')}
            ${_numField(t('battlesim541.ui.endurance'), 'sim541-enemy-end')}
            ${_numField(t('battlesim541.ui.endurance_max'), 'sim541-enemy-endmax')}
            ${_numField(t('battlesim541.ui.weapon_sta'), 'sim541-enemy-weaponsta')}
            ${_numField(t('battlesim541.ui.weapon_end'), 'sim541-enemy-weaponend')}
          </div>
          <div id="sim541-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim541-round" class="inv-add-btn bsim-action-primary">${t('battlesim541.btn.round')}</button>
            <button id="sim541-reset" class="inv-add-btn">${t('battlesim541.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim541-history-summary">${t('battlesim541.history.summary', { n: 0 })}</summary>
            <div id="sim541-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim541-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim541-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim541);
  document.getElementById('sim541-close').addEventListener('click', closeSim541);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim541(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim541-overlay'),
    open:  openSim541,
    close: closeSim541,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim541();
  });

  document.getElementById('sim541-round').addEventListener('click', _runRound);
  document.getElementById('sim541-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim541-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.strength  = _roll1d6() + 3;
    d.player.dexterity = _roll1d6() + 3;
    d.player.mentality = _roll1d6() + 3;
    d.player.staminaInitial   = d.player.strength * 2;
    d.player.enduranceInitial = d.player.mentality * 2;
    d.player.stamina   = d.player.staminaInitial;
    d.player.endurance = d.player.enduranceInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim541.log.rolled', {
      strength: d.player.strength, dexterity: d.player.dexterity, mentality: d.player.mentality,
      stamina: d.player.staminaInitial, endurance: d.player.enduranceInitial,
    }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim541-attribute').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.attribute = e.target.value;
    saveState();
  });

  document.getElementById('sim541-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim541-player-strength':    ['player', 'strength'],
    'sim541-player-dexterity':   ['player', 'dexterity'],
    'sim541-player-mentality':   ['player', 'mentality'],
    'sim541-player-stamina':     ['player', 'stamina'],
    'sim541-player-staminamax':  ['player', 'staminaInitial'],
    'sim541-player-endurance':   ['player', 'endurance'],
    'sim541-player-endurancemax':['player', 'enduranceInitial'],
    'sim541-player-weaponsta':   ['player', 'weaponSta'],
    'sim541-player-weaponend':   ['player', 'weaponEnd'],
    'sim541-enemy-value':        ['enemy', 'value'],
    'sim541-enemy-sta':          ['enemy', 'sta'],
    'sim541-enemy-stamax':       ['enemy', 'staMax'],
    'sim541-enemy-end':          ['enemy', 'end'],
    'sim541-enemy-endmax':       ['enemy', 'endMax'],
    'sim541-enemy-weaponsta':    ['enemy', 'weaponSta'],
    'sim541-enemy-weaponend':    ['enemy', 'weaponEnd'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = Math.max(0, val);
    if (id === 'sim541-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim541-player-endurance') val = Math.min(val, d.player.enduranceInitial);
    if (id === 'sim541-enemy-sta') val = Math.min(val, d.enemy.staMax);
    if (id === 'sim541-enemy-end') val = Math.min(val, d.enemy.endMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim541-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim541-player-endurancemax') d.player.endurance = Math.min(d.player.endurance, val);
    if (id === 'sim541-enemy-stamax') d.enemy.sta = Math.min(d.enemy.sta, val);
    if (id === 'sim541-enemy-endmax') d.enemy.end = Math.min(d.enemy.end, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim541-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim541-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete();
}
