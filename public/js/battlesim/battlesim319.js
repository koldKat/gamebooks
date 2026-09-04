// ── Battle Simulator (The Demon's Claw, book 319, Blood Sword book 3
//    by Dave Morris & Oliver Johnson) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 319 only) by the caller in boot.js via
// setSim319Visible().
// To remove: delete this file, remove its import line and initSim319()/
// setSim319Visible() calls from boot.js, remove 'sim319' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim319-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim319-btn selectors in
// battlesim.css.
//
// Same book/mechanic as book 107 (battlesim107.js), which is the Bulgarian
// translation "Демонски нокът" - confirmed identical section numbering
// between editions (every combat encounter here landed on the same section
// number as its Bulgarian counterpart). Four attributes: Fighting Prowess
// (to-hit), Psychic Ability (narrative/spell-resist only, not modeled),
// Awareness (turn-order only, not modeled), Endurance (hp). Per-round
// choice of Attack (2d6 to-hit, then 1-2 damage dice + flat bonus minus
// target Armour Rating) or Defend (skips own attack, forces the enemy to
// roll 3d6 instead of 2d6 to hit).
//
// Starting rank: this book's own text is explicit for a solo player - 16th
// rank. Rank-16 stats read fresh from this book's own class tables:
//   Warrior:   FP 10, Damage 6d6,   Endurance 96, Armour 3 (chainmail)
//   Trickster: FP 9,  Damage 5d6+2, Endurance 96, Armour 2
//   Sage:      FP 9,  Damage 5d6+2, Endurance 80, Armour 2
//   Enchanter: FP 9,  Damage 4d6+2, Endurance 80, Armour 2
// Note: book 107's Bulgarian rank table for the Warrior was flagged as
// OCR-garbled and had to be cross-checked/reconstructed, landing on
// "FP 10, Dmg 5d6+1". This book's own English text is unambiguous and
// directly readable ("16th rank Fighting Prowess: 10 Damage: 6 Dice") -
// trusted over the reconstructed Bulgarian value as the more reliable
// source. The other three classes match book 107's numbers exactly.
// Selecting a class in this sim's UI just fills these starting numbers in as
// a convenience default - every field remains hand-editable afterward.
//
// Full enemy roster (24 rows, read from all stat-block-bearing sections of
// 588 total, cross-checked against book 107's own roster for the same story
// beats - every section number matched). Recurring encounters retold at
// several points are seeded once at their most representative value:
//   - Hunguk (the Pirate King, §17/§271/§289): FP 10, Dmg 6d6, End 100,
//     Armour 5. Strikes TWICE per round (once per axe) - not modeled as a
//     double-attack here, apply the extra hit by hand if simulating
//     faithfully. Immune to the enslavement spell and can't be fled from.
//   - Thulanders (merchants, §43, pair): FP 8, Dmg 2d6+1, End 30 each,
//     Armour 0.
//   - Seven-in-One (a multi-stage wooden idol boss that splits into a new
//     incarnation each time it's felled, §87/§204/§240/§243/§361/§382/§536
//     - 7 distinct forms with genuinely different stats each: End
//     30/45/35/40/15/25/20, FP 9/6/8/7/12/10/11, Dmg 4d6/5d6/4d6+1/4d6+2/
//     3d6/3d6+2/3d6+1, Armour 0 throughout): seeded at its first-encountered
//     full form (§87: FP 9, Dmg 4d6, End 30, Armour 0) - lower the
//     Endurance/FP/damage by hand for whichever later incarnation is being
//     fought. Immune to the enslavement spell (no true mind).
//   - Giantess (§117/§183/§196/§398/§399/§400/§434, several
//     retellings/class-specific variants): FP 6, Dmg 5d6+1, End 65, Armour
//     1 (most common values; a Trickster-specific eye-shot opening at §398
//     drops this to FP 4/Dmg 5d6-1/End 59 for that variant only).
//   - Icon the Ungodly (§130/§415, identical both tellings): FP 9, Dmg 5d6,
//     End 55, Armour 2. His fire-aura retaliation and immunity to the
//     enslavement spell aren't modeled.
//   - Assassins (§160/§167, group of 4): FP 7, Dmg 1d6+1, End 15 each,
//     Armour 1 as printed (the source notes the player isn't wearing their
//     own armour for this specific fight - a player-side detail, not an
//     enemy stat, left as-is here).
//   - Slaves (§177/§276, pair): FP 8, Dmg 1d6+2, End 15 each, Armour 0.
//   - Demon (summoned by Psyche, §229/§481/§560): FP 8, Dmg 5d6, End 60,
//     Armour 4.
//   - Acolytes (chanting cultist guards, §239/§322/§485, groups of 4-8):
//     FP 8, Dmg 1d6+1, End 10 each, Armour 1. While actively chanting they
//     can't strike back at all - not modeled, treat as a normal
//     bidirectional fight unless deliberately simulating that detail.
//   - Longshoremen (tavern sailors, §191/§195, group of 6): FP 6, Dmg 1d6,
//     End 10 each, Armour 0.
//   - Selentines (guards, §310, group of 3): FP 8, Dmg 2d6+2, End 36 each,
//     Armour 3.
//   - Prince Susurrien (§287): FP 8, Dmg 4d6, End 80, Armour 0. Each round
//     rolls a die to pick sword/death-mist spell/enslavement spell/sapphire
//     beam - only the sword option maps to this sim's plain attack.
//   - Azidahaka (1 of a 3-demon-god boss trio, §300/§330/§410/§457,
//     consistent across all 4 tellings): FP 11, Dmg 12d6, End 100, Armour
//     6. Note: book 107's Bulgarian text printed this damage as a bare
//     flat "12" with no dice-count word, flagged there as a genuine data
//     gap and seeded as a guess. This book's own English text is
//     unambiguous ("Damage per blow: 12 Dice") - resolves that gap; seeded
//     as-is here despite being an unusually high dice count for this
//     schema.
//   - Nasu (2nd of the trio, same 4 sections): FP 10, Dmg 8d6, End 140,
//     Armour 3. Touch causes decay (Psychic-Ability save or die) - not
//     modeled.
//   - The Yazir (3rd of the trio, same 4 sections): FP 9, Dmg 5d6+1, End
//     85, Armour 3. Casts a random spell each round instead of a normal
//     attack - not modeled, seeded stats represent his melee option only.
//   - Automaton (§285): FP 7, Dmg 8d6, End 60, Armour 4.
//   - Dog-Creature (§286, a spear-throwing creature, not modeled as
//     ranged): FP 9, Dmg 3d6, End 35, Armour 0.
//   - Smugglers (§266/§452, group of 4-8): FP 8, Dmg 1d6+1, End 12 each,
//     Armour 0.
//   - Guards (prison guards, §373, pair - distinct from the Acolytes'
//     temple guards above): FP 8, Dmg 2d6, End 24 each, Armour 0.
//   - Bully-Boys (§404, group of 6): FP 8, Dmg 1d6+1, End 12 each, Armour
//     1.
//   - Thugs (§405, group of 4): FP 8, Dmg 1d6+1, End 15 each, Armour 0.
//   - Aphanos the Unseen (§476): FP 9, Dmg 4d6, End 55, Armour 0. Being
//     invisible, the player needs 3d6 (not 2d6) to hit him - not modeled,
//     this sim's plain Attack always uses 2d6. Also drains 1 pt Endurance/
//     round unconditionally - unmodeled.
//   - Ghoul (§534): FP 8, Dmg 4d6, End 45, Armour 0.
//   - Half-Man (§571): FP 7, Dmg 2d6+2, End 25, Armour 0. Can't move/flee
//     and casts a death spell every round instead of a normal attack - the
//     printed damage line is his one-off opening magic-bolt hit, not his
//     per-round melee stat; seeded stats represent a simplified
//     ongoing-fight approximation.
//
// book_enemies column reuse (only 4 numeric columns exist; this book needs
// 5): attack = Fighting Prowess; hp = Endurance; pb = damage dice count;
// defense = damage flat bonus. Armour Rating has no column - NOT
// autocomplete-seeded, always resets to 0 on enemy pick, hand-entered per
// fight from the notes above.
//
// All state lives in pt.sim319, per-user/per-book via currentPlaythrough().

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
  if (!pt.sim319) {
    const w = CLASS_PRESETS.warrior;
    pt.sim319 = {
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
  const d = pt.sim319;
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
    _appendLog(d, t('battlesim319.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _applyPlayerFall(d) {
  if (d.player.endurance <= 0) {
    _appendLog(d, t('battlesim319.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _enemyStrike(d, threeDice) {
  const roll = threeDice ? _roll3d6() : _roll2d6();
  const hit = roll <= d.enemy.fp;
  if (!hit) {
    _appendLog(d, t('battlesim319.log.enemy_misses', { enemy: _enemyNameSafe(d), dice: threeDice ? 3 : 2, roll, fp: d.enemy.fp }));
    return;
  }
  const raw = _rollNd6(Math.max(1, d.enemy.dmgDice)) + (d.enemy.dmgBonus || 0);
  const dmg = Math.max(0, raw - (d.player.armor || 0));
  d.player.endurance = Math.max(0, d.player.endurance - dmg);
  _appendLog(d, t('battlesim319.log.enemy_hits', { enemy: _enemyNameSafe(d), dice: threeDice ? 3 : 2, roll, fp: d.enemy.fp, raw, armor: d.player.armor, n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
}

function _attack() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  d.roundsThisBattle++;

  const roll = _roll2d6();
  const hit = roll <= d.player.fp;
  _appendLog(d, t('battlesim319.log.attack', { roll, fp: d.player.fp, enemy: _enemyNameSafe(d) }));

  if (!hit) {
    _appendLog(d, t('battlesim319.log.miss'));
  } else {
    const raw = _rollNd6(Math.max(1, d.player.dmgDice)) + (d.player.dmgBonus || 0);
    const dmg = Math.max(0, raw - (d.enemy.armor || 0));
    d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
    _appendLog(d, t('battlesim319.log.you_hit', { enemy: _enemyNameSafe(d), raw, armor: d.enemy.armor, n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax }));
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
  _appendLog(d, t('battlesim319.log.defend'));
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
  if (d.log.length) _appendLog(d, t('battlesim319.log.reset_sep'));
  _appendLog(d, t('battlesim319.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim319.ui.endurance')}:${e.hp ?? '?'}</span></li>`
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

  _setVal('sim319-player-fp', p.fp);
  _setVal('sim319-player-endurance', p.endurance);
  _setVal('sim319-player-endurancemax', p.enduranceInitial);
  _setVal('sim319-player-dmgdice', p.dmgDice);
  _setVal('sim319-player-dmgbonus', p.dmgBonus);
  _setVal('sim319-player-armor', p.armor);

  if (!skipEnemyPick) _setVal('sim319-enemy-pick', e.name);
  _setVal('sim319-enemy-fp', e.fp);
  _setVal('sim319-enemy-endurance', e.endurance);
  _setVal('sim319-enemy-endurancemax', e.enduranceMax);
  _setVal('sim319-enemy-dmgdice', e.dmgDice);
  _setVal('sim319-enemy-dmgbonus', e.dmgBonus);
  _setVal('sim319-enemy-armor', e.armor);

  const over = _battleOver(d);
  document.getElementById('sim319-attack').disabled = over;
  document.getElementById('sim319-defend').disabled = over;

  const status = document.getElementById('sim319-status');
  if (p.endurance <= 0) status.innerHTML = t('battlesim319.status.fallen', { skull: SVG_SKULL });
  else if (e.enduranceMax > 0 && e.endurance <= 0) status.innerHTML = t('battlesim319.status.victory', { trophy: SVG_TROPHY });
  else status.innerHTML = '';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim319-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim319-history-summary');
  const listEl = document.getElementById('sim319-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim319.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim319.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim319.history.won') : t('battlesim319.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim319.ui.endurance')} ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim319() {
  const overlay = document.getElementById('sim319-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim319(); return; }
  _renderAll();
}

function openSim319() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim319-overlay').classList.add('active');
}

function closeSim319() {
  document.getElementById('sim319-overlay')?.classList.remove('active');
}

export function setSim319Visible(visible) {
  const btn = document.getElementById('sim319-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim319();
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

export function initSim319() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim319-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim319.ui.title')}</span>
        <button id="sim319-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim319.ui.you')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim319.ui.class')}</span>
              <select id="sim319-class-pick" class="inv-edit-input">
                <option value="">${t('battlesim319.ui.class_pick')}</option>
                <option value="warrior">${t('battlesim319.ui.class_warrior')}</option>
                <option value="trickster">${t('battlesim319.ui.class_trickster')}</option>
                <option value="mystic">${t('battlesim319.ui.class_mystic')}</option>
                <option value="sorcerer">${t('battlesim319.ui.class_sorcerer')}</option>
              </select>
            </div>
            ${_numField(t('battlesim319.ui.fp'), 'sim319-player-fp')}
            ${_numField(t('battlesim319.ui.endurance'), 'sim319-player-endurance')}
            ${_numField(t('battlesim319.ui.endurance_initial'), 'sim319-player-endurancemax')}
            ${_numField(t('battlesim319.ui.dmg_dice'), 'sim319-player-dmgdice')}
            ${_numField(t('battlesim319.ui.dmg_bonus'), 'sim319-player-dmgbonus')}
            ${_numField(t('battlesim319.ui.armor'), 'sim319-player-armor')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim319.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim319.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim319-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim319-enemy-pick-dropdown">
                <ul id="sim319-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim319.ui.fp'), 'sim319-enemy-fp')}
            ${_numField(t('battlesim319.ui.endurance'), 'sim319-enemy-endurance')}
            ${_numField(t('battlesim319.ui.endurance_max'), 'sim319-enemy-endurancemax')}
            ${_numField(t('battlesim319.ui.dmg_dice'), 'sim319-enemy-dmgdice')}
            ${_numField(t('battlesim319.ui.dmg_bonus'), 'sim319-enemy-dmgbonus')}
            ${_numField(t('battlesim319.ui.armor'), 'sim319-enemy-armor')}
          </div>
          <div id="sim319-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim319-attack" class="inv-add-btn bsim-action-primary">${t('battlesim319.btn.attack')}</button>
            <button id="sim319-defend" class="inv-add-btn">${t('battlesim319.btn.defend')}</button>
            <button id="sim319-reset" class="inv-add-btn">${t('battlesim319.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim319-history-summary">${t('battlesim319.history.summary', { n: 0 })}</summary>
            <div id="sim319-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim319-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim319-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim319);
  document.getElementById('sim319-close').addEventListener('click', closeSim319);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim319(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim319-overlay'),
    open:  openSim319,
    close: closeSim319,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim319();
  });

  document.getElementById('sim319-attack').addEventListener('click', _attack);
  document.getElementById('sim319-defend').addEventListener('click', _defend);
  document.getElementById('sim319-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim319-class-pick').addEventListener('change', e => {
    if (e.target.value) _applyClassPreset(e.target.value);
  });

  document.getElementById('sim319-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim319-enemy-pick', 'sim319-enemy-pick-dropdown', enemy => {
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
    'sim319-player-fp': ['player', 'fp'], 'sim319-player-endurance': ['player', 'endurance'],
    'sim319-player-endurancemax': ['player', 'enduranceInitial'], 'sim319-player-dmgdice': ['player', 'dmgDice'],
    'sim319-player-dmgbonus': ['player', 'dmgBonus'], 'sim319-player-armor': ['player', 'armor'],
    'sim319-enemy-fp': ['enemy', 'fp'], 'sim319-enemy-endurance': ['enemy', 'endurance'],
    'sim319-enemy-endurancemax': ['enemy', 'enduranceMax'], 'sim319-enemy-dmgdice': ['enemy', 'dmgDice'],
    'sim319-enemy-dmgbonus': ['enemy', 'dmgBonus'], 'sim319-enemy-armor': ['enemy', 'armor'],
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
