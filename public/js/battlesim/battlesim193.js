// ── Battle Simulator (Flight from the Dark, Lone Wolf book 1, id 193) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 193 only) by the caller in boot.js via
// setSim193Visible().
// To remove: delete this file, remove its import line and initSim193()/
// setSim193Visible() calls from boot.js, remove 'sim193' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// Lone Wolf's own Combat Ratio + Combat Results Table system - a 2D table
// lookup like books 92/108, not the Fighting Fantasy simultaneous-exchange
// engine those FF sims (202-216) use. Combat Ratio = effective COMBAT SKILL
// minus enemy COMBAT SKILL, computed once when an enemy is selected and
// fixed for the whole fight (the rule text's numbered steps only repeat
// "from Stage 3" - picking a number and reading the table - not the ratio
// calculation itself). Each round, pick 0-9 (a 10-value die), bucket the
// ratio into the table's 13 printed columns (-11 or less .. 11 or greater),
// and COMBAT_TABLE[pickRow][ratioCol] gives [enemyLoss, lwLoss]
// simultaneously, including 'K' (automatically killed) at the extremes.
// Verified against the book's own worked example (ratio -3, pick 6 -> enemy
// loses 6, Lone Wolf loses 3) and transcribed from the book's own printed
// table (two page-halves, cross-checked against each other's duplicated "0"
// column, which matched exactly).
//
// COMBAT SKILL = pick+10, ENDURANCE = pick+20, both rolled once at chargen
// (0 counts as zero, same 10-value random pick as combat rounds). No LUCK
// mechanic - that's a Fighting Fantasy system, not part of Lone Wolf.
//
// attackModifier is a free-form +/- field covering every one-off COMBAT
// SKILL change this book's own rules describe by hand rather than a
// dedicated toggle each: the Weaponskill Discipline (+2 if the matching
// weapon is carried), Mindblast Discipline (+2, some enemies immune),
// terrain/injury penalties (e.g. -1 fighting a Kraan through dust, §229),
// and the Potion of question 6 in this book's random-equipment table
// (+2 COMBAT SKILL for one fight). Same precedent as every other sim in
// this app: apply the number, don't build a UI toggle per source.
//
// One single-use consumable modeled as an obtain-toggle + Use button, the
// same shape as book 204/216's potions: the starting-equipment Healing
// Potion (+4 ENDURANCE, once, after combat only).
//
// Every multi-enemy fight in this book (Giak pairs, the 4-Doomwolf pack
// §253, the Leader+2 Soldiers §180) is explicitly fought "one at a time" in
// the book's own text, not simultaneously like the FF sims' paired fights -
// no pairedFight/sideEnemy mechanic needed, just re-pick the next roster
// enemy after defeating the current one. §208's Giaks are the one exception
// - fought "as a single enemy" with one combined stat block, already one
// book_enemies row.
//
// book_enemies.attack holds COMBAT SKILL, .hp holds ENDURANCE, .defense
// unused. 39 rows read from all 350 sections; several same-named/close-stat
// encounters (Vordak x4, Kraan x2, Bodyguard x2, Doomwolf x2, Robber x2) go
// to different destinations on checking, so kept as separate rows rather
// than merged, even where stats coincide almost exactly.
//
// All state lives in pt.sim193, per-user/per-book via currentPlaythrough().

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
  if (!pt.sim193) {
    pt.sim193 = {
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
  const d = pt.sim193;
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
  _appendLog(d, t('battlesim193.log.round', { round: d.roundsThisBattle, ratio: d.ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (lwLoss === 'K') d.endurance = 0;
  else d.endurance = Math.max(0, d.endurance - lwLoss);

  _appendLog(d, t('battlesim193.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'K' ? t('battlesim193.log.k_word') : enemyLoss,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? t('battlesim193.log.k_word') : lwLoss,
    endurance: d.endurance, enduranceMax: d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim193.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim193.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.endurance = d.enemy.enduranceMax;
  d.endurance = d.enduranceInitial;
  if (d.log.length) _appendLog(d, t('battlesim193.log.reset_sep'));
  _appendLog(d, t('battlesim193.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

function _usePotion() {
  const d = _data();
  if (!d || !d.rolled || !d.hasHealingPotion || d.healingPotionUsed) return;
  if (d.roundsThisBattle > 0 && d.endurance > 0 && d.enemy.endurance > 0) {
    showAlert(t('battlesim193.alert.potion_midfight'));
    return;
  }
  d.healingPotionUsed = true;
  const before = d.endurance;
  d.endurance = Math.min(d.enduranceInitial, d.endurance + HEALING_POTION_HEAL);
  _appendLog(d, t('battlesim193.log.potion', { before, endurance: d.endurance, enduranceMax: d.enduranceInitial }));
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
  _setVal('sim193-cs', d.combatSkill);
  _setVal('sim193-csmax', d.combatSkillInitial);
  _setVal('sim193-en', d.endurance);
  _setVal('sim193-enmax', d.enduranceInitial);
  _setVal('sim193-atkmod', d.attackModifier);
  _setVal('sim193-enemy-skill', d.enemy.skill);
  _setVal('sim193-enemy-en', d.enemy.endurance);
  _setVal('sim193-enemy-enmax', d.enemy.enduranceMax);
  _setVal('sim193-ratio', d.ratio);
  if (!skipEnemyPick) _setVal('sim193-enemy-pick', d.enemy.name);

  const potionBtn = document.getElementById('sim193-use-potion');
  potionBtn.disabled = !d.rolled || !d.hasHealingPotion || d.healingPotionUsed;
  potionBtn.textContent = d.healingPotionUsed ? t('battlesim193.btn.used') : t('battlesim193.btn.drink');

  const rollBtn = document.getElementById('sim193-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim193.btn.rolled') : t('battlesim193.btn.roll');

  const status = document.getElementById('sim193-status');
  if (!d.rolled) {
    status.textContent = t('battlesim193.status.not_ready');
  } else if (d.endurance <= 0) {
    status.textContent = t('battlesim193.status.fallen');
  } else if (d.enemy.endurance <= 0 && d.enemy.enduranceMax > 0) {
    status.textContent = t('battlesim193.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim193-round').disabled = !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim193-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim193-history-summary');
  const listEl = document.getElementById('sim193-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim193.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim193.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim193.history.won') : t('battlesim193.history.lost');
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

export function renderSim193() {
  const overlay = document.getElementById('sim193-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim193(); return; }
  _renderAll();
}

function openSim193() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim193-overlay').classList.add('active');
}

function closeSim193() {
  document.getElementById('sim193-overlay')?.classList.remove('active');
}

export function setSim193Visible(visible) {
  const btn = document.getElementById('sim193-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim193();
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

export function initSim193() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim193-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim193.ui.title')}</span>
        <button id="sim193-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim193-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim193.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim193.ui.cs'), 'sim193-cs')}
            ${_numField(t('battlesim193.ui.cs_initial'), 'sim193-csmax')}
            ${_numField(t('battlesim193.ui.en'), 'sim193-en')}
            ${_numField(t('battlesim193.ui.en_initial'), 'sim193-enmax')}
            ${_numField(t('battlesim193.ui.atkmod'), 'sim193-atkmod')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim193.ui.potion')}</span>
              <button id="sim193-use-potion" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim193.btn.drink')}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim193.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim193-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim193-enemy-pick-dropdown">
                <ul id="sim193-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim193.ui.enemy_cs'), 'sim193-enemy-skill')}
            ${_numField(t('battlesim193.ui.enemy_en'), 'sim193-enemy-en')}
            ${_numField(t('battlesim193.ui.enemy_en_max'), 'sim193-enemy-enmax')}
            ${_numField(t('battlesim193.ui.ratio'), 'sim193-ratio', null, true)}
          </div>
          <div id="sim193-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim193-round" class="inv-add-btn bsim-action-primary">${t('battlesim193.btn.round')}</button>
            <button id="sim193-reset" class="inv-add-btn">${t('battlesim193.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim193-history-summary">${t('battlesim193.history.summary', { n: 0 })}</summary>
            <div id="sim193-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim193-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim193-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim193);
  document.getElementById('sim193-close').addEventListener('click', closeSim193);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim193(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim193-overlay'),
    open:  openSim193,
    close: closeSim193,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim193();
  });

  document.getElementById('sim193-round').addEventListener('click', _runRound);
  document.getElementById('sim193-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim193-use-potion').addEventListener('click', _usePotion);

  document.getElementById('sim193-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.combatSkillInitial = _pick10() + 10;
    d.enduranceInitial   = _pick10() + 20;
    d.combatSkill = d.combatSkillInitial;
    d.endurance   = d.enduranceInitial;
    d.rolled = true;
    d.ratio  = _effectiveSkill(d) - d.enemy.skill;
    _appendLog(d, t('battlesim193.log.rolled', { cs: d.combatSkillInitial, en: d.enduranceInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim193-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim193-enemy-pick', 'sim193-enemy-pick-dropdown', enemy => {
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
    'sim193-cs': ['combatSkill'], 'sim193-csmax': ['combatSkillInitial'],
    'sim193-en': ['endurance'], 'sim193-enmax': ['enduranceInitial'],
    'sim193-atkmod': ['attackModifier'],
    'sim193-enemy-skill': ['enemy', 'skill'], 'sim193-enemy-en': ['enemy', 'endurance'], 'sim193-enemy-enmax': ['enemy', 'enduranceMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const allowNegative = id === 'sim193-atkmod';
      const val = allowNegative ? (parseInt(input.value, 10) || 0) : Math.max(0, parseInt(input.value, 10) || 0);
      if (path.length === 1) d[path[0]] = val;
      else d[path[0]][path[1]] = val;
      if (id === 'sim193-cs' || id === 'sim193-atkmod' || id === 'sim193-enemy-skill') d.ratio = _effectiveSkill(d) - d.enemy.skill;
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
