// ── Battle Simulator (Ледените пирати / The Ice Pirates, book 108) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 108 only) by the caller in boot.js via
// setSim108Visible().
// To remove: delete this file, remove its import line and initSim108()/
// setSim108Visible() calls from boot.js, remove 'sim108' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// Two-dimensional table lookup, not a summed single-index table like book
// 92. attackLevel = effective player skill - enemy skill, bucketed into 7
// printed columns (+5/+6 .. -5/-6, outer buckets absorb anything beyond).
// chance = uniform pick 1-10, bucketed into 3 printed rows (1-3, 4-8,
// 9-10). The table cell gives (player loss / enemy loss) directly,
// including instant-death cells at the extremes. Verified against the
// book's own worked example (skill 4 vs 5 = level -1, chance 7 falls in
// the 4-8 row -> cell 5/5, matching "ти губиш 5 точки живот, а
// противникът - също толкова").
//
// No dice-rolled starting stats - chargen is profession-based (external to
// this book), so player skills are entered once and stay fixed until the
// book raises them. LIFE is a fixed 30 (book_frontmatter's own rules text).
// Player has 3 relevant combat skills (Ръкопашен бой / Бой с кинжал / Бой с
// меч) and picks which weapon to fight with each round; effective skill
// applies two penalties before computing attackLevel:
//   - weapon mismatch: enemyWeaponTier - playerWeaponTier (golia raka=0,
//     kinjal=1, mech=2), floored at 0 - reproduces all three stated cases
//     (bare vs dagger = -1, dagger vs sword = -1, bare vs sword = -2) with
//     one formula.
//   - life penalty: -1 if life < 20, another -1 (stacking) if life < 10.
//
// book_enemies.attack holds the enemy's weapon skill, .hp holds LIFE,
// .defense holds their weapon tier (0/1/2, same golia raka/kinjal/mech
// scale as the player's weapon choice) - a different repurposing than the
// other Bulgarian sims since this book's table needs a real weapon-tier
// number, not an unused column. 9 rows read from all 478 sections; the
// dagger-armed "Противник" fight (skill 2/life 10) recurs with verbatim
// identical text at 8 different sections (§36, 315, 321, 334, 347, 353,
// 373, 415) and is stored as a single row rather than eight duplicates.
// §371's three-hantaec fight and §458's two-attacker fight are sequential
// 1-on-1 rounds, each enemy its own row; §384 is the same §371 fight minus
// the first hantaec (killed by a ranged attack beforehand) and reuses the
// second/third hantaec rows rather than adding new ones.
//
// All state lives in pt.sim108, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=1467';
import { showAlert } from '../confirm.js?v=1467';
import { getPlayBtnRow } from '../charsheet.js?v=1467';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=1467';
import { t } from '../i18n.js?v=1467';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const WEAPON_TIER = { rk: 0, kinj: 1, mech: 2 };

// Ниво на атака columns: +5/+6, +3/+4, +1/+2, 0, -1/-2, -3/-4, -5/-6
// Шанс rows: 1-3, 4-8, 9-10. Cell = [playerLoss, enemyLoss] ('dead' sentinel).
const COMBAT_TABLE = [
  [[3, 'dead'], [4, 9],      [5, 8], [6, 6], [8, 4], [10, 2], ['dead', 0]],
  [[1, 'dead'], [3, 10],     [3, 9], [4, 7], [5, 5], [7, 4],  [10, 2]],
  [[0, 'dead'], [1, 'dead'], [2, 10], [4, 8], [5, 6], [6, 6], [8, 4]],
];

function _levelCol(level) {
  if (level >= 5) return 0;
  if (level >= 3) return 1;
  if (level >= 1) return 2;
  if (level === 0) return 3;
  if (level >= -2) return 4;
  if (level >= -4) return 5;
  return 6;
}

