// ── Battle Simulator (Забраненият град / The Forbidden City, Bulgarian
// edition of Grey Star (World of Lone Wolf) book 2, id 440) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 440 only) by the caller in boot.js via
// setSim440Visible().
// To remove: delete this file, remove its import line and initSim440()/
// setSim440Visible() calls from boot.js, remove 'sim440' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// English original is book 282 ("The Forbidden City"), which has no sim of
// its own yet (has_battle_sim=0), so nothing to cross-reference there. This
// is the direct sequel to book 439 (Grey Star the Wizard) - its own final
// section literally ends mid-riddle with the answer deferred to this book,
// and this book's opening section picks up with that same riddle's answer.
// Same Grey Star combat system as battlesim439.js: БОЙНО УМЕНИЕ/ИЗДРЪЖЛИВОСТ
// Combat Ratio, ВОЛЯ as an untracked magic-point pool. The Combat Ratio +
// Combat Results Table system and COMBAT_TABLE below are the same mechanic
// used unchanged from battlesim118.js/battlesim322.js/battlesim430.js-
// battlesim439.js rather than re-derived.
//
// Combat Ratio = effective БОЙНИ УМЕНИЯ minus enemy's, computed once when an
// enemy is selected and fixed for the whole fight. Each round, pick 0-9
// (a 10-value die), bucket the ratio into the table's 13 printed columns
// (-11 or less .. 11 or greater), and COMBAT_TABLE[pickRow][ratioCol] gives
// [enemyLoss, lwLoss] simultaneously, including 'K' (automatically killed)
// at the extremes.
//
// БОЙНИ УМЕНИЯ (COMBAT SKILL) = pick+10, ИЗДРЪЖЛИВОСТ (ENDURANCE) = pick+20,
// both rolled once at chargen. ВОЛЯ (WILL, pick+20) is Grey Star's magic-
// point pool for his Magical Powers (Elementalism/Alchemy/Sorcery/Prophecy/
// Psychomancy/Charm/Invocation of the Dead) and Magical Wand - it has no
// combat-round mechanic of its own (never appears in an enemy stat block)
// and is not tracked here, same as every other un-simulated non-combat
// resource in this app's sims.
//
// attackModifier is a free-form +/- field covering every one-off БОЙНО
// УМЕНИЕ change this book's own rules describe by hand: surprise-attack
// bonuses, ally assistance (e.g. §11/§203 Urik's boomerang softening up an
// enemy first), and magic-resistance penalties against the king wizard
// Шасарак's magically-bred Магди hounds (-2 БОЙНО УМЕНИЕ per this book's
// own rules, every Магди encounter). Same precedent as every other sim in
// this app.
//
// Every multi-enemy encounter in this book is already a single combined
// stat line per the source text (e.g. §11/§225 "2/3 шадакински бойци" as
// one БОЙНО УМЕНИЕ/ИЗДРЪЖЛИВОСТ line, §176 "3 отрепки" as one line) - no
// sequential separate-stat-line encounters found in this book, unlike some
// prior books in this run.
//
// This book's only combat-healing item is Лаумспур (potion form, +4
// ИЗДРЪЖЛИВОСТ per dose, a one-off gift of two doses from Садо Дългия нож
// at §133) - modeled here as the sim's single post-battle heal slot (+4).
// This book ALSO has Кармо, a battle-prep potion that doubles both current
// ИЗДРЪЖЛИВОСТ and ВОЛЯ for one fight but costs a random-roll ИЗДРЪЖЛИВОСТ
// penalty as a side effect (§45) - a real book item, but a pre-fight
// stat-doubler with a random cost doesn't fit this sim's single-heal-slot
// model, so it is deliberately left unmodeled, same precedent as other
// un-simulated one-off minigames/items in this app.
//
// book_enemies.attack holds БОЙНО УМЕНИЕ, .hp holds ИЗДРЪЖЛИВОСТ, .defense
// unused - same convention as every other sim. 18 rows extracted directly
// from this book's own section text (regex on every "Name: БОЙНО УМЕНИЕ N,
// ИЗДРЪЖЛИВОСТ N" stat block). Two dropped ИЗДРЪЖЛИВОСТ values found and
// restored during the mandatory full prose read (§11 -> 24, §163 -> 25) -
// both caused by the same reflow bug as always (a genuine stat number on
// its own line got discarded as page-footer noise because the preceding
// text ended in "ИЗДРЪЖЛИВОСТ" rather than a link-destination "на").
//
// This book also surfaced a NEW corruption class not seen in books 434-439:
// a run of consecutive sections (§50-§53) where the printed book's own
// PAGE numbers happened to numerically collide with the SECTION numbers at
// that point, and several of those bare page-number lines lacked the
// period that normally disambiguates a section header from a page footer.
// The original header-reconstruction algorithm (accept the first line
// matching the expected sequential number) picked the bogus periodless
// page-number line over the genuine period-suffixed section header in
// several cases, silently merging two real sections' content together and
// misnumbering everything after until the true headers happened to resync.
// Fixed by rebuilding the header-acceptance algorithm to prefer a period-
// suffixed candidate whenever one exists for the expected number, only
// falling back to a periodless candidate (still needed for a few
// legitimately period-less headers elsewhere in the book) when no
// period-suffixed one is available - re-verified as monotonically
// increasing by line number afterward. ~13 further illustration-caption-
// bleed artifacts (duplicated/misplaced descriptive fragments, several with
// stray page-footer digits bleeding mid-sentence, e.g. §24/§37/§76/§79/
// §182/§220/§225/§247/§251/§254/§257/§298/§307) were fixed inline during
// the prose read. One confirmed-benign orphan section (§162, a
// pentagram-trap scene with zero incoming references anywhere in the
// source PDF, matching book 439's §342 precedent) was left unreached.
//
// All state lives in pt.sim440, per-user/per-book via currentPlaythrough().
// All state lives in pt.sim440, per-user/per-book via currentPlaythrough().

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
// -2/-1, 0, 1/2, 3/4, 5/6, 7/8, 9/10, 11+. Cell = [enemyLoss, lwLoss]
// ('K' sentinel = automatically killed). Byte-identical to battlesim118.js.
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
  if (!pt.sim440) {
    pt.sim440 = {
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
  const d = pt.sim440;
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
  _appendLog(d, t('battlesim440.log.round', { round: d.roundsThisBattle, ratio: d.ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (lwLoss === 'K') d.endurance = 0;
  else d.endurance = Math.max(0, d.endurance - lwLoss);

  _appendLog(d, t('battlesim440.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'K' ? t('battlesim440.log.k_word') : enemyLoss,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? t('battlesim440.log.k_word') : lwLoss,
    endurance: d.endurance, enduranceMax: d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim440.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim440.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.endurance = d.enemy.enduranceMax;
  d.endurance = d.enduranceInitial;
  if (d.log.length) _appendLog(d, t('battlesim440.log.reset_sep'));
  _appendLog(d, t('battlesim440.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

function _usePotion() {
  const d = _data();
  if (!d || !d.rolled || !d.hasHealingPotion || d.healingPotionUsed) return;
  if (d.roundsThisBattle > 0 && d.endurance > 0 && d.enemy.endurance > 0) {
    showAlert(t('battlesim440.alert.potion_midfight'));
    return;
  }
  d.healingPotionUsed = true;
  const before = d.endurance;
  d.endurance = Math.min(d.enduranceInitial, d.endurance + HEALING_POTION_HEAL);
  _appendLog(d, t('battlesim440.log.potion', { before, endurance: d.endurance, enduranceMax: d.enduranceInitial }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">БУ:${e.attack ?? '?'} ТИ:${e.hp ?? '?'}</span></li>`
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
  _setVal('sim440-cs', d.combatSkill);
  _setVal('sim440-csmax', d.combatSkillInitial);
  _setVal('sim440-en', d.endurance);
  _setVal('sim440-enmax', d.enduranceInitial);
  _setVal('sim440-atkmod', d.attackModifier);
  _setVal('sim440-enemy-skill', d.enemy.skill);
  _setVal('sim440-enemy-en', d.enemy.endurance);
  _setVal('sim440-enemy-enmax', d.enemy.enduranceMax);
  _setVal('sim440-ratio', d.ratio);
  if (!skipEnemyPick) _setVal('sim440-enemy-pick', d.enemy.name);

  const potionBtn = document.getElementById('sim440-use-potion');
  potionBtn.disabled = !d.rolled || !d.hasHealingPotion || d.healingPotionUsed;
  potionBtn.textContent = d.healingPotionUsed ? t('battlesim440.btn.used') : t('battlesim440.btn.drink');

  const rollBtn = document.getElementById('sim440-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim440.btn.rolled') : t('battlesim440.btn.roll');

  const status = document.getElementById('sim440-status');
  if (!d.rolled) {
    status.textContent = t('battlesim440.status.not_ready');
  } else if (d.endurance <= 0) {
    status.textContent = t('battlesim440.status.fallen');
  } else if (d.enemy.endurance <= 0 && d.enemy.enduranceMax > 0) {
    status.textContent = t('battlesim440.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim440-round').disabled = !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim440-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim440-history-summary');
  const listEl = document.getElementById('sim440-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim440.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim440.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim440.history.won') : t('battlesim440.history.lost');
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

export function renderSim440() {
  const overlay = document.getElementById('sim440-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim440(); return; }
  _renderAll();
}

function openSim440() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim440-overlay').classList.add('active');
}

function closeSim440() {
  document.getElementById('sim440-overlay')?.classList.remove('active');
}

export function setSim440Visible(visible) {
  const btn = document.getElementById('sim440-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim440();
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

export function initSim440() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim440-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim440.ui.title')}</span>
        <button id="sim440-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim440-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim440.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim440.ui.cs'), 'sim440-cs')}
            ${_numField(t('battlesim440.ui.cs_initial'), 'sim440-csmax')}
            ${_numField(t('battlesim440.ui.en'), 'sim440-en')}
            ${_numField(t('battlesim440.ui.en_initial'), 'sim440-enmax')}
            ${_numField(t('battlesim440.ui.atkmod'), 'sim440-atkmod')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim440.ui.potion')}</span>
              <button id="sim440-use-potion" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim440.btn.drink')}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim440.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim440-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim440-enemy-pick-dropdown">
                <ul id="sim440-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim440.ui.enemy_cs'), 'sim440-enemy-skill')}
            ${_numField(t('battlesim440.ui.enemy_en'), 'sim440-enemy-en')}
            ${_numField(t('battlesim440.ui.enemy_en_max'), 'sim440-enemy-enmax')}
            ${_numField(t('battlesim440.ui.ratio'), 'sim440-ratio', null, true)}
          </div>
          <div id="sim440-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim440-round" class="inv-add-btn bsim-action-primary">${t('battlesim440.btn.round')}</button>
            <button id="sim440-reset" class="inv-add-btn">${t('battlesim440.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim440-history-summary">${t('battlesim440.history.summary', { n: 0 })}</summary>
            <div id="sim440-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim440-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim440-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim440);
  document.getElementById('sim440-close').addEventListener('click', closeSim440);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim440(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim440-overlay'),
    open:  openSim440,
    close: closeSim440,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim440();
  });

  document.getElementById('sim440-round').addEventListener('click', _runRound);
  document.getElementById('sim440-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim440-use-potion').addEventListener('click', _usePotion);

  document.getElementById('sim440-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.combatSkillInitial = _pick10() + 10;
    d.enduranceInitial   = _pick10() + 20;
    d.combatSkill = d.combatSkillInitial;
    d.endurance   = d.enduranceInitial;
    d.rolled = true;
    d.ratio  = _effectiveSkill(d) - d.enemy.skill;
    _appendLog(d, t('battlesim440.log.rolled', { cs: d.combatSkillInitial, en: d.enduranceInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim440-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim440-enemy-pick', 'sim440-enemy-pick-dropdown', enemy => {
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
    'sim440-cs': ['combatSkill'], 'sim440-csmax': ['combatSkillInitial'],
    'sim440-en': ['endurance'], 'sim440-enmax': ['enduranceInitial'],
    'sim440-atkmod': ['attackModifier'],
    'sim440-enemy-skill': ['enemy', 'skill'], 'sim440-enemy-en': ['enemy', 'endurance'], 'sim440-enemy-enmax': ['enemy', 'enduranceMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const allowNegative = id === 'sim440-atkmod';
      const val = allowNegative ? (parseInt(input.value, 10) || 0) : Math.max(0, parseInt(input.value, 10) || 0);
      if (path.length === 1) d[path[0]] = val;
      else d[path[0]][path[1]] = val;
      if (id === 'sim440-cs' || id === 'sim440-atkmod' || id === 'sim440-enemy-skill') d.ratio = _effectiveSkill(d) - d.enemy.skill;
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
