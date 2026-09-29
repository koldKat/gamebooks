// ── Battle Simulator (Slaughter Mountain Run, Freeway Warrior book 2, id 278) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 278 only) by the caller in boot.js via
// setSim278Visible().
// To remove: delete this file, remove its import line and initSim278()/
// setSim278Visible() calls from boot.js, remove 'sim278' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// Same Combat Ratio + Close Combat Results Table system as the book 276
// sim (Highway Holocaust, Freeway Warrior book 1) and the Lone Wolf sims
// (books 193/322/323/324). This book's own "Close Combat Results Table",
// printed on the inside back cover of the PDF (page 150), was transcribed
// cell-for-cell and compared against COMBAT_TABLE below: IDENTICAL across
// all 10 rows x 13 ratio columns to book 276's table, so it is reused
// as-is rather than re-derived. Also cross-checked against this book's own
// worked example in the rules front matter (Cal Phoenix CLOSE COMBAT
// SKILL 17 + Hunting Knife +2 = 19, vs Renegade Clansman CLOSE COMBAT
// SKILL 18, Combat Ratio +1; random pick 4 -> enemy loses 4, Cal Phoenix
// loses 3 - matches COMBAT_TABLE row4/col('+1/+2') = [4,3]).
// This table DIFFERS from the Lone Wolf COMBAT_TABLE cell-for-cell (same
// 13 ratio buckets and 10-row layout, different loss values). Combat Ratio
// = effective CLOSE COMBAT SKILL minus enemy CLOSE COMBAT SKILL, computed
// once when an enemy is selected and fixed for the whole fight. Each
// round, pick 0-9, bucket the ratio into the table's 13 printed columns
// (-11 or less .. 11 or greater), and COMBAT_TABLE[pickRow][ratioCol]
// gives [enemyLoss, playerLoss] simultaneously, including 'K'
// (automatically killed) at the extremes.
//
// CLOSE COMBAT SKILL and ENDURANCE are both rolled once at chargen per this
// book's own Action Chart rules (no LUCK mechanic - that's Fighting
// Fantasy, not Freeway Warrior/Lone Wolf).
//
// attackModifier is a free-form +/- field covering one-off CLOSE COMBAT
// SKILL changes this book describes by hand (weapon bonuses, situational
// penalties), same precedent as every other Combat-Ratio sim in this app.
// One single-use Healing Potion consumable (+4 ENDURANCE, after combat
// only), same precedent as the Lone Wolf sims.
//
// book_enemies.attack holds CLOSE COMBAT SKILL, .hp holds ENDURANCE,
// .defense unused. 20 rows already seeded in book_enemies for book_id=278 -
// this module does not hardcode a roster, it reads it live via
// /api/books/278/enemies.
//
// All state lives in pt.sim278, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const HEALING_POTION_HEAL = 4;

