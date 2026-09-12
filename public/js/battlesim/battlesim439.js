// ── Battle Simulator (Магьосникът Сива звезда / Grey Star the Wizard,
// Bulgarian edition of Grey Star (World of Lone Wolf) book 1, id 439) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 439 only) by the caller in boot.js via
// setSim439Visible().
// To remove: delete this file, remove its import line and initSim439()/
// setSim439Visible() calls from boot.js, remove 'sim439' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// English original is book 281 ("Grey Star the Wizard"), which has no sim
// of its own yet (has_battle_sim=0), so nothing to cross-reference there.
// Grey Star is a spinoff series set in the World of Lone Wolf and uses the
// same БОЙНО УМЕНИЕ/ИЗДРЪЖЛИВОСТ Combat Ratio system for physical combat
// (its own stat blocks read identically, e.g. "Куоку: БОЙНО УМЕНИЕ 12,
// ИЗДРЪЖЛИВОСТ 30"), so the Combat Ratio + Combat Results Table system and
// COMBAT_TABLE below are the same mechanic used unchanged from
// battlesim118.js/battlesim322.js/battlesim430.js/battlesim431.js/
// battlesim432.js/battlesim434.js-battlesim438.js rather than re-derived.
//
// Combat Ratio = effective БОЙНИ УМЕНИЯ minus enemy's, computed once when an
// enemy is selected and fixed for the whole fight. Each round, pick 0-9
// (a 10-value die), bucket the ratio into the table's 13 printed columns
// (-11 or less .. 11 or greater), and COMBAT_TABLE[pickRow][ratioCol] gives
// [enemyLoss, lwLoss] simultaneously, including 'K' (automatically killed)
// at the extremes.
//
// БОЙНИ УМЕНИЯ (COMBAT SKILL) = pick+10, ИЗДРЪЖЛИВОСТ (ENDURANCE) = pick+20,
// both rolled once at chargen, same as Lone Wolf. Grey Star ALSO has a
// third chargen-rolled stat, ВОЛЯ (WILL, pick+20) - his equivalent of a
// magic-point pool spent on Magical Powers (Elementalism/Alchemy/Sorcery/
// Prophecy/Psychomancy/Charm/Invocation of the Dead) and the Magical Wand.
// ВОЛЯ has no combat-round mechanic of its own in this sim (it never
// appears in an enemy stat block) and is not tracked here, matching every
// other un-simulated non-combat resource in this app's sims (e.g. Kai
// Discipline choices in the Lone Wolf sims aren't tracked either) - it only
// matters for the book's own text-driven puzzle/escape sequences, not the
// combat encounters this sim models.
//
// attackModifier is a free-form +/- field covering every one-off БОЙНО
// УМЕНИЕ change this book's own rules describe by hand: surprise-attack
// bonuses (e.g. §99 +2, §308/§309 +4), ally assistance (e.g. §120/§203/
// §205 Shan/Tanit adding flat points), and defensive penalties for fighting
// a poison-skinned foe carefully (e.g. §231 Kuoku, -2). Same precedent as
// every other sim in this app.
//
// Every multi-enemy encounter in this book (e.g. §101 nine Neijin fought as
// nine separate stat lines, §260/§272/§284 multiple Mantiz warriors) is
// already represented as separate book_enemies rows per the standard
// "re-pick the next roster enemy after defeating the current one" pattern -
// no special code needed.
//
// This book's combat-healing items are Лаумспур (a potion form restoring 3
// ИЗДРЪЖЛИВОСТ, sold at §183 and given by Джейнана at §161; a freshly-picked
// raw-herb form at §38/§58 restores 4 but can't be carried) and the
// Елексирът на Рендалим (+6, a one-off gift at §215) - NOT the Лаумспур/
// Рендалим/Оксидин trio from books 434-437, a different combination. Only
// the potion form of Лаумспур (+3) is modeled here as the sim's single
// post-battle heal slot, matching every other Lone Wolf/Grey Star sim in
// this app; Rendalim's elixir is a real but unmodeled one-off item, same
// precedent as un-modeled non-combat minigames elsewhere.
//
// book_enemies.attack holds БОЙНО УМЕНИЕ, .hp holds ИЗДРЪЖЛИВОСТ, .defense
// unused - same convention as every other sim. 34 rows extracted directly
// from this book's own section text (regex on every "Name: БОЙНО УМЕНИЕ N,
// ИЗДРЪЖЛИВОСТ N" stat block), including §259's "Здрачна стая" (Twilight
// Room) - a mental/willpower duel represented with a genuine combat stat
// block in the source text, so included as a real encounter. No dropped
// ИЗДРЪЖЛИВОСТ values were found in this book during the mandatory full
// prose read (clean header reconstruction: 350/350 genuine headers
// recovered on the first pass); instead this book's corruption took the
// form of ~13 illustration-caption-bleed artifacts (duplicated or misplaced
// descriptive fragments and stray page-footer digits bleeding mid-sentence,
// e.g. §110/§175/§187/§197/§224/§233/§266/§292/§344/§347/§350) and one
// confirmed-benign orphan section (§342, a pit-climb scene with zero
// incoming references anywhere in the source PDF - no riddle or duplicate
// content explains it, so treated as a genuine authorial dead branch) -
// all fixed/documented inline during the prose read. §110 is a genuine
// riddle-destination (its own text says "(това е вярното решение на
// задачата)"), matching the established riddle-destination pattern.
//
// All state lives in pt.sim439, per-user/per-book via currentPlaythrough().

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
  if (!pt.sim439) {
    pt.sim439 = {
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
  const d = pt.sim439;
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
  _appendLog(d, t('battlesim439.log.round', { round: d.roundsThisBattle, ratio: d.ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (lwLoss === 'K') d.endurance = 0;
  else d.endurance = Math.max(0, d.endurance - lwLoss);

  _appendLog(d, t('battlesim439.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'K' ? t('battlesim439.log.k_word') : enemyLoss,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? t('battlesim439.log.k_word') : lwLoss,
    endurance: d.endurance, enduranceMax: d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim439.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim439.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.endurance = d.enemy.enduranceMax;
  d.endurance = d.enduranceInitial;
  if (d.log.length) _appendLog(d, t('battlesim439.log.reset_sep'));
  _appendLog(d, t('battlesim439.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

function _usePotion() {
  const d = _data();
  if (!d || !d.rolled || !d.hasHealingPotion || d.healingPotionUsed) return;
  if (d.roundsThisBattle > 0 && d.endurance > 0 && d.enemy.endurance > 0) {
    showAlert(t('battlesim439.alert.potion_midfight'));
    return;
  }
  d.healingPotionUsed = true;
  const before = d.endurance;
  d.endurance = Math.min(d.enduranceInitial, d.endurance + HEALING_POTION_HEAL);
  _appendLog(d, t('battlesim439.log.potion', { before, endurance: d.endurance, enduranceMax: d.enduranceInitial }));
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
  _setVal('sim439-cs', d.combatSkill);
  _setVal('sim439-csmax', d.combatSkillInitial);
  _setVal('sim439-en', d.endurance);
  _setVal('sim439-enmax', d.enduranceInitial);
  _setVal('sim439-atkmod', d.attackModifier);
  _setVal('sim439-enemy-skill', d.enemy.skill);
  _setVal('sim439-enemy-en', d.enemy.endurance);
  _setVal('sim439-enemy-enmax', d.enemy.enduranceMax);
  _setVal('sim439-ratio', d.ratio);
  if (!skipEnemyPick) _setVal('sim439-enemy-pick', d.enemy.name);

  const potionBtn = document.getElementById('sim439-use-potion');
  potionBtn.disabled = !d.rolled || !d.hasHealingPotion || d.healingPotionUsed;
  potionBtn.textContent = d.healingPotionUsed ? t('battlesim439.btn.used') : t('battlesim439.btn.drink');

  const rollBtn = document.getElementById('sim439-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim439.btn.rolled') : t('battlesim439.btn.roll');

  const status = document.getElementById('sim439-status');
  if (!d.rolled) {
    status.textContent = t('battlesim439.status.not_ready');
  } else if (d.endurance <= 0) {
    status.textContent = t('battlesim439.status.fallen');
  } else if (d.enemy.endurance <= 0 && d.enemy.enduranceMax > 0) {
    status.textContent = t('battlesim439.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim439-round').disabled = !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0;
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim439-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim439-history-summary');
  const listEl = document.getElementById('sim439-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim439.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim439.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim439.history.won') : t('battlesim439.history.lost');
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

export function renderSim439() {
  const overlay = document.getElementById('sim439-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim439(); return; }
  _renderAll();
}

function openSim439() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim439-overlay').classList.add('active');
}

function closeSim439() {
  document.getElementById('sim439-overlay')?.classList.remove('active');
}

export function setSim439Visible(visible) {
  const btn = document.getElementById('sim439-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim439();
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

export function initSim439() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim439-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim439.ui.title')}</span>
        <button id="sim439-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim439-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim439.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim439.ui.cs'), 'sim439-cs')}
            ${_numField(t('battlesim439.ui.cs_initial'), 'sim439-csmax')}
            ${_numField(t('battlesim439.ui.en'), 'sim439-en')}
            ${_numField(t('battlesim439.ui.en_initial'), 'sim439-enmax')}
            ${_numField(t('battlesim439.ui.atkmod'), 'sim439-atkmod')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim439.ui.potion')}</span>
              <button id="sim439-use-potion" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim439.btn.drink')}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim439.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim439-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim439-enemy-pick-dropdown">
                <ul id="sim439-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim439.ui.enemy_cs'), 'sim439-enemy-skill')}
            ${_numField(t('battlesim439.ui.enemy_en'), 'sim439-enemy-en')}
            ${_numField(t('battlesim439.ui.enemy_en_max'), 'sim439-enemy-enmax')}
            ${_numField(t('battlesim439.ui.ratio'), 'sim439-ratio', null, true)}
          </div>
          <div id="sim439-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim439-round" class="inv-add-btn bsim-action-primary">${t('battlesim439.btn.round')}</button>
            <button id="sim439-reset" class="inv-add-btn">${t('battlesim439.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim439-history-summary">${t('battlesim439.history.summary', { n: 0 })}</summary>
            <div id="sim439-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim439-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim439-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim439);
  document.getElementById('sim439-close').addEventListener('click', closeSim439);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim439(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim439-overlay'),
    open:  openSim439,
    close: closeSim439,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim439();
  });

  document.getElementById('sim439-round').addEventListener('click', _runRound);
  document.getElementById('sim439-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim439-use-potion').addEventListener('click', _usePotion);

  document.getElementById('sim439-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.combatSkillInitial = _pick10() + 10;
    d.enduranceInitial   = _pick10() + 20;
    d.combatSkill = d.combatSkillInitial;
    d.endurance   = d.enduranceInitial;
    d.rolled = true;
    d.ratio  = _effectiveSkill(d) - d.enemy.skill;
    _appendLog(d, t('battlesim439.log.rolled', { cs: d.combatSkillInitial, en: d.enduranceInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim439-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim439-enemy-pick', 'sim439-enemy-pick-dropdown', enemy => {
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
    'sim439-cs': ['combatSkill'], 'sim439-csmax': ['combatSkillInitial'],
    'sim439-en': ['endurance'], 'sim439-enmax': ['enduranceInitial'],
    'sim439-atkmod': ['attackModifier'],
    'sim439-enemy-skill': ['enemy', 'skill'], 'sim439-enemy-en': ['enemy', 'endurance'], 'sim439-enemy-enmax': ['enemy', 'enduranceMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const allowNegative = id === 'sim439-atkmod';
      const val = allowNegative ? (parseInt(input.value, 10) || 0) : Math.max(0, parseInt(input.value, 10) || 0);
      if (path.length === 1) d[path[0]] = val;
      else d[path[0]][path[1]] = val;
      if (id === 'sim439-cs' || id === 'sim439-atkmod' || id === 'sim439-enemy-skill') d.ratio = _effectiveSkill(d) - d.enemy.skill;
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
