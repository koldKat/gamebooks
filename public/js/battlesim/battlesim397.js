// ── Battle Simulator (Пътят на съдбата / Doomwalk, book 397, Blood Sword
//    book 4 by Dave Morris & Oliver Johnson) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 397 only) by the caller in boot.js via
// setSim397Visible().
// To remove: delete this file, remove its import line and initSim397()/
// setSim397Visible() calls from boot.js, remove 'sim397' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim397-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim397-btn selectors in
// battlesim.css.
//
// Same mechanic as books 317/318/319/320 (battlesim317.js et al) - confirmed
// from this book's own rules recap (identical wording to the other three).
// This is the Bulgarian translation of book 320 (Doomwalk); both editions
// share identical section numbering (confirmed: both total 557 sections,
// and every stat-block-bearing section below has matching Fighting
// Prowess/Damage/Endurance numbers in both languages), so this roster was
// cross-checked directly against battlesim320.js's already-verified data
// rather than re-derived from scratch. Four attributes: Fighting Prowess (to-hit), Psychic
// Ability (narrative/spell-resist only, not modeled), Awareness (turn-order
// only, not modeled), Endurance (hp). Per-round choice of Attack (2d6
// to-hit, then 1-2 damage dice + flat bonus minus target Armour Rating) or
// Defend (skips own attack, forces the enemy to roll 3d6 instead of 2d6 to
// hit).
//
// Starting rank: this book's own text states 16th rank for a solo player,
// same as book 319. Rank-16 stats read fresh from this book's own class
// tables (identical numbers to book 319's, confirmed independently rather
// than assumed): Warrior FP 10/Dmg 6d6/End 96/Armour 3 (chainmail),
// Trickster FP 9/Dmg 5d6+2/End 96/Armour 2, Sage FP 9/Dmg 5d6+2/End 80/
// Armour 2, Enchanter FP 9/Dmg 4d6+2/End 80/Armour 2. Selecting a class in
// this sim's UI just fills these starting numbers in as a convenience
// default - every field remains hand-editable afterward.
//
// Full enemy roster (28 rows, cross-verified against battlesim320.js's
// English data at the same section numbers - every name below carries its
// Bulgarian book_enemies label in brackets). Recurring encounters retold
// at several points are seeded once at their most representative value:
//   - Thangbrand [Тангбранд] (§10): FP 9, Dmg 4d6, End 48, Armour 2.
//   - Gaoler [Тъмничар] (§33): FP 7, Dmg 1d6+1, End 12, Armour 1.
//   - Tobias [Тобиас] (§35/§161, identical Endurance both times, Armour
//     differs - seeded at the first, stronger encounter): FP 10, Dmg 5d6,
//     End 65, Armour 3. Immune to Servile Enthralment; his prepared spells
//     aren't modeled.
//   - Magsmen [Грабители] (§38/§268, group of 6): FP 7, Dmg 1d6, End 15
//     each, Armour 1.
//   - Angvar [Ангвар] (§54/§394, identical both tellings, a god-tier
//     optional/story boss): FP 11, Dmg 7d6, End 950, Armour 0. This
//     Endurance is not a typo - it's printed as 950 in both tellings,
//     clearly intended as an effectively-unwinnable narrative encounter
//     rather than a real fight to grind down; included for completeness,
//     not as a realistic sim target. Immune to Command/Sheet
//     Lightning/Nemesis Bolt.
//   - Garm the Giant [Великанът Гарм] (§105): FP 7, Dmg 7d6, End 68,
//     Armour 1.
//   - The Gorgon [Горгоната] (§108): FP 8, Dmg 5d6, End 80, Armour 0. Its
//     gaze-kill rule (instant death on a 1-4 roll of one die under certain
//     conditions) isn't modeled.
//   - Icon [Айкън] (§121): FP 9, Dmg 5d6, End 55, Armour 0. Immune to
//     Servile Enthralment; his four alternating spells aren't modeled.
//   - Knight [Рицар] (§132): FP 9, Dmg 3d6+1, End 48, Armour 0.
//   - Wights [Твари] (§148, group of 7): FP 7, Dmg 1d6+1, End 15 each,
//     Armour 2.
//   - Typhon the Giant [Великанът Тифон] (§178/§398, identical both
//     tellings): FP 8, Dmg 6d6+1, End 70, Armour 3.
//   - Gamblers [Комарджии] (§182, group of 6): FP 8, Dmg 1d6+2, End 18
//     each, Armour 0.
//   - The Horned Bat [Рогат прилеп] (§216/§447/§531, identical every
//     telling, fought alongside its partner below): FP 9, Dmg 3d6, End 42,
//     Armour 0. Can hover to make itself un-flankable with 3+ players -
//     not modeled.
//   - The Bearded Dog [Брадато куче] (§216/§447/§531, identical every
//     telling, The Horned Bat's partner): FP 8, Dmg 4d6+1, End 56,
//     Armour 1.
//   - Icon-simulacra [Двойници на Айкън] (§240, a pair of illusory
//     duplicates): FP 9, Dmg 5d6, End unknown per the source text itself
//     ("Няма да можеш да разбереш каква е издръжливостта им, докато не ги
//     раниш") - a genuine narrative data gap, not an extraction failure;
//     seeded at End 55 (matching the real Icon's own value at §121) as a
//     plausible placeholder, flagged here as not a confirmed print value.
//   - Treasure Guardian [Пазач на съкровището] (§278): FP 9, Dmg 3d6,
//     End 45, Armour 1.
//   - Cappellars [Капелани] (§290, group of 4): FP 8, Dmg 2d6+2, End 36
//     each, Armour 0.
//   - Lei Kung [Лей Кунг] (§339): FP 9, Dmg 4d6, End 35, Armour 0.
//     Lightning-type strikes not modeled as a separate damage category.
//   - Bronze Warriors [Бронзови Воини] (§340, group of 8): FP 7, Dmg 1d6,
//     End 10 each, Armour 1.
//   - Circe [Цирцея] (§340, a spellcaster fought alongside the Bronze
//     Warriors): FP 5, Dmg 1d6-2, End 30, Armour 0. Her Deathgaze Psychic
//     spell isn't modeled.
//   - Skeleton [Скелет] (§346): FP 8, Dmg 3d6, End 32, Armour 0. Its
//     growing aura (Psychic Ability +1/round) isn't modeled.
//   - Replicas [Двойници (пъзел)] (§349, four identical targets each at
//     very low Endurance - a puzzle fight, not a real combat grind): FP 9,
//     Dmg 5d6, End 1 each, Armour 0.
//   - Puldro, hostile [Пулдро (враждебен)] (§357): FP 6, Dmg 3d6, End 40,
//     Armour 0. Distinct from the same character fighting ALONGSIDE the
//     player later (§416, FP 7/Dmg 1d6+2/End 25) - only the hostile
//     encounter is seeded here, since an ally isn't a sim target.
//   - Susurrien [Сузуриен] (§381): FP 8, Dmg 4d6, End 80, Armour 0. His
//     per-round action roll (sword/spells) isn't modeled - this sim
//     represents his sword option only.
//   - Cacodemon [Какодемон] (§422): FP 8, Dmg 3d6+3, End 27, Armour 6.
//     Can't move from its spot - not modeled (irrelevant to this app's 1v1
//     sim shape).
//   - Hall-Heroes [Дворцови герои] (§439, group of 7): FP 8, Dmg 2d6+1,
//     End 24 each, Armour 3.
//   - Feasting Dead [Пируващите мъртъвци] (§463, group of 5): FP 6, Dmg
//     1d6+3, End 18 each, Armour 0.
//   - Blacksmith [Ковач] (§516): FP 8, Dmg 2d6+1, End 18, Armour 0.
//
// book_enemies column reuse (only 4 numeric columns exist; this book needs
// 5): attack = Fighting Prowess; hp = Endurance; pb = damage dice count;
// defense = damage flat bonus. Armour Rating has no column - NOT
// autocomplete-seeded, always resets to 0 on enemy pick, hand-entered per
// fight from the notes above.
//
// All state lives in pt.sim397, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Rank 16 (solo Adventurer) starting stats per class, from the book's own
// character tables - autocomplete-style convenience defaults only.
const CLASS_PRESETS = {
  warrior:   { fp: 10, dmgDice: 6, dmgBonus: 0, endurance: 96, armor: 3 },
  trickster: { fp: 9,  dmgDice: 5, dmgBonus: 2, endurance: 96, armor: 2 },
  mystic:    { fp: 9,  dmgDice: 5, dmgBonus: 2, endurance: 80, armor: 2 },
  sorcerer:  { fp: 9,  dmgDice: 4, dmgBonus: 2, endurance: 80, armor: 2 },
};

