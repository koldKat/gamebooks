// ── Battle Simulator (Езерният град, book 415) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 415 only) by the caller in boot.js via
// setSim415Visible().
// To remove: delete this file, remove its import line and initSim415()/
// setSim415Visible() calls from boot.js, remove 'sim415' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim415-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim415-btn selectors in
// battlesim.css.
//
// Same mechanic as battlesim414.js (book 414, this book's own direct
// prequel in the same Оргонд/Алкирия series - identical rules text, word
// for word, down to the player's starting Умение 10/Издръжливост 50):
// each side has Умение (Skill) and Издръжливост (Endurance). To resolve
// one exchange, both sides draw a random number from the book's printed
// random-number table and add it to their Skill (modeled here as a random
// digit 0-9, matching book 414's own choice since neither book prints an
// actual range); higher total lands a hit, a tie means neither side had
// the advantage and both redraw. A successful hit costs the loser 2
// Endurance normally, or only 1 if the side that landed the hit is
// fighting unarmed.
//
// Full enemy roster (24 rows, all 20 stat-block-bearing sections found
// across the book, several of which are pre-battle Умение-boosting spell
// choices rather than separate enemies - e.g. §261/§264/§275/§278 each add
// a temporary bonus before the §237 assassin fight, and §327/§330 do the
// same before the §323 lake-monster fight - so those aren't seeded as
// their own rows, the bonus is simply hand-added to the player's own
// Умение field before the fight). §146 (a threshold "reach 17 total"
// check, not a two-sided compare) isn't modeled, matching book 414's own
// wolf-encounter exclusion. Recurring identical stat blocks (§154/§161/§24,
// three retellings of the same two-bandit fight) are seeded once.
// Multi-enemy group fights (§46/§72, river-folk; §29/§64/§88, circus
// acrobats; §237, four masked assassins) are resolved by hand-picking the
// next enemy from the dropdown after each one falls, same convenience
// pattern as every other multi-enemy sim in this app.
//
// Alternate start: this book's own intro text states play begins at §178,
// not §1 - see docs/technical.md's Live Reading section for the full
// explanation. Not this sim's concern; noted here only so the roster
// above isn't mistaken for missing anything reachable from §1 alone.
//
// book_enemies column reuse (only 4 numeric columns exist; this book only
// needs 2): attack = Умение (Skill); hp = Издръжливост (Endurance).
// defense/pb are unused, always 0.
//
// All state lives in pt.sim415, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _emptyEnemy() {
  return { name: '', skill: 0, endurance: 0, enduranceMax: 0, unarmed: false };
}

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim415) {
    pt.sim415 = {
      player: { skill: 10, endurance: 50, enduranceInitial: 50, unarmed: false },
      enemy: _emptyEnemy(),
      log: [],
      history: [],
    };
  }
  const d = pt.sim415;
  const p = d.player;
  if (p.skill === undefined) p.skill = 10;
  if (p.endurance === undefined) p.endurance = 50;
  if (p.enduranceInitial === undefined) p.enduranceInitial = 50;
  if (p.unarmed === undefined) p.unarmed = false;
  if (!d.enemy) d.enemy = _emptyEnemy();
  const e = d.enemy;
  if (e.skill === undefined) e.skill = 0;
  if (e.unarmed === undefined) e.unarmed = false;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _rollTable() { return Math.floor(Math.random() * 10); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _battleOver(d) { return d.player.endurance <= 0 || (d.enemy.enduranceMax > 0 && d.enemy.endurance <= 0); }

function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerEndurance: d.player.endurance, playerEnduranceMax: d.player.enduranceInitial,
    ts: Date.now(),
  });
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _applyEnemyDefeat(d) {
  if (d.enemy.enduranceMax > 0 && d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim415.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _applyPlayerFall(d) {
  if (d.player.endurance <= 0) {
    _appendLog(d, t('battlesim415.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _exchange() {
  const d = _data();
  if (!d || _battleOver(d)) return;

  let playerRoll, enemyRoll, playerTotal, enemyTotal;
  let ties = 0;
  do {
    playerRoll = _rollTable();
    enemyRoll = _rollTable();
    playerTotal = d.player.skill + playerRoll;
    enemyTotal = d.enemy.skill + enemyRoll;
    if (playerTotal === enemyTotal) {
      ties++;
      _appendLog(d, t('battlesim415.log.tie', { playerRoll, playerTotal, enemyRoll, enemyTotal, enemy: _enemyNameSafe(d) }));
    }
  } while (playerTotal === enemyTotal && ties < 20);

  if (playerTotal > enemyTotal) {
    const dmg = d.player.unarmed ? 1 : 2;
    d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
    _appendLog(d, t('battlesim415.log.you_hit', { playerRoll, playerTotal, enemyRoll, enemyTotal, enemy: _enemyNameSafe(d), n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax }));
  } else {
    const dmg = d.enemy.unarmed ? 1 : 2;
    d.player.endurance = Math.max(0, d.player.endurance - dmg);
    _appendLog(d, t('battlesim415.log.enemy_hits', { playerRoll, playerTotal, enemyRoll, enemyTotal, enemy: _enemyNameSafe(d), n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
  }

  if (!_applyEnemyDefeat(d)) _applyPlayerFall(d);
  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.endurance = d.enemy.enduranceMax;
  d.player.endurance = d.player.enduranceInitial;
  if (d.log.length) _appendLog(d, t('battlesim415.log.reset_sep'));
  _appendLog(d, t('battlesim415.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim415.ui.endurance')}:${e.hp ?? '?'}</span></li>`
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
function _setChecked(id, v) { const el = document.getElementById(id); if (el) el.checked = !!v; }

function _renderInputs(skipEnemyPick) {
  const d = _data();
  if (!d) return;
  const p = d.player, e = d.enemy;

  _setVal('sim415-player-skill', p.skill);
  _setVal('sim415-player-endurance', p.endurance);
  _setVal('sim415-player-endurancemax', p.enduranceInitial);
  _setChecked('sim415-player-unarmed', p.unarmed);

  if (!skipEnemyPick) _setVal('sim415-enemy-pick', e.name);
  _setVal('sim415-enemy-skill', e.skill);
  _setVal('sim415-enemy-endurance', e.endurance);
  _setVal('sim415-enemy-endurancemax', e.enduranceMax);
  _setChecked('sim415-enemy-unarmed', e.unarmed);

  const over = _battleOver(d);
  document.getElementById('sim415-exchange').disabled = over;

  const status = document.getElementById('sim415-status');
  if (p.endurance <= 0) status.innerHTML = t('battlesim415.status.fallen', { skull: SVG_SKULL });
  else if (e.enduranceMax > 0 && e.endurance <= 0) status.innerHTML = t('battlesim415.status.victory', { trophy: SVG_TROPHY });
  else status.innerHTML = '';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim415-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim415-history-summary');
  const listEl = document.getElementById('sim415-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim415.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim415.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim415.history.won') : t('battlesim415.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim415.ui.endurance')} ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim415() {
  const overlay = document.getElementById('sim415-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim415(); return; }
  _renderAll();
}

function openSim415() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim415-overlay').classList.add('active');
}

function closeSim415() {
  document.getElementById('sim415-overlay')?.classList.remove('active');
}

export function setSim415Visible(visible) {
  const btn = document.getElementById('sim415-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim415();
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

function _checkField(label, id) {
  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <input id="${id}" type="checkbox">
    </div>`;
}

export function initSim415() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim415-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim415.ui.title')}</span>
        <button id="sim415-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim415.ui.you')}</div>
            ${_numField(t('battlesim415.ui.skill'), 'sim415-player-skill')}
            ${_numField(t('battlesim415.ui.endurance'), 'sim415-player-endurance')}
            ${_numField(t('battlesim415.ui.endurance_initial'), 'sim415-player-endurancemax')}
            ${_checkField(t('battlesim415.ui.unarmed'), 'sim415-player-unarmed')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim415.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim415.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim415-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim415-enemy-pick-dropdown">
                <ul id="sim415-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim415.ui.skill'), 'sim415-enemy-skill')}
            ${_numField(t('battlesim415.ui.endurance'), 'sim415-enemy-endurance')}
            ${_numField(t('battlesim415.ui.endurance_max'), 'sim415-enemy-endurancemax')}
            ${_checkField(t('battlesim415.ui.unarmed'), 'sim415-enemy-unarmed')}
          </div>
          <div id="sim415-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim415-exchange" class="inv-add-btn bsim-action-primary">${t('battlesim415.btn.exchange')}</button>
            <button id="sim415-reset" class="inv-add-btn">${t('battlesim415.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim415-history-summary">${t('battlesim415.history.summary', { n: 0 })}</summary>
            <div id="sim415-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim415-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim415-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim415);
  document.getElementById('sim415-close').addEventListener('click', closeSim415);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim415(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim415-overlay'),
    open:  openSim415,
    close: closeSim415,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim415();
  });

  document.getElementById('sim415-exchange').addEventListener('click', _exchange);
  document.getElementById('sim415-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim415-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim415-enemy-pick', 'sim415-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name        = enemy.name;
    d.enemy.skill        = enemy.attack ?? 0;
    d.enemy.endurance    = enemy.hp ?? 0;
    d.enemy.enduranceMax = enemy.hp ?? 0;
    d.enemy.unarmed      = false;
    saveState();
    _renderAll();
  });

  const fieldMap = {
    'sim415-player-skill': ['player', 'skill'], 'sim415-player-endurance': ['player', 'endurance'],
    'sim415-player-endurancemax': ['player', 'enduranceInitial'],
    'sim415-enemy-skill': ['enemy', 'skill'], 'sim415-enemy-endurance': ['enemy', 'endurance'],
    'sim415-enemy-endurancemax': ['enemy', 'enduranceMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = parseInt(input.value, 10) || 0;
      d[path[0]][path[1]] = Math.max(0, val);
      saveState();
      _renderInputs(true);
    });
  }
  const checkMap = {
    'sim415-player-unarmed': ['player', 'unarmed'],
    'sim415-enemy-unarmed': ['enemy', 'unarmed'],
  };
  for (const [id, path] of Object.entries(checkMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      d[path[0]][path[1]] = input.checked;
      saveState();
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