// Rows = the 10-value random pick, printed order 1,2,3,4,5,6,7,8,9,0.
// Columns = Combat Ratio, bucketed: -11-, -10/-9, -8/-7, -6/-5, -4/-3,
// -2/-1, 0, 1/2, 3/4, 5/6, 7/8, 9/10, 11+. Cell = [enemyLoss, playerLoss]
// ('K' sentinel = automatically killed). Transcribed directly from the
// "Close Combat Results Table" printed on the inside back cover of this
// book (PDF page 145) - NOT the same values as the Lone Wolf COMBAT_TABLE.
const COMBAT_TABLE = [
  [[0,'K'], [0,10],  [1,8], [1,7], [2,6], [3,5], [3,5], [3,4], [3,4], [3,3], [4,3], [5,3], [6,3]],
  [[2,6],   [3,5],   [4,4], [4,3], [5,3], [5,3], [5,3], [5,2], [5,2], [6,1], [6,1], [7,1], [8,0]],
  [[3,4],   [4,3],   [5,2], [5,2], [6,2], [6,2], [6,2], [6,1], [6,1], [7,1], [8,0], [9,0], [10,0]],
  [[1,6],   [2,6],   [2,5], [3,5], [3,4], [4,4], [4,4], [4,3], [4,3], [5,2], [5,2], [6,1], [7,1]],
  [[3,4],   [4,4],   [4,3], [5,2], [5,2], [5,2], [5,2], [5,2], [6,1], [6,1], [7,1], [8,0], [10,0]],
  [[2,6],   [3,5],   [3,4], [4,4], [4,3], [4,3], [4,3], [4,2], [5,2], [5,2], [6,1], [6,1], [7,1]],
  [[4,4],   [4,3],   [5,2], [5,2], [6,1], [6,1], [6,1], [6,1], [7,1], [8,0], [9,0], [10,0], [16,0]],
  [[0,10],  [0,7],   [1,6], [2,5], [3,5], [3,4], [3,4], [3,3], [4,3], [4,3], [5,2], [5,2], [6,2]],
  [[3,4],   [3,4],   [4,3], [4,3], [5,2], [5,2], [5,2], [5,1], [5,1], [6,1], [6,0], [7,0], [9,0]],
  [[5,0],   [5,0],   [5,0], [6,0], [6,0], [7,0], [7,0], [8,0], [10,0], [12,0], [16,0], ['K',0], ['K',0]],
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
  if (!pt.sim278) {
    pt.sim278 = {
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
  const d = pt.sim278;
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
  const [enemyLoss, playerLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  _appendLog(d, t('battlesim278.log.round', { round: d.roundsThisBattle, ratio: d.ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (playerLoss === 'K') d.endurance = 0;
  else d.endurance = Math.max(0, d.endurance - playerLoss);

  _appendLog(d, t('battlesim278.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'K' ? t('battlesim278.log.k_word') : enemyLoss,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    playerLoss: playerLoss === 'K' ? t('battlesim278.log.k_word') : playerLoss,
    endurance: d.endurance, enduranceMax: d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim278.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim278.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.endurance = d.enemy.enduranceMax;
  d.endurance = d.enduranceInitial;
  if (d.log.length) _appendLog(d, t('battlesim278.log.reset_sep'));
  _appendLog(d, t('battlesim278.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

function _usePotion() {
  const d = _data();
  if (!d || !d.rolled || !d.hasHealingPotion || d.healingPotionUsed) return;
  if (d.roundsThisBattle > 0 && d.endurance > 0 && d.enemy.endurance > 0) {
    showAlert(t('battlesim278.alert.potion_midfight'));
    return;
  }
  d.healingPotionUsed = true;
  const before = d.endurance;
  d.endurance = Math.min(d.enduranceInitial, d.endurance + HEALING_POTION_HEAL);
  _appendLog(d, t('battlesim278.log.potion', { before, endurance: d.endurance, enduranceMax: d.enduranceInitial }));
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
  _setVal('sim278-cs', d.combatSkill);
  _setVal('sim278-csmax', d.combatSkillInitial);
  _setVal('sim278-en', d.endurance);
  _setVal('sim278-enmax', d.enduranceInitial);
  _setVal('sim278-atkmod', d.attackModifier);
  _setVal('sim278-enemy-skill', d.enemy.skill);
  _setVal('sim278-enemy-en', d.enemy.endurance);
  _setVal('sim278-enemy-enmax', d.enemy.enduranceMax);
  _setVal('sim278-ratio', d.ratio);
  if (!skipEnemyPick) _setVal('sim278-enemy-pick', d.enemy.name);

  const potionBtn = document.getElementById('sim278-use-potion');
  potionBtn.disabled = !d.rolled || !d.hasHealingPotion || d.healingPotionUsed;
  potionBtn.textContent = d.healingPotionUsed ? t('battlesim278.btn.used') : t('battlesim278.btn.drink');

  const rollBtn = document.getElementById('sim278-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim278.btn.rolled') : t('battlesim278.btn.roll');

  const status = document.getElementById('sim278-status');
  if (!d.rolled) {
    status.textContent = t('battlesim278.status.not_ready');
  } else if (d.endurance <= 0) {
    status.textContent = t('battlesim278.status.fallen');
  } else if (d.enemy.endurance <= 0 && d.enemy.enduranceMax > 0) {
    status.textContent = t('battlesim278.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim278-round').disabled = !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim278-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim278-history-summary');
  const listEl = document.getElementById('sim278-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim278.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim278.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim278.history.won') : t('battlesim278.history.lost');
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

export function renderSim278() {
  const overlay = document.getElementById('sim278-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim278(); return; }
  _renderAll();
}

function openSim278() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim278-overlay').classList.add('active');
}

function closeSim278() {
  document.getElementById('sim278-overlay')?.classList.remove('active');
}

export function setSim278Visible(visible) {
  const btn = document.getElementById('sim278-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim278();
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

export function initSim278() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim278-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim278.ui.title')}</span>
        <button id="sim278-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim278-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim278.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim278.ui.cs'), 'sim278-cs')}
            ${_numField(t('battlesim278.ui.cs_initial'), 'sim278-csmax')}
            ${_numField(t('battlesim278.ui.en'), 'sim278-en')}
            ${_numField(t('battlesim278.ui.en_initial'), 'sim278-enmax')}
            ${_numField(t('battlesim278.ui.atkmod'), 'sim278-atkmod')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim278.ui.potion')}</span>
              <button id="sim278-use-potion" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim278.btn.drink')}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim278.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim278-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim278-enemy-pick-dropdown">
                <ul id="sim278-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim278.ui.enemy_cs'), 'sim278-enemy-skill')}
            ${_numField(t('battlesim278.ui.enemy_en'), 'sim278-enemy-en')}
            ${_numField(t('battlesim278.ui.enemy_en_max'), 'sim278-enemy-enmax')}
            ${_numField(t('battlesim278.ui.ratio'), 'sim278-ratio', null, true)}
          </div>
          <div id="sim278-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim278-round" class="inv-add-btn bsim-action-primary">${t('battlesim278.btn.round')}</button>
            <button id="sim278-reset" class="inv-add-btn">${t('battlesim278.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim278-history-summary">${t('battlesim278.history.summary', { n: 0 })}</summary>
            <div id="sim278-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim278-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim278-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim278);
  document.getElementById('sim278-close').addEventListener('click', closeSim278);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim278(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim278-overlay'),
    open:  openSim278,
    close: closeSim278,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim278();
  });

  document.getElementById('sim278-round').addEventListener('click', _runRound);
  document.getElementById('sim278-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim278-use-potion').addEventListener('click', _usePotion);

  document.getElementById('sim278-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.combatSkillInitial = _pick10() + 10;
    d.enduranceInitial   = _pick10() + 20;
    d.combatSkill = d.combatSkillInitial;
    d.endurance   = d.enduranceInitial;
    d.rolled = true;
    d.ratio  = _effectiveSkill(d) - d.enemy.skill;
    _appendLog(d, t('battlesim278.log.rolled', { cs: d.combatSkillInitial, en: d.enduranceInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim278-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim278-enemy-pick', 'sim278-enemy-pick-dropdown', enemy => {
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
    'sim278-cs': ['combatSkill'], 'sim278-csmax': ['combatSkillInitial'],
    'sim278-en': ['endurance'], 'sim278-enmax': ['enduranceInitial'],
    'sim278-atkmod': ['attackModifier'],
    'sim278-enemy-skill': ['enemy', 'skill'], 'sim278-enemy-en': ['enemy', 'endurance'], 'sim278-enemy-enmax': ['enemy', 'enduranceMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const allowNegative = id === 'sim278-atkmod';
      const val = allowNegative ? (parseInt(input.value, 10) || 0) : Math.max(0, parseInt(input.value, 10) || 0);
      if (path.length === 1) d[path[0]] = val;
      else d[path[0]][path[1]] = val;
      if (id === 'sim278-cs' || id === 'sim278-atkmod' || id === 'sim278-enemy-skill') d.ratio = _effectiveSkill(d) - d.enemy.skill;
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