function _emptyEnemy() {
  return { name: '', fp: 0, endurance: 0, enduranceMax: 0, dmgDice: 1, dmgBonus: 0, armor: 0 };
}

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim397) {
    const w = CLASS_PRESETS.warrior;
    pt.sim397 = {
      player: {
        fp: w.fp, endurance: w.endurance, enduranceInitial: w.endurance,
        dmgDice: w.dmgDice, dmgBonus: w.dmgBonus, armor: w.armor,
      },
      enemy: _emptyEnemy(),
      pendingDefendRound: false,
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim397;
  const p = d.player;
  if (p.fp === undefined) p.fp = 10;
  if (p.endurance === undefined) p.endurance = 96;
  if (p.enduranceInitial === undefined) p.enduranceInitial = 96;
  if (p.dmgDice === undefined) p.dmgDice = 6;
  if (p.dmgBonus === undefined) p.dmgBonus = 0;
  if (p.armor === undefined) p.armor = 3;
  if (!d.enemy) d.enemy = _emptyEnemy();
  const e = d.enemy;
  if (e.fp === undefined) e.fp = 0;
  if (e.dmgDice === undefined) e.dmgDice = 1;
  if (e.dmgBonus === undefined) e.dmgBonus = 0;
  if (e.armor === undefined) e.armor = 0;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }
function _roll2d6() { return _roll1d6() + _roll1d6(); }
function _roll3d6() { return _roll1d6() + _roll1d6() + _roll1d6(); }
function _rollNd6(n) { let s = 0; for (let i = 0; i < n; i++) s += _roll1d6(); return s; }

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
    _appendLog(d, t('battlesim397.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _applyPlayerFall(d) {
  if (d.player.endurance <= 0) {
    _appendLog(d, t('battlesim397.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _enemyStrike(d, threeDice) {
  const roll = threeDice ? _roll3d6() : _roll2d6();
  const hit = roll <= d.enemy.fp;
  if (!hit) {
    _appendLog(d, t('battlesim397.log.enemy_misses', { enemy: _enemyNameSafe(d), dice: threeDice ? 3 : 2, roll, fp: d.enemy.fp }));
    return;
  }
  const raw = _rollNd6(Math.max(1, d.enemy.dmgDice)) + (d.enemy.dmgBonus || 0);
  const dmg = Math.max(0, raw - (d.player.armor || 0));
  d.player.endurance = Math.max(0, d.player.endurance - dmg);
  _appendLog(d, t('battlesim397.log.enemy_hits', { enemy: _enemyNameSafe(d), dice: threeDice ? 3 : 2, roll, fp: d.enemy.fp, raw, armor: d.player.armor, n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
}

function _attack() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  d.roundsThisBattle++;

  const roll = _roll2d6();
  const hit = roll <= d.player.fp;
  _appendLog(d, t('battlesim397.log.attack', { roll, fp: d.player.fp, enemy: _enemyNameSafe(d) }));

  if (!hit) {
    _appendLog(d, t('battlesim397.log.miss'));
  } else {
    const raw = _rollNd6(Math.max(1, d.player.dmgDice)) + (d.player.dmgBonus || 0);
    const dmg = Math.max(0, raw - (d.enemy.armor || 0));
    d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
    _appendLog(d, t('battlesim397.log.you_hit', { enemy: _enemyNameSafe(d), raw, armor: d.enemy.armor, n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax }));
  }

  if (!_applyEnemyDefeat(d)) {
    _enemyStrike(d, false);
    _applyPlayerFall(d);
  }
  saveState();
  _renderAll();
}

function _defend() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  d.roundsThisBattle++;
  _appendLog(d, t('battlesim397.log.defend'));
  _enemyStrike(d, true);
  _applyPlayerFall(d);
  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.endurance = d.enemy.enduranceMax;
  d.player.endurance = d.player.enduranceInitial;
  d.roundsThisBattle = 0;
  if (d.log.length) _appendLog(d, t('battlesim397.log.reset_sep'));
  _appendLog(d, t('battlesim397.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

function _applyClassPreset(cls) {
  const d = _data();
  if (!d) return;
  const preset = CLASS_PRESETS[cls];
  if (!preset) return;
  d.player.fp = preset.fp;
  d.player.dmgDice = preset.dmgDice;
  d.player.dmgBonus = preset.dmgBonus;
  d.player.endurance = preset.endurance;
  d.player.enduranceInitial = preset.endurance;
  d.player.armor = preset.armor;
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim397.ui.endurance')}:${e.hp ?? '?'}</span></li>`
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
  const p = d.player, e = d.enemy;

  _setVal('sim397-player-fp', p.fp);
  _setVal('sim397-player-endurance', p.endurance);
  _setVal('sim397-player-endurancemax', p.enduranceInitial);
  _setVal('sim397-player-dmgdice', p.dmgDice);
  _setVal('sim397-player-dmgbonus', p.dmgBonus);
  _setVal('sim397-player-armor', p.armor);

  if (!skipEnemyPick) _setVal('sim397-enemy-pick', e.name);
  _setVal('sim397-enemy-fp', e.fp);
  _setVal('sim397-enemy-endurance', e.endurance);
  _setVal('sim397-enemy-endurancemax', e.enduranceMax);
  _setVal('sim397-enemy-dmgdice', e.dmgDice);
  _setVal('sim397-enemy-dmgbonus', e.dmgBonus);
  _setVal('sim397-enemy-armor', e.armor);

  const over = _battleOver(d);
  document.getElementById('sim397-attack').disabled = over;
  document.getElementById('sim397-defend').disabled = over;

  const status = document.getElementById('sim397-status');
  if (p.endurance <= 0) status.innerHTML = t('battlesim397.status.fallen', { skull: SVG_SKULL });
  else if (e.enduranceMax > 0 && e.endurance <= 0) status.innerHTML = t('battlesim397.status.victory', { trophy: SVG_TROPHY });
  else status.innerHTML = '';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim397-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim397-history-summary');
  const listEl = document.getElementById('sim397-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim397.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim397.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim397.history.won') : t('battlesim397.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim397.ui.endurance')} ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim397() {
  const overlay = document.getElementById('sim397-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim397(); return; }
  _renderAll();
}

function openSim397() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim397-overlay').classList.add('active');
}

function closeSim397() {
  document.getElementById('sim397-overlay')?.classList.remove('active');
}

export function setSim397Visible(visible) {
  const btn = document.getElementById('sim397-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim397();
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

export function initSim397() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim397-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim397.ui.title')}</span>
        <button id="sim397-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim397.ui.you')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim397.ui.class')}</span>
              <select id="sim397-class-pick" class="inv-edit-input">
                <option value="">${t('battlesim397.ui.class_pick')}</option>
                <option value="warrior">${t('battlesim397.ui.class_warrior')}</option>
                <option value="trickster">${t('battlesim397.ui.class_trickster')}</option>
                <option value="mystic">${t('battlesim397.ui.class_mystic')}</option>
                <option value="sorcerer">${t('battlesim397.ui.class_sorcerer')}</option>
              </select>
            </div>
            ${_numField(t('battlesim397.ui.fp'), 'sim397-player-fp')}
            ${_numField(t('battlesim397.ui.endurance'), 'sim397-player-endurance')}
            ${_numField(t('battlesim397.ui.endurance_initial'), 'sim397-player-endurancemax')}
            ${_numField(t('battlesim397.ui.dmg_dice'), 'sim397-player-dmgdice')}
            ${_numField(t('battlesim397.ui.dmg_bonus'), 'sim397-player-dmgbonus')}
            ${_numField(t('battlesim397.ui.armor'), 'sim397-player-armor')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim397.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim397.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim397-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim397-enemy-pick-dropdown">
                <ul id="sim397-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim397.ui.fp'), 'sim397-enemy-fp')}
            ${_numField(t('battlesim397.ui.endurance'), 'sim397-enemy-endurance')}
            ${_numField(t('battlesim397.ui.endurance_max'), 'sim397-enemy-endurancemax')}
            ${_numField(t('battlesim397.ui.dmg_dice'), 'sim397-enemy-dmgdice')}
            ${_numField(t('battlesim397.ui.dmg_bonus'), 'sim397-enemy-dmgbonus')}
            ${_numField(t('battlesim397.ui.armor'), 'sim397-enemy-armor')}
          </div>
          <div id="sim397-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim397-attack" class="inv-add-btn bsim-action-primary">${t('battlesim397.btn.attack')}</button>
            <button id="sim397-defend" class="inv-add-btn">${t('battlesim397.btn.defend')}</button>
            <button id="sim397-reset" class="inv-add-btn">${t('battlesim397.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim397-history-summary">${t('battlesim397.history.summary', { n: 0 })}</summary>
            <div id="sim397-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim397-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim397-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim397);
  document.getElementById('sim397-close').addEventListener('click', closeSim397);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim397(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim397-overlay'),
    open:  openSim397,
    close: closeSim397,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim397();
  });

  document.getElementById('sim397-attack').addEventListener('click', _attack);
  document.getElementById('sim397-defend').addEventListener('click', _defend);
  document.getElementById('sim397-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim397-class-pick').addEventListener('change', e => {
    if (e.target.value) _applyClassPreset(e.target.value);
  });

  document.getElementById('sim397-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim397-enemy-pick', 'sim397-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name        = enemy.name;
    d.enemy.fp           = enemy.attack ?? 0;
    d.enemy.endurance    = enemy.hp ?? 0;
    d.enemy.enduranceMax = enemy.hp ?? 0;
    d.enemy.dmgDice      = enemy.pb ?? 1;
    d.enemy.dmgBonus     = enemy.defense ?? 0;
    d.enemy.armor        = 0;
    d.roundsThisBattle   = 0;
    saveState();
    _renderAll();
  });

  const fieldMap = {
    'sim397-player-fp': ['player', 'fp'], 'sim397-player-endurance': ['player', 'endurance'],
    'sim397-player-endurancemax': ['player', 'enduranceInitial'], 'sim397-player-dmgdice': ['player', 'dmgDice'],
    'sim397-player-dmgbonus': ['player', 'dmgBonus'], 'sim397-player-armor': ['player', 'armor'],
    'sim397-enemy-fp': ['enemy', 'fp'], 'sim397-enemy-endurance': ['enemy', 'endurance'],
    'sim397-enemy-endurancemax': ['enemy', 'enduranceMax'], 'sim397-enemy-dmgdice': ['enemy', 'dmgDice'],
    'sim397-enemy-dmgbonus': ['enemy', 'dmgBonus'], 'sim397-enemy-armor': ['enemy', 'armor'],
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
