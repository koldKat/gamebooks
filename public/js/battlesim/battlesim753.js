// ── Battle Simulator (Вълшебната тетива, book 753) ──────────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 753 only) by the caller in boot.js via
// setSim753Visible().
// To remove: delete this file, remove its import line and initSim753()/
// setSim753Visible() calls from boot.js, remove 'sim753' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim753-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim753-btn selectors in
// battlesim.css.
//
// This book (unlike most books audited around it this session) has a real
// reader-facing dice combat system, fully documented in the book's own
// epizod 5 ("НЕОБИЧАЙНА СХЕМА ЗА ПРОВЕЖДАНЕ НА БИТКИ"). It is NOT the usual
// Fighting Fantasy SKILL/STAMINA/LUCK shape reused by every other sim in
// this app - it is asymmetric:
//   - Троловият удар (player hit): ATAKA (player.attack + 2d6) compared to
//     enemy DEFENSE. If greater, that's ONE successful hit, just a binary
//     counter - it does not do variable damage. The troll wins once he has
//     landed the number of successful hits the fight calls for (1-6,
//     varies per enemy, entered as "hits needed").
//   - Противников удар (enemy hit): enemy ATAKA (enemy.attack + 2d6)
//     compared to player DEFENSE. The excess, if positive, is added to the
//     troll's own cumulative ПОРАЖЕНИЯ (damage) pool. The troll loses if
//     that pool reaches 24 before he lands enough hits.
// There is no enemy "life bar" concept at all in this book's own rules -
// book_enemies.hp is repurposed here to hold "hits needed to win" (not a
// wound pool), and book_enemies.pb holds "enemy strikes per round" (most
// fights are 1, the two soldier fights are 2 - "нанасят по два
// последователни удара").
//
// No formal starting-stat generation rules were found anywhere in the
// book's numbered episodes (СИЛА/ИЗДРЪЖЛИВОСТ/БЪРЗИНА appear to live only
// on the printed character-sheet pages, which aren't part of book_sections)
// - ATAKA and ЗАЩИТА are freely editable fields with no roll button, same
// fallback this app uses for books without formal stat-rolling. This also
// matches the book's own text, where ATAKA/ЗАЩИТА are recomputed by hand
// for nearly every fight from SILA + weapon weight + grip choice (one-
// handed vs two-handed changes both numbers), so a fixed roll would be
// wrong anyway - the player is expected to edit these before every fight.
//
// Full roster (verified via a complete read of all 290 sections this
// session): weak royal soldiers (§7, 6 of them, hitsNeeded 2, 2 strikes/
// round), strong royal soldiers (§211, 12 of them, hitsNeeded 6, 2 strikes/
// round), Дуъргар as a fire-club wielder (§109, hitsNeeded 2, or 1 with
// magical code ТЕТИВА - edit by hand), Дуъргар as a beast (§119, hitsNeeded
// 4, or 2 with ТЕТИВА), the blatna-dух grappler (§242, hitsNeeded 1, player
// ЗАЩИТА is fixed at 6 for this specific fight per the book's own text -
// edit by hand), Грендъл the giant (§260/267/270, hitsNeeded 3, base
// ATAKA/ЗАЩИТА 24/24 with situational +4 ATAKA/-8 ЗАЩИТА if the troll has
// set trap code ЯМА, a variable adjustment if he has code БЪЧВА, or ЗАЩИТА
// forced to 12 if he has code ЛЪК - all "apply by hand" since these are
// one-off narrative modifiers, same precedent as every other sim's book-
// specific exceptions), Френир normal (§281, hitsNeeded 2) and Френир
// enraged (§282, hitsNeeded 4, only reachable if the troll skipped the
// Shlemat-na-uzhasa item that auto-defeats this fight narratively - not
// modeled, see below), and Кобалди dwarves (§279, hitsNeeded 1 - landing a
// single hit routs them - enemy count varies 8/12/24 by situational code,
// and crucially has NO БОЕН КОД arithmetic and a unique "random strikes per
// round" mechanic: each round the enemy's strike count is the difference
// between two separate 2d6 rolls, not a fixed number. A "Кобалди режим"
// checkbox switches strikesPerRound to that dice-difference formula for
// this one fight; every other fight uses a plain fixed strikesPerRound.
//
// Deliberately NOT modeled, matching this app's existing precedent for
// mechanics too narratively bespoke to fit a generic ATAKA/ЗАЩИТА resolver:
// Брок the stone beast (§115-137) - a multi-stage skill-check encounter
// (troll SILA+weapon vs a table-roll threshold, then a follow-up table roll
// deciding whether Brok flees, dies, or the troll must repeat the check)
// with no ATAKA/ЗАЩИТА numbers printed anywhere in its own text; and the
// Shlemat-na-uzhasa auto-win against enraged Fenrir at §285 (instant
// narrative victory, no roll at all - if the troll has that item, he never
// reaches the §282 dice fight in the first place).
//
// All state lives in pt.sim753, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const DAMAGE_CAP = 24;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim753) {
    pt.sim753 = {
      player: { attack: 0, defense: 0, damage: 0 },
      enemy: { name: '', attack: 0, defense: 0, hitsNeeded: 1, hitsLanded: 0, strikesPerRound: 1 },
      kobaldiMode: false,
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim753;
  if (!d.player) d.player = { attack: 0, defense: 0, damage: 0 };
  if (d.player.damage === undefined) d.player.damage = 0;
  if (!d.enemy) d.enemy = { name: '', attack: 0, defense: 0, hitsNeeded: 1, hitsLanded: 0, strikesPerRound: 1 };
  if (d.enemy.hitsNeeded === undefined) d.enemy.hitsNeeded = 1;
  if (d.enemy.hitsLanded === undefined) d.enemy.hitsLanded = 0;
  if (d.enemy.strikesPerRound === undefined) d.enemy.strikesPerRound = 1;
  if (d.kobaldiMode === undefined) d.kobaldiMode = false;
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

function _playerWon(d) { return d.enemy.hitsNeeded > 0 && d.enemy.hitsLanded >= d.enemy.hitsNeeded; }
function _playerLost(d) { return d.player.damage >= DAMAGE_CAP; }
function _battleOver(d) { return _playerWon(d) || _playerLost(d); }

function _resetEncounterKnobs(d) {
  d.enemy.strikesPerRound = 1;
  d.kobaldiMode = false;
}

// Uncapped lifetime log - the admin dashboard aggregates battle counts
// app-wide from this array, so per-user history needs to be a true lifetime
// total, not a rolling window.
function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerDamage: d.player.damage, damageCap: DAMAGE_CAP,
    ts: Date.now(),
  });
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _runRound() {
  const d = _data();
  if (!d || _battleOver(d) || !d.enemy.hitsNeeded) return;
  d.roundsThisBattle++;

  // Троловият удар: binary hit counter, not variable damage.
  const playerAS = d.player.attack + _roll2d6();
  if (playerAS > d.enemy.defense) {
    d.enemy.hitsLanded++;
    _appendLog(d, t('battlesim753.log.you_hit', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), n: d.enemy.hitsLanded, needed: d.enemy.hitsNeeded }));
  } else {
    _appendLog(d, t('battlesim753.log.you_miss', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d) }));
  }

  if (_playerWon(d)) {
    _appendLog(d, t('battlesim753.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    saveState();
    _renderAll();
    return;
  }

  // Противниковите удари: excess over player DEFENSE accumulates toward
  // the 24-point damage cap. Kobaldi mode overrides the fixed
  // strikesPerRound with the book's own dice-difference formula.
  const strikes = d.kobaldiMode
    ? Math.abs(_roll2d6() - _roll2d6())
    : Math.max(1, d.enemy.strikesPerRound || 1);

  for (let i = 0; i < strikes && !_playerLost(d); i++) {
    const enemyAS = d.enemy.attack + _roll2d6();
    const dmg = Math.max(0, enemyAS - d.player.defense);
    if (dmg > 0) {
      d.player.damage = Math.min(DAMAGE_CAP, d.player.damage + dmg);
      _appendLog(d, t('battlesim753.log.enemy_hits', { enemy: _enemyNameSafe(d), enemyAS, n: dmg, damage: d.player.damage, cap: DAMAGE_CAP }));
    } else {
      _appendLog(d, t('battlesim753.log.enemy_miss', { enemy: _enemyNameSafe(d), enemyAS }));
    }
  }

  if (_playerLost(d)) {
    _appendLog(d, t('battlesim753.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.hitsLanded = 0;
  d.player.damage = 0;
  d.roundsThisBattle = 0;
  if (d.log.length) _appendLog(d, t('battlesim753.log.reset_sep'));
  _appendLog(d, t('battlesim753.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim753-status');
  if (!d || !el) return;
  const hasEnemy = d.enemy.hitsNeeded > 0;
  if (_playerLost(d))                el.innerHTML = t('battlesim753.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && _playerWon(d)) el.innerHTML = t('battlesim753.status.victory', { trophy: SVG_TROPHY });
  else                                el.innerHTML = '';
  document.getElementById('sim753-round').disabled = _battleOver(d);
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim753-history-summary');
  const listEl = document.getElementById('sim753-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim753.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim753.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim753.history.won') : t('battlesim753.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">ПОРАЖЕНИЯ ${h.playerDamage}/${h.damageCap} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim753-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim753-player-attack').value  = d.player.attack;
  document.getElementById('sim753-player-defense').value = d.player.defense;
  document.getElementById('sim753-player-damage').value  = d.player.damage;

  document.getElementById('sim753-enemy-pick').value   = d.enemy.name;
  document.getElementById('sim753-enemy-attack').value  = d.enemy.attack;
  document.getElementById('sim753-enemy-defense').value = d.enemy.defense;
  document.getElementById('sim753-enemy-hitsneeded').value = d.enemy.hitsNeeded;
  document.getElementById('sim753-enemy-hitslanded').value = d.enemy.hitsLanded;
  document.getElementById('sim753-enemy-strikes').value    = d.enemy.strikesPerRound;
  document.getElementById('sim753-kobaldi').checked = d.kobaldiMode;
  document.getElementById('sim753-enemy-strikes-row').style.display = d.kobaldiMode ? 'none' : '';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim753() {
  const overlay = document.getElementById('sim753-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim753(); return; }
  _renderAll();
}

function openSim753() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim753-overlay').classList.add('active');
}

function closeSim753() {
  document.getElementById('sim753-overlay')?.classList.remove('active');
}

export function setSim753Visible(visible) {
  const btn = document.getElementById('sim753-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim753();
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">АТАКА:${e.attack ?? '?'} ЗАЩИТА:${e.defense ?? '?'} УДАРИ:${e.hp ?? '?'}</span></li>`
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

export function initSim753() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim753-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim753.ui.title')}</span>
        <button id="sim753-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim753.ui.you')}</div>
            ${_numField(t('battlesim753.ui.attack'), 'sim753-player-attack')}
            ${_numField(t('battlesim753.ui.defense'), 'sim753-player-defense')}
            ${_numField(t('battlesim753.ui.damage'), 'sim753-player-damage')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim753.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim753.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim753-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim753-enemy-pick-dropdown">
                <ul id="sim753-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim753.ui.attack'), 'sim753-enemy-attack')}
            ${_numField(t('battlesim753.ui.defense'), 'sim753-enemy-defense')}
            ${_numField(t('battlesim753.ui.hits_needed'), 'sim753-enemy-hitsneeded')}
            ${_numField(t('battlesim753.ui.hits_landed'), 'sim753-enemy-hitslanded')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim753.ui.kobaldi_mode')}</span>
              <input id="sim753-kobaldi" type="checkbox">
            </div>
            <div id="sim753-enemy-strikes-row">
              ${_numField(t('battlesim753.ui.strikes_per_round'), 'sim753-enemy-strikes')}
            </div>
          </div>
          <div id="sim753-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim753-round" class="inv-add-btn bsim-action-primary">${t('battlesim753.btn.round')}</button>
            <button id="sim753-reset" class="inv-add-btn">${t('battlesim753.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim753-history-summary">${t('battlesim753.history.summary', { n: 0 })}</summary>
            <div id="sim753-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim753-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim753-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim753);
  document.getElementById('sim753-close').addEventListener('click', closeSim753);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim753(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim753-overlay'),
    open:  openSim753,
    close: closeSim753,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim753();
  });

  document.getElementById('sim753-round').addEventListener('click', _runRound);
  document.getElementById('sim753-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim753-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim753-kobaldi').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.kobaldiMode = e.target.checked;
    saveState();
    _renderInputs();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim753-player-attack':     ['player', 'attack'],
    'sim753-player-defense':    ['player', 'defense'],
    'sim753-player-damage':     ['player', 'damage'],
    'sim753-enemy-attack':      ['enemy', 'attack'],
    'sim753-enemy-defense':     ['enemy', 'defense'],
    'sim753-enemy-hitsneeded':  ['enemy', 'hitsNeeded'],
    'sim753-enemy-hitslanded':  ['enemy', 'hitsLanded'],
    'sim753-enemy-strikes':     ['enemy', 'strikesPerRound'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = Math.max(0, val);
    if (id === 'sim753-player-damage') val = Math.min(val, DAMAGE_CAP);
    if (id === 'sim753-enemy-hitslanded') val = Math.min(val, d.enemy.hitsNeeded || val);
    d[map[0]][map[1]] = val;
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim753-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim753-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const next = Math.max(0, Number(input.value) || 0) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim753-enemy-pick', 'sim753-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name = enemy.name;
    _resetEncounterKnobs(d);
    if (enemy.attack != null)  d.enemy.attack = enemy.attack;
    if (enemy.defense != null) d.enemy.defense = enemy.defense;
    if (enemy.hp != null)      d.enemy.hitsNeeded = enemy.hp;
    if (enemy.pb != null)      d.enemy.strikesPerRound = enemy.pb;
    d.enemy.hitsLanded = 0;
    d.player.damage = 0;
    d.roundsThisBattle = 0;
    saveState();
    _renderAll();
  });
}
