// ── Battle Simulator (Fire on the Water, Lone Wolf book 2, id 322) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 322 only) by the caller in boot.js via
// setSim322Visible().
// To remove: delete this file, remove its import line and initSim322()/
// setSim322Visible() calls from boot.js, remove 'sim322' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// Same Combat Ratio + Combat Results Table system as book 193 - Project Aon's
// own "Game Rules" text and worked example (Winged Devil, COMBAT SKILL 15 vs
// 20, ratio -3) are verbatim identical between the two books, so the
// COMBAT_TABLE constant is reused rather than re-derived from this book's own
// printed pages. Combat Ratio = effective COMBAT SKILL minus enemy COMBAT
// SKILL, computed once when an enemy is selected and fixed for the whole
// fight. Each round, pick 0-9, bucket the ratio into the table's 13 printed
// columns (-11 or less .. 11 or greater), and COMBAT_TABLE[pickRow][ratioCol]
// gives [enemyLoss, lwLoss] simultaneously, including 'K' (automatically
// killed) at the extremes.
//
// COMBAT SKILL = pick+10, ENDURANCE = pick+20, both rolled once at chargen.
// No LUCK mechanic - that's Fighting Fantasy, not Lone Wolf.
//
// attackModifier is a free-form +/- field covering one-off COMBAT SKILL
// changes this book describes by hand (Kai Discipline bonuses, terrain
// penalties), same precedent as book 193 and every other sim in this app.
// One single-use Healing Potion consumable (+4 ENDURANCE, after combat only,
// confirmed present in this book's own Equipment section).
//
// Every multi-enemy fight in this book (the 5-way Villager/Szall fight §90,
// the 3-way Street Thief group §131/§298, the 6-way Town Guard squad §296,
// paired Drakkar/Bridge Guard/Zombie encounters) is fought one at a time per
// the book's own text - no pairedFight/sideEnemy mechanic needed, re-pick the
// next roster enemy after each kill.
//
// book_enemies.attack holds COMBAT SKILL, .hp holds ENDURANCE, .defense
// unused. 41 rows read from all 350 sections; three same-name/same-stat/
// same-destination groups (Street Thief Leader/1/2 §131=§298, Watchtower
// Guard §110=§157, Giaks §34=§146) are merged into one row each; four
// separate Helghast encounters (§5 wounded, §17, §106, §237, §332) and four
// Drakkar encounters go to different destinations with different stats and
// are kept as separate rows. This session also found and fixed 27 sections
// with a missing-choice-link import defect (text said "turn to N" but no
// href/choices entry existed) - same defect class found in book 193.
//
// All state lives in pt.sim322, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=1462';
import { showAlert } from '../confirm.js?v=1462';
import { getPlayBtnRow } from '../charsheet.js?v=1462';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=1462';
import { t } from '../i18n.js?v=1462';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const HEALING_POTION_HEAL = 4;

// Rows = the 10-value random pick, printed order 1,2,3,4,5,6,7,8,9,0.
// Columns = Combat Ratio, bucketed: -11-, -10/-9, -8/-7, -6/-5, -4/-3,
// -2/-1, 0, 1/2, 3/4, 5/6, 7/8, 9/10, 11+. Cell = [enemyLoss, lwLoss]
// ('K' sentinel = automatically killed).
const COMBAT_TABLE = [
  [[0,'K'], [0,'K'], [0,8], [0,6], [1,6], [2,5], [3,5], [4,5], [5,4], [6,4], [7,4], [8,3], [9,3]],
  [[0,'K'], [0,8],   [0,7], [1,6], [2,5], [3,5], [4,4], [5,4], [6,3], [7,3], [8,3], [9,3], [10,2]],
  [[0,8],   [0,7],   [1,6], [2,5], [3,5], [4,4], [5,4], [6,3], [7,3], [8,3], [9,2], [10,2], [11,2]],
  [[0,8],   [1,7],   [2,6], [3,5], [4,4], [5,4], [6,3], [7,3], [8,2], [9,2], [10,2], [11,2], [12,2]],
  [[1,7],   [2,6],   [3,5], [4,4], [5,4], [6,3], [7,2], [8,2], [9,2], [10,2], [11,2], [12,2], [14,1]],
  [[2,6],   [3,6],   [4,5], [5,4], [6,3], [7,2], [8,2], [9,2], [10,2], [11,1], [12,1], [14,1], [16,1]],
  [[3,5],   [4,5],   [5,4], [6,3], [7,2], [8,2], [9,1], [10,1], [11,1], [12,0], [14,0], [16,0], [18,0]],
  [[4,4],   [5,4],   [6,3], [7,2], [8,1], [9,1], [10,0], [11,0], [12,0], [14,0], [16,0], [18,0], ['K',0]],
  [[5,3],   [6,3],   [7,2], [8,0], [9,0], [10,0], [11,0], [12,0], [14,0], [16,0], [18,0], ['K',0], ['K',0]],
  [[6,0],   [7,0],   [8,0], [9,0], [10,0], [11,0], [12,0], [14,0], [16,0], [18,0], ['K',0], ['K',0], ['K',0]],
];