function _chanceRow(pick) {
  if (pick <= 3) return 0;
  if (pick <= 8) return 1;
  return 2;
}

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim108) {
    pt.sim108 = {
      skills: { rk: 0, kinj: 0, mech: 0 },
      life: 30, lifeInitial: 30,
      weapon: 'mech',
      enemy: { name: '', skill: 0, life: 0, lifeMax: 0, tier: 2 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim108;
  if (!d.skills) d.skills = { rk: 0, kinj: 0, mech: 0 };
  if (d.life === undefined) d.life = 30;
  if (d.lifeInitial === undefined) d.lifeInitial = 30;
  if (!d.weapon) d.weapon = 'mech';
  if (!d.enemy) d.enemy = { name: '', skill: 0, life: 0, lifeMax: 0, tier: 2 };
  if (d.enemy.tier === undefined) d.enemy.tier = 2;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _pick10() { return 1 + Math.floor(Math.random() * 10); } // random-number table, 1-10

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || 'врагът'; }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
}

function _effectiveSkill(d) {
  const base = d.skills[d.weapon] || 0;
  const mismatch = Math.max(0, d.enemy.tier - WEAPON_TIER[d.weapon]);
  const lifePenalty = (d.life < 20 ? 1 : 0) + (d.life < 10 ? 1 : 0);
  return Math.max(0, base - mismatch - lifePenalty);
}

function _runRound() {
  const d = _data();
  if (!d || d.life <= 0 || d.enemy.life <= 0) return;
  d.roundsThisBattle++;

  const effSkill = _effectiveSkill(d);
  const level = effSkill - d.enemy.skill;
  const pick = _pick10();
  const [playerLoss, enemyLoss] = COMBAT_TABLE[_chanceRow(pick)][_levelCol(level)];
  _appendLog(d, t('battlesim108.log.round', { round: d.roundsThisBattle, effSkill, enemySkill: d.enemy.skill, level, pick }));

  if (playerLoss === 'dead') d.life = 0;
  else d.life = Math.max(0, d.life - playerLoss);
  if (enemyLoss === 'dead') d.enemy.life = 0;
  else d.enemy.life = Math.max(0, d.enemy.life - enemyLoss);

  _appendLog(d, t('battlesim108.log.result', {
    playerLoss: playerLoss === 'dead' ? t('battlesim108.log.dead_word') : playerLoss,
    life: d.life, lifeMax: d.lifeInitial,
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'dead' ? t('battlesim108.log.dead_word') : enemyLoss,
    enemyLife: d.enemy.life, enemyLifeMax: d.enemy.lifeMax,
  }));

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  if (d.enemy.life <= 0) {
    _appendLog(d, t('battlesim108.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.life <= 0) {
    _appendLog(d, t('battlesim108.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.life = d.enemy.lifeMax;
  d.life = d.lifeInitial;
  if (d.log.length) _appendLog(d, t('battlesim108.log.reset_sep'));
  _appendLog(d, t('battlesim108.log.reset', { enemy: _enemyNameSafe(d) }));
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

function _renderInputs(skipEnemyPick) {
  const d = _data();
  if (!d) return;
  _setVal('sim108-skill-rk', d.skills.rk);
  _setVal('sim108-skill-kinj', d.skills.kinj);
  _setVal('sim108-skill-mech', d.skills.mech);
  _setVal('sim108-life', d.life);
  _setVal('sim108-lifemax', d.lifeInitial);
  _setVal('sim108-enemy-skill', d.enemy.skill);
  _setVal('sim108-enemy-life', d.enemy.life);
  _setVal('sim108-enemy-lifemax', d.enemy.lifeMax);
  const weaponSel = document.getElementById('sim108-weapon');
  if (weaponSel) weaponSel.value = d.weapon;
  if (!skipEnemyPick) _setVal('sim108-enemy-pick', d.enemy.name);

  const status = document.getElementById('sim108-status');
  if (d.life <= 0) {
    status.textContent = t('battlesim108.status.fallen');
  } else if (d.enemy.life <= 0 && d.enemy.lifeMax > 0) {
    status.textContent = t('battlesim108.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim108-round').disabled = d.life <= 0 || d.enemy.life <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim108-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim108-history-summary');
  const listEl = document.getElementById('sim108-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim108.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim108.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim108.history.won') : t('battlesim108.history.lost');
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

export function renderSim108() {
  const overlay = document.getElementById('sim108-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim108(); return; }
  _renderAll();
}

function openSim108() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim108-overlay').classList.add('active');
}

function closeSim108() {
  document.getElementById('sim108-overlay')?.classList.remove('active');
}

export function setSim108Visible(visible) {
  const btn = document.getElementById('sim108-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim108();
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

export function initSim108() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim108-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim108.ui.title')}</span>
        <button id="sim108-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            ${_numField(t('battlesim108.ui.skill_rk'), 'sim108-skill-rk')}
            ${_numField(t('battlesim108.ui.skill_kinj'), 'sim108-skill-kinj')}
            ${_numField(t('battlesim108.ui.skill_mech'), 'sim108-skill-mech')}
            ${_numField(t('battlesim108.ui.life'), 'sim108-life')}
            ${_numField(t('battlesim108.ui.life_initial'), 'sim108-lifemax')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim108.ui.weapon')}</span>
              <select id="sim108-weapon" class="inv-edit-input">
                <option value="rk">${t('battlesim108.ui.weapon_rk')}</option>
                <option value="kinj">${t('battlesim108.ui.weapon_kinj')}</option>
                <option value="mech">${t('battlesim108.ui.weapon_mech')}</option>
              </select>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim108.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim108-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim108-enemy-pick-dropdown">
                <ul id="sim108-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim108.ui.enemy_skill'), 'sim108-enemy-skill')}
            ${_numField(t('battlesim108.ui.enemy_life'), 'sim108-enemy-life')}
            ${_numField(t('battlesim108.ui.enemy_life_max'), 'sim108-enemy-lifemax')}
          </div>
          <div id="sim108-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim108-round" class="inv-add-btn bsim-action-primary">${t('battlesim108.btn.round')}</button>
            <button id="sim108-reset" class="inv-add-btn">${t('battlesim108.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim108-history-summary">${t('battlesim108.history.summary', { n: 0 })}</summary>
            <div id="sim108-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim108-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim108-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim108);
  document.getElementById('sim108-close').addEventListener('click', closeSim108);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim108(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim108-overlay'),
    open:  openSim108,
    close: closeSim108,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim108();
  });

  document.getElementById('sim108-round').addEventListener('click', _runRound);
  document.getElementById('sim108-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim108-weapon').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.weapon = e.target.value;
    saveState();
  });

  document.getElementById('sim108-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim108-enemy-pick', 'sim108-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name          = enemy.name;
    d.enemy.skill          = enemy.attack ?? 0;
    d.enemy.tier           = enemy.defense ?? 2;
    d.enemy.life           = enemy.hp ?? 0;
    d.enemy.lifeMax        = enemy.hp ?? 0;
    d.roundsThisBattle     = 0;
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim108-skill-rk': ['skills', 'rk'], 'sim108-skill-kinj': ['skills', 'kinj'], 'sim108-skill-mech': ['skills', 'mech'],
    'sim108-life': ['life'], 'sim108-lifemax': ['lifeInitial'],
    'sim108-enemy-skill': ['enemy', 'skill'], 'sim108-enemy-life': ['enemy', 'life'], 'sim108-enemy-lifemax': ['enemy', 'lifeMax'],
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
