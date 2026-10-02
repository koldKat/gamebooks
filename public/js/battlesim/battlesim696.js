// ── Battle Simulator (Вампирите на Флавия: Вкусът на кръвта, book 696) ───────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 696 only) by the caller in boot.js via
// setSim696Visible().
// To remove: delete this file, remove its import line and initSim696()/
// setSim696Visible() calls from boot.js, remove 'sim696' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim696-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim696-btn selectors in
// battlesim.css.
//
// This book has its own fully-specified combat system, transcribed
// directly from the book's own "СИТУАЦИИ / Обикновена схватка" (ordinary
// combat) rules section (also present as the frontmatter's own
// character-sheet stat block: Сила/Бързина/Издръжливост/Рефлекс,
// Наблюдателност/Съобразителност/Вяра, Атака/Защита/Ловкост, Живот):
//   1. Strike value  = Шанс + Сила + Атака (attacker's roll + Strength + Attack)
//   2. Defense value = Шанс + Рефлекс + Защита (defender's roll + Reflex + Defense)
//   3. If Defense > Strike: the blow fails and the defender becomes the
//      attacker for the next exchange (no damage).
//      If Defense is between Strike and Strike-2 (inclusive): minor damage.
//      If Defense < Strike-2: major damage.
//   4. Minor damage = Strike - (Шанс + Издръжливост); Major damage =
//      Strike - Издръжливост. Damage is subtracted from Живот (Life/HP).
//   5. The loser of that exchange defends next; roles alternate every
//      round this way (the book's own "Ответен удар: към 2" - "counter-
//      strike: to step 2").
// "Шанс" (Chance) is a per-roll random value the book uses throughout
// (e.g. "трикратен шанс" = "triple Chance" elsewhere in the text) but
// never explicitly states the die size anywhere in the extractable
// text - this sim assumes 1d6, matching every other book in this app's
// die convention, and this is flagged here rather than silently assumed:
// if actual play shows otherwise, only _rollChance() needs to change.
// Weapon Атака/Защита/Боравене add to the wielder's own ratings per the
// book's own "ИЗПОЛЗВАНЕ НА ОРЪЖИЯ" rule (Боравене is not modeled here,
// it only matters for the book's multi-opponent turn-order rule, which
// this sim doesn't simulate - it's a single-opponent duel convenience,
// matching every other sim in this app).
//
// 18 creatures from the book's own "КАТАЛОГ НА СЪЩЕСТВАТА" seeded into
// book_enemies (attack=Атака, defense=Защита, hp=Живот, pb=Издръжливост -
// Сила/Бързина/Рефлекс aren't in the 4-column schema and default to 0,
// editable by hand from the same catalog if needed for a specific fight).
//
// All state lives in pt.sim696, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../core/state.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _rollChance() { return 1 + Math.floor(Math.random() * 6); }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim696) {
    pt.sim696 = {
      player: {
        sila: 0, refleks: 0, izdrazhlivost: 0,
        life: 0, lifeInitial: 0,
        ataka: 0, zashtita: 0,
      },
      enemy: { name: '', sila: 0, refleks: 0, izdrazhlivost: 0, life: 0, lifeMax: 0, ataka: 0, zashtita: 0 },
      attackerIsPlayer: true,
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim696;
  if (d.attackerIsPlayer === undefined) d.attackerIsPlayer = true;
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

function _hasEnemy(d) { return d.enemy.lifeMax > 0; }
function _playerDefeated(d) { return d.player.lifeInitial > 0 && d.player.life <= 0; }
function _enemyDefeated(d)  { return _hasEnemy(d) && d.enemy.life <= 0; }
function _battleOver(d) { return d.player.lifeInitial <= 0 || _playerDefeated(d) || (_hasEnemy(d) && _enemyDefeated(d)); }

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: _enemyName(d), outcome, playerLife: d.player.life, playerLifeMax: d.player.lifeInitial, ts: Date.now() });
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _runRound() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  d.roundsThisBattle++;

  const attacker = d.attackerIsPlayer ? d.player : d.enemy;
  const defender = d.attackerIsPlayer ? d.enemy : d.player;
  const attackerName = d.attackerIsPlayer ? t('battlesim696.ui.you') : _enemyNameSafe(d);
  const defenderName = d.attackerIsPlayer ? _enemyNameSafe(d) : t('battlesim696.ui.you');

  const strikeChance = _rollChance();
  const strike = strikeChance + attacker.sila + attacker.ataka;
  const defenseChance = _rollChance();
  const defense = defenseChance + defender.refleks + defender.zashtita;

  if (defense > strike) {
    _appendLog(d, t('battlesim696.log.fails', { round: d.roundsThisBattle, attacker: attackerName, strike, defender: defenderName, defense }));
  } else {
    const minor = defense >= strike - 2;
    const dmg = minor ? Math.max(0, strike - (strikeChance + defender.izdrazhlivost)) : Math.max(0, strike - defender.izdrazhlivost);
    defender.life = Math.max(0, defender.life - dmg);
    _appendLog(d, t(minor ? 'battlesim696.log.minor_hit' : 'battlesim696.log.major_hit', {
      round: d.roundsThisBattle, attacker: attackerName, strike, defender: defenderName, defense, dmg,
      life: defender.life, lifeMax: d.attackerIsPlayer ? d.enemy.lifeMax : d.player.lifeInitial,
    }));
  }

  if (_hasEnemy(d) && _enemyDefeated(d)) {
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim696.log.defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  } else if (_playerDefeated(d)) {
    _appendLog(d, `${SVG_SKULL} ${t('battlesim696.log.fallen')}`);
    _recordOutcome(d, 'loss');
  } else {
    // "Ответен удар: към 2" - the loser of this exchange defends next,
    // i.e. roles swap unless the blow failed outright (attacker keeps
    // trying, per the book's own step 3.1 sending failed blows back to
    // step 2 with the same attacker).
    if (defense <= strike) d.attackerIsPlayer = !d.attackerIsPlayer;
  }

  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.life = d.enemy.lifeMax;
  d.player.life = d.player.lifeInitial;
  d.attackerIsPlayer = true;
  d.roundsThisBattle = 0;
  if (d.log.length) _appendLog(d, t('battlesim696.log.reset_sep'));
  _appendLog(d, t('battlesim696.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim696-status');
  if (!d || !el) return;
  const notReady = d.player.lifeInitial <= 0;
  if (notReady)                                  el.innerHTML = t('battlesim696.status.not_ready');
  else if (_playerDefeated(d))                   el.innerHTML = `${SVG_SKULL} ${t('battlesim696.status.fallen')}`;
  else if (_hasEnemy(d) && _enemyDefeated(d))    el.innerHTML = `${SVG_TROPHY} ${t('battlesim696.status.victory')}`;
  else                                            el.innerHTML = '';
  document.getElementById('sim696-round').disabled = _battleOver(d);
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim696-history-summary');
  const listEl = document.getElementById('sim696-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim696.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim696.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim696.history.won') : t('battlesim696.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim696.ui.life')} ${h.playerLife}/${h.playerLifeMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim696-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim696-player-sila').value    = d.player.sila;
  document.getElementById('sim696-player-refleks').value = d.player.refleks;
  document.getElementById('sim696-player-izdrazhlivost').value = d.player.izdrazhlivost;
  document.getElementById('sim696-player-ataka').value   = d.player.ataka;
  document.getElementById('sim696-player-zashtita').value = d.player.zashtita;
  document.getElementById('sim696-player-life').value     = Math.min(d.player.life, d.player.lifeInitial);
  document.getElementById('sim696-player-lifemax').value  = d.player.lifeInitial;

  document.getElementById('sim696-enemy-pick').value  = d.enemy.name;
  document.getElementById('sim696-enemy-sila').value    = d.enemy.sila;
  document.getElementById('sim696-enemy-refleks').value = d.enemy.refleks;
  document.getElementById('sim696-enemy-izdrazhlivost').value = d.enemy.izdrazhlivost;
  document.getElementById('sim696-enemy-ataka').value   = d.enemy.ataka;
  document.getElementById('sim696-enemy-zashtita').value = d.enemy.zashtita;
  document.getElementById('sim696-enemy-life').value    = Math.min(d.enemy.life, d.enemy.lifeMax);
  document.getElementById('sim696-enemy-lifemax').value = d.enemy.lifeMax;

  document.getElementById('sim696-turn').textContent = d.attackerIsPlayer
    ? t('battlesim696.ui.turn_you')
    : t('battlesim696.ui.turn_enemy', { enemy: _enemyNameSafe(d) });

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim696() {
  const overlay = document.getElementById('sim696-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim696(); return; }
  _renderAll();
}

function openSim696() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim696-overlay').classList.add('active');
}

function closeSim696() {
  document.getElementById('sim696-overlay')?.classList.remove('active');
}

export function setSim696Visible(visible) {
  const btn = document.getElementById('sim696-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim696();
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
  const input    = document.getElementById('sim696-enemy-pick');
  const dropdown = document.getElementById('sim696-enemy-pick-dropdown');
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
      `<li role="option" id="sim696-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">А:${e.attack ?? '?'} З:${e.defense ?? '?'} Ж:${e.hp ?? '?'} И:${e.pb ?? '?'}</span></li>`
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
    if (enemy.attack != null)  d.enemy.ataka = enemy.attack;
    if (enemy.defense != null) d.enemy.zashtita = enemy.defense;
    if (enemy.hp != null)      { d.enemy.life = enemy.hp; d.enemy.lifeMax = enemy.hp; }
    if (enemy.pb != null)      d.enemy.izdrazhlivost = enemy.pb;
    d.attackerIsPlayer = true;
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

export function initSim696() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim696-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim696.ui.title')}</span>
        <button id="sim696-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim696.ui.you')}</div>
            ${_numField(t('battlesim696.ui.sila'), 'sim696-player-sila')}
            ${_numField(t('battlesim696.ui.refleks'), 'sim696-player-refleks')}
            ${_numField(t('battlesim696.ui.izdrazhlivost'), 'sim696-player-izdrazhlivost')}
            ${_numField(t('battlesim696.ui.ataka'), 'sim696-player-ataka')}
            ${_numField(t('battlesim696.ui.zashtita'), 'sim696-player-zashtita')}
            ${_numField(t('battlesim696.ui.life'), 'sim696-player-life')}
            ${_numField(t('battlesim696.ui.life_initial'), 'sim696-player-lifemax')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim696.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim696.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim696-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim696-enemy-pick-dropdown">
                <ul id="sim696-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim696.ui.sila'), 'sim696-enemy-sila')}
            ${_numField(t('battlesim696.ui.refleks'), 'sim696-enemy-refleks')}
            ${_numField(t('battlesim696.ui.izdrazhlivost'), 'sim696-enemy-izdrazhlivost')}
            ${_numField(t('battlesim696.ui.ataka'), 'sim696-enemy-ataka')}
            ${_numField(t('battlesim696.ui.zashtita'), 'sim696-enemy-zashtita')}
            ${_numField(t('battlesim696.ui.life'), 'sim696-enemy-life')}
            ${_numField(t('battlesim696.ui.life_max'), 'sim696-enemy-lifemax')}
          </div>
          <div id="sim696-turn" class="bsim-status"></div>
          <div id="sim696-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim696-round" class="inv-add-btn bsim-action-primary">${t('battlesim696.btn.round')}</button>
            <button id="sim696-reset" class="inv-add-btn">${t('battlesim696.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim696-history-summary">${t('battlesim696.history.summary', { n: 0 })}</summary>
            <div id="sim696-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim696-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim696-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim696);
  document.getElementById('sim696-close').addEventListener('click', closeSim696);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim696(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim696-overlay'),
    open:  openSim696,
    close: closeSim696,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim696();
  });

  document.getElementById('sim696-round').addEventListener('click', _runRound);
  document.getElementById('sim696-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim696-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim696-player-sila':          ['player', 'sila'],
    'sim696-player-refleks':       ['player', 'refleks'],
    'sim696-player-izdrazhlivost': ['player', 'izdrazhlivost'],
    'sim696-player-ataka':         ['player', 'ataka'],
    'sim696-player-zashtita':      ['player', 'zashtita'],
    'sim696-player-life':          ['player', 'life'],
    'sim696-player-lifemax':       ['player', 'lifeInitial'],
    'sim696-enemy-sila':           ['enemy', 'sila'],
    'sim696-enemy-refleks':        ['enemy', 'refleks'],
    'sim696-enemy-izdrazhlivost':  ['enemy', 'izdrazhlivost'],
    'sim696-enemy-ataka':          ['enemy', 'ataka'],
    'sim696-enemy-zashtita':       ['enemy', 'zashtita'],
    'sim696-enemy-life':           ['enemy', 'life'],
    'sim696-enemy-lifemax':        ['enemy', 'lifeMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = Math.max(0, val);
    if (id === 'sim696-player-life') val = Math.min(val, d.player.lifeInitial);
    if (id === 'sim696-enemy-life') val = Math.min(val, d.enemy.lifeMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim696-player-lifemax') d.player.life = Math.min(d.player.life, val);
    if (id === 'sim696-enemy-lifemax') d.enemy.life = Math.min(d.enemy.life, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim696-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim696-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete();
}