function _ratioCol(ratio) {
  if (ratio <= -11) return 0;
  if (ratio <= -9) return 1;
  if (ratio <= -7) return 2;
  if (ratio <= -5) return 3;
  if (ratio <= -3) return 4;
  if (ratio <= -1) return 5;
  if (ratio === 0) return 6;
  if (ratio <= 2) return 7;
  if (ratio <= 4) return 8;
  if (ratio <= 6) return 9;
  if (ratio <= 8) return 10;
  if (ratio <= 10) return 11;
  return 12;
}

function _pickRow(pick) { return pick === 0 ? 9 : pick - 1; }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim322) {
    pt.sim322 = {
      combatSkill: 0, combatSkillInitial: 0,
      endurance: 0, enduranceInitial: 0,
      attackModifier: 0,
      hasHealingPotion: true, healingPotionUsed: false,
      rolled: false,
      ratio: 0,
      enemy: { name: '', skill: 0, endurance: 0, enduranceMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim322;
  if (d.combatSkill === undefined) d.combatSkill = 0;
  if (d.combatSkillInitial === undefined) d.combatSkillInitial = 0;
  if (d.endurance === undefined) d.endurance = 0;
  if (d.enduranceInitial === undefined) d.enduranceInitial = 0;
  if (d.attackModifier === undefined) d.attackModifier = 0;
  if (d.hasHealingPotion === undefined) d.hasHealingPotion = true;
  if (d.healingPotionUsed === undefined) d.healingPotionUsed = false;
  if (d.rolled === undefined) d.rolled = false;
  if (d.ratio === undefined) d.ratio = 0;
  if (!d.enemy) d.enemy = { name: '', skill: 0, endurance: 0, enduranceMax: 0 };
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _pick10() { return Math.floor(Math.random() * 10); } // 0-9, "0 counts as zero"

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
}

function _effectiveSkill(d) { return d.combatSkill + (d.attackModifier || 0); }

function _runRound() {
  const d = _data();
  if (!d || !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0) return;
  d.roundsThisBattle++;

  const pick = _pick10();
  const col = _ratioCol(d.ratio);
  const [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  _appendLog(d, t('battlesim322.log.round', { round: d.roundsThisBattle, ratio: d.ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (lwLoss === 'K') d.endurance = 0;
  else d.endurance = Math.max(0, d.endurance - lwLoss);

  _appendLog(d, t('battlesim322.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'K' ? t('battlesim322.log.k_word') : enemyLoss,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? t('battlesim322.log.k_word') : lwLoss,
    endurance: d.endurance, enduranceMax: d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim322.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim322.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.endurance = d.enemy.enduranceMax;
  d.endurance = d.enduranceInitial;
  if (d.log.length) _appendLog(d, t('battlesim322.log.reset_sep'));
  _appendLog(d, t('battlesim322.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

function _usePotion() {
  const d = _data();
  if (!d || !d.rolled || !d.hasHealingPotion || d.healingPotionUsed) return;
  if (d.roundsThisBattle > 0 && d.endurance > 0 && d.enemy.endurance > 0) {
    showAlert(t('battlesim322.alert.potion_midfight'));
    return;
  }
  d.healingPotionUsed = true;
  const before = d.endurance;
  d.endurance = Math.min(d.enduranceInitial, d.endurance + HEALING_POTION_HEAL);
  _appendLog(d, t('battlesim322.log.potion', { before, endurance: d.endurance, enduranceMax: d.enduranceInitial }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">CS:${e.attack ?? '?'} EN:${e.hp ?? '?'}</span></li>`
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
  _setVal('sim322-cs', d.combatSkill);
  _setVal('sim322-csmax', d.combatSkillInitial);
  _setVal('sim322-en', d.endurance);
  _setVal('sim322-enmax', d.enduranceInitial);
  _setVal('sim322-atkmod', d.attackModifier);
  _setVal('sim322-enemy-skill', d.enemy.skill);
  _setVal('sim322-enemy-en', d.enemy.endurance);
  _setVal('sim322-enemy-enmax', d.enemy.enduranceMax);
  _setVal('sim322-ratio', d.ratio);
  if (!skipEnemyPick) _setVal('sim322-enemy-pick', d.enemy.name);

  const potionBtn = document.getElementById('sim322-use-potion');
  potionBtn.disabled = !d.rolled || !d.hasHealingPotion || d.healingPotionUsed;
  potionBtn.textContent = d.healingPotionUsed ? t('battlesim322.btn.used') : t('battlesim322.btn.drink');

  const rollBtn = document.getElementById('sim322-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim322.btn.rolled') : t('battlesim322.btn.roll');

  const status = document.getElementById('sim322-status');
  if (!d.rolled) {
    status.textContent = t('battlesim322.status.not_ready');
  } else if (d.endurance <= 0) {
    status.textContent = t('battlesim322.status.fallen');
  } else if (d.enemy.endurance <= 0 && d.enemy.enduranceMax > 0) {
    status.textContent = t('battlesim322.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim322-round').disabled = !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim322-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim322-history-summary');
  const listEl = document.getElementById('sim322-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim322.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim322.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim322.history.won') : t('battlesim322.history.lost');
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

export function renderSim322() {
  const overlay = document.getElementById('sim322-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim322(); return; }
  _renderAll();
}

function openSim322() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim322-overlay').classList.add('active');
}

function closeSim322() {
  document.getElementById('sim322-overlay')?.classList.remove('active');
}

export function setSim322Visible(visible) {
  const btn = document.getElementById('sim322-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim322();
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

export function initSim322() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim322-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim322.ui.title')}</span>
        <button id="sim322-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim322-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim322.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim322.ui.cs'), 'sim322-cs')}
            ${_numField(t('battlesim322.ui.cs_initial'), 'sim322-csmax')}
            ${_numField(t('battlesim322.ui.en'), 'sim322-en')}
            ${_numField(t('battlesim322.ui.en_initial'), 'sim322-enmax')}
            ${_numField(t('battlesim322.ui.atkmod'), 'sim322-atkmod')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim322.ui.potion')}</span>
              <button id="sim322-use-potion" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim322.btn.drink')}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim322.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim322-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim322-enemy-pick-dropdown">
                <ul id="sim322-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim322.ui.enemy_cs'), 'sim322-enemy-skill')}
            ${_numField(t('battlesim322.ui.enemy_en'), 'sim322-enemy-en')}
            ${_numField(t('battlesim322.ui.enemy_en_max'), 'sim322-enemy-enmax')}
            ${_numField(t('battlesim322.ui.ratio'), 'sim322-ratio', null, true)}
          </div>
          <div id="sim322-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim322-round" class="inv-add-btn bsim-action-primary">${t('battlesim322.btn.round')}</button>
            <button id="sim322-reset" class="inv-add-btn">${t('battlesim322.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim322-history-summary">${t('battlesim322.history.summary', { n: 0 })}</summary>
            <div id="sim322-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim322-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim322-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim322);
  document.getElementById('sim322-close').addEventListener('click', closeSim322);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim322(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim322-overlay'),
    open:  openSim322,
    close: closeSim322,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim322();
  });

  document.getElementById('sim322-round').addEventListener('click', _runRound);
  document.getElementById('sim322-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim322-use-potion').addEventListener('click', _usePotion);

  document.getElementById('sim322-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.combatSkillInitial = _pick10() + 10;
    d.enduranceInitial   = _pick10() + 20;
    d.combatSkill = d.combatSkillInitial;
    d.endurance   = d.enduranceInitial;
    d.rolled = true;
    d.ratio  = _effectiveSkill(d) - d.enemy.skill;
    _appendLog(d, t('battlesim322.log.rolled', { cs: d.combatSkillInitial, en: d.enduranceInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim322-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim322-enemy-pick', 'sim322-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name          = enemy.name;
    d.enemy.skill          = enemy.attack ?? 0;
    d.enemy.endurance      = enemy.hp ?? 0;
    d.enemy.enduranceMax   = enemy.hp ?? 0;
    d.roundsThisBattle     = 0;
    d.ratio                = _effectiveSkill(d) - d.enemy.skill;
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim322-cs': ['combatSkill'], 'sim322-csmax': ['combatSkillInitial'],
    'sim322-en': ['endurance'], 'sim322-enmax': ['enduranceInitial'],
    'sim322-atkmod': ['attackModifier'],
    'sim322-enemy-skill': ['enemy', 'skill'], 'sim322-enemy-en': ['enemy', 'endurance'], 'sim322-enemy-enmax': ['enemy', 'enduranceMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const allowNegative = id === 'sim322-atkmod';
      const val = allowNegative ? (parseInt(input.value, 10) || 0) : Math.max(0, parseInt(input.value, 10) || 0);
      if (path.length === 1) d[path[0]] = val;
      else d[path[0]][path[1]] = val;
      if (id === 'sim322-cs' || id === 'sim322-atkmod' || id === 'sim322-enemy-skill') d.ratio = _effectiveSkill(d) - d.enemy.skill;
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
