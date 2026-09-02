// ── Battle Simulator (Демонски нокът / The Demon's Claw, book 107, "Кървав
//    меч"/Blood Sword book 4 by Dave Morris & Oliver Johnson) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 107 only) by the caller in boot.js via
// setSim107Visible().
// To remove: delete this file, remove its import line and initSim107()/
// setSim107Visible() calls from boot.js, remove 'sim107' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim107-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim107-btn selectors in
// battlesim.css.
//
// Same series/mechanic as book 78 (battlesim78.js) - confirmed from this
// book's own book_frontmatter rules_text (imported book_sections prose
// starts directly at the story with no rules recap, same as every other
// book in this series). Four attributes: Бойно майсторство/Fighting
// Prowess (to-hit), Психически способности/Psychic Ability (narrative/
// spell-resist only, not modeled here), Нюх/Awareness (turn-order only,
// irrelevant to this app's solo 1v1 shape, not modeled), Издръжливост/
// Endurance (hp). Per-round choice of Attack or Defend: Attack rolls 2d6,
// hits on a result <= Fighting Prowess, then rolls 1-2 damage dice + a flat
// bonus and subtracts the target's Armour Class (floor 0); Defend skips the
// player's own attack but forces the enemy to roll 3d6 to hit instead of
// 2d6; whichever side doesn't act still attacks back normally after an
// Attack round.
//
// Starting rank: this book's own intro_text is explicit for a solo player -
// "Самотният Приключенец, предприел мисията, ще бъде от шестнадесети ранг"
// (rank XVI) - trusted over a second, garbled summary table a few lines
// later in the same extracted text ("един герой от 20 ранг") that
// contradicts the clean prose sentence on every other player-count too
// (duo/trio/quad also mismatch between the two sources) - the equipment
// paragraph right after ("...четиридесет жълтици, ако си шестнадесети
// ранг") independently references rank 16 again, further confirming the
// prose over the corrupted table. Rank XVI stats read from each class's own
// per-rank table in book_frontmatter.rules_text (some rows OCR-garbled -
// cross-checked against the visible +6-Endurance-per-rank pattern that
// holds cleanly across every class to resolve ambiguous row labels):
//   Воин (Warrior):     FP 10, Damage 5d6+1, Endurance 96, starts Armour 3
//   Тарикат (Trickster):FP 9,  Damage 5d6+2, Endurance 96, starts Armour 2
//   Мъдрец (Mystic):    FP 9,  Damage 5d6+2, Endurance 80, starts Armour 2
//   Магьосник(Sorcerer): FP 9, Damage 4d6+2, Endurance 80, starts Armour 2
// (Psychic Ability/Awareness omitted since they're not modeled here.
// Starting Armour Class carried over from book 78's precedent - same
// series-standard "studded leather = class 2 / warrior's kit = class 3"
// starting equipment, confirmed present in this book's own Trickster
// section text too, not re-derived per class here.)
// Selecting a class in this sim's UI just fills these rank-XVI starting
// numbers in as a convenience default - every field remains hand-editable
// afterward, same as every other sim in this app.
//
// Full enemy roster (26 rows, read from all 24 stat-block-bearing sections
// of 588 total). Recurring named encounters retold at several points in the
// story (sometimes with different stats each retelling, since Endurance
// carries over from earlier damage in the same fight or the story branches
// non-linearly) are seeded once at their most representative value, not
// duplicated per section:
//   - Хангак (Hangak, the Pirate King, §17/§271/§289): FP 10, Dmg 6d6, End
//     100, Armour 5 (2 of 3 tellings; §271 alone shows Armour 9). Strikes
//     TWICE per round (once per axe) - not modeled as a double-attack here,
//     apply the extra hit by hand if simulating faithfully. Immune to the
//     enslavement spell and can't be fled from.
//   - Търговци от Туланд (Tuland merchants, §43, fought as a pair): FP 8,
//     Dmg 2d6+1, End 30 each, Armour 0.
//   - Седем-в-един (Seven-in-One, a multi-stage wooden idol boss that
//     splits into a new incarnation each time it's felled, §87/§204/§240/
//     §243/§361/§382/§536 - 7 distinct forms with genuinely different
//     stats each: End 30/45/35/40/15/25/20, FP 9/6/8/7/12/10/11, Dmg
//     4d6/5d6/4d6+1/4d6+2/3d6/3d6+2/3d6+1, Armour 0/1/0/0/0/0/0):
//     seeded at its first-encountered full form (§87: FP 9, Dmg 4d6, End
//     30, Armour 0) - lower the Endurance/FP/damage by hand for whichever
//     later incarnation you're actually fighting, same approach as book
//     78's multi-retelling Гигантът Скраймир. Immune to the enslavement
//     spell (no true mind).
//   - Великанка (Giantess, §117/§183/§196/§398/§399/§400/§434, several
//     retellings/class-specific variants): FP 8, Dmg 5d6+1, End 65, Armour
//     1 (most common values; a Trickster-specific eye-shot opening at §398
//     drops this to FP4/Dmg5d6-1/End59 for that one variant only).
//   - Айкън Неверникът (Aikon the Unbeliever, §130/§415, identical both
//     times): FP 9, Dmg 5d6, End 55, Armour 2. His fire-aura retaliation (1
//     pt unblockable burn to anyone who melee-hits him) and immunity to
//     the enslavement spell aren't modeled.
//   - Убийци (night-intruder Assassins, §160/§167, group of 4, two
//     tellings with FP 7 vs FP 5): FP 7, Dmg 1d6+1, End 15 each, Armour 0
//     (no armour worn per the source text - fought unarmoured the whole
//     bout).
//   - Роби (Psyche's Slaves, §177/§276, pair): FP 8, Dmg 1d6+2, End 15
//     each, Armour 0.
//   - Психе (Psyche, the sorceress antagonist, §177/§276): mostly a
//     spellcaster with "negligible" fighting prowess per the source text
//     (not seeded as a meaningful FP for §177's passive state) - when she
//     does fight directly (§276, having conjured a blade) she's FP 8, Dmg
//     3d6+3, End 45, Armour 0. Seeded at the fighting-form stats since
//     that's the only version with a real to-hit number.
//   - Демон (2-headed demon summoned by Psyche, §229/§481/§560): FP 8, Dmg
//     5d6, End 60, Armour 4 (§560 alone shows FP 5 for the same demon).
//   - Богомолци (chanting cultist guards, §239/§322/§485, groups of 4-8):
//     FP 8, Dmg 1d6+1, End 10 each, Armour 1. Note: while actively chanting
//     (§322) they can't strike back at all - not modeled, treat as a normal
//     bidirectional fight unless deliberately simulating that detail by
//     hand.
//   - Стражи (temple/palace guards, §239/§322/§485, groups of 4-5): FP 8,
//     Dmg 1d6+1, End 10 each, Armour 1.
//   - Моряци (tavern Sailors, §191/§195, group of 6, two tellings with/
//     without a to-hit stat given): FP 6, Dmg 1d6, End 10 each, Armour 0.
//   - Селентянски стражи (Selentian Guards, §310, group of 3): FP 8, Dmg
//     2d6+2, End 36 each, Armour 3.
//   - Сузуриен (Suzurien, §287): FP 8, Dmg 4d6, End 80, Armour 0. Each
//     round he rolls a die to pick his action (1=sword, 2-3=death-mist
//     spell, 4=enslavement spell, 5-6=sapphire beam dealing 3d6 unblockable
//     damage that bypasses armour) - only the sword option maps to this
//     sim's plain attack-roll shape; the spell options aren't modeled.
//   - Азидахака (one of a 3-demon-god boss trio, §300/§330/§410/§457,
//     consistent across all 4 tellings): FP 11, End 100, Armour 6. Damage
//     is printed as a flat "12" with no dice-count word in any of the 4
//     tellings (every other entry in this book says "N зара"/"N зара+M") -
//     genuinely ambiguous whether this is a typo/OCR-dropped die count or
//     an intentional flat value; seeded as 1 die + 11 flat (averages close
//     to the printed 12 with this schema's dice-based damage model, which
//     always rolls at least 1 die) rather than guessed as a specific dice
//     count - flagged here as a real data gap, not a confident reading.
//   - Назу (2nd of the trio, same 4 sections): FP 10, Dmg 8d6, End 140,
//     Armour 3. Touch causes decay (a Psychic-Ability save or die effect)
//     not modeled.
//   - Язир (3rd of the trio, same 4 sections): FP 9, Dmg 5d6+1, End 85,
//     Armour 3. Casts a random spell each round off a 1-6 table instead of
//     a normal attack roll - not modeled, seeded stats represent his melee
//     option only.
//   - Робот (animated Robot guardian, §285): FP 7, Dmg 8d6, End 60, Armour
//     4.
//   - Куче (spear-throwing creature, §286, name is literally "Dog" in the
//     source but described as a spear-thrower, not modeled as ranged): FP
//     9, Dmg 3d6, End 35, Armour 0.
//   - Контрабандисти (Lagrestin's Smugglers, §266/§452, group of 4-8): FP
//     8, Dmg 1d6+1, End 12 each, Armour 0.
//   - Стражи (Prince Baldrik's prison guards, §373, pair): FP 8, Dmg 2d6,
//     End 24 each, Armour 0.
//   - Убийци (Lagrestin's hired killers, §404, group of 6): FP 8, Dmg
//     1d6+1, End 12 each, Armour 1.
//   - Престъпници (street Criminals, §405, group of 4): FP 8, Dmg 1d6+1,
//     End 15 each, Armour 0.
//   - Афанос Невидимия (Afanos the Invisible, §476): FP 9, Dmg 4d6, End 55,
//     Armour 0. Being invisible, the player needs 3d6 (not 2d6) to hit him
//     - not modeled, this sim's plain Attack always uses 2d6 regardless of
//     which enemy is loaded. He also drains 1 pt Endurance/round
//     unconditionally, unmodeled.
//   - Демон човекоядец (man-eating Demon, §534): FP 8, Dmg 4d6, End 45,
//     Armour 0.
//   - Получовек (stationary Half-man spellcaster, §571): FP 7, Dmg 2d6+2,
//     End 25, Armour 0. Can't move/flee and casts a death spell every round
//     instead of a normal attack - the printed damage line is his one-off
//     opening magic-bolt hit (7 dice + 7, unblockable), not his per-round
//     melee stat; seeded stats represent a simplified ongoing-fight
//     approximation, not the source's exact round-1 special.
//
// book_enemies column reuse (same convention as book 78, only 4 numeric
// columns exist for a 5-stat need): attack = Fighting Prowess; hp =
// Endurance; pb = damage dice count; defense = damage flat bonus. Armour
// Class has no column - NOT autocomplete-seeded, always resets to 0 on
// enemy pick, hand-entered per fight from the notes above.
//
// All state lives in pt.sim107, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Rank XVI (solo Adventurer) starting stats per class, from the book's own
// character tables - autocomplete-style convenience defaults only.
const CLASS_PRESETS = {
  warrior:   { fp: 10, dmgDice: 5, dmgBonus: 1, endurance: 96, armor: 3 },
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
  if (!pt.sim107) {
    const w = CLASS_PRESETS.warrior;
    pt.sim107 = {
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
  const d = pt.sim107;
  const p = d.player;
  if (p.fp === undefined) p.fp = 10;
  if (p.endurance === undefined) p.endurance = 96;
  if (p.enduranceInitial === undefined) p.enduranceInitial = 96;
  if (p.dmgDice === undefined) p.dmgDice = 5;
  if (p.dmgBonus === undefined) p.dmgBonus = 1;
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
    _appendLog(d, t('battlesim107.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _applyPlayerFall(d) {
  if (d.player.endurance <= 0) {
    _appendLog(d, t('battlesim107.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _enemyStrike(d, threeDice) {
  const roll = threeDice ? _roll3d6() : _roll2d6();
  const hit = roll <= d.enemy.fp;
  if (!hit) {
    _appendLog(d, t('battlesim107.log.enemy_misses', { enemy: _enemyNameSafe(d), dice: threeDice ? 3 : 2, roll, fp: d.enemy.fp }));
    return;
  }
  const raw = _rollNd6(Math.max(1, d.enemy.dmgDice)) + (d.enemy.dmgBonus || 0);
  const dmg = Math.max(0, raw - (d.player.armor || 0));
  d.player.endurance = Math.max(0, d.player.endurance - dmg);
  _appendLog(d, t('battlesim107.log.enemy_hits', { enemy: _enemyNameSafe(d), dice: threeDice ? 3 : 2, roll, fp: d.enemy.fp, raw, armor: d.player.armor, n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
}

function _attack() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  d.roundsThisBattle++;

  const roll = _roll2d6();
  const hit = roll <= d.player.fp;
  _appendLog(d, t('battlesim107.log.attack', { roll, fp: d.player.fp, enemy: _enemyNameSafe(d) }));

  if (!hit) {
    _appendLog(d, t('battlesim107.log.miss'));
  } else {
    const raw = _rollNd6(Math.max(1, d.player.dmgDice)) + (d.player.dmgBonus || 0);
    const dmg = Math.max(0, raw - (d.enemy.armor || 0));
    d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
    _appendLog(d, t('battlesim107.log.you_hit', { enemy: _enemyNameSafe(d), raw, armor: d.enemy.armor, n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax }));
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
  _appendLog(d, t('battlesim107.log.defend'));
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
  if (d.log.length) _appendLog(d, t('battlesim107.log.reset_sep'));
  _appendLog(d, t('battlesim107.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim107.ui.endurance')}:${e.hp ?? '?'}</span></li>`
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

  _setVal('sim107-player-fp', p.fp);
  _setVal('sim107-player-endurance', p.endurance);
  _setVal('sim107-player-endurancemax', p.enduranceInitial);
  _setVal('sim107-player-dmgdice', p.dmgDice);
  _setVal('sim107-player-dmgbonus', p.dmgBonus);
  _setVal('sim107-player-armor', p.armor);

  if (!skipEnemyPick) _setVal('sim107-enemy-pick', e.name);
  _setVal('sim107-enemy-fp', e.fp);
  _setVal('sim107-enemy-endurance', e.endurance);
  _setVal('sim107-enemy-endurancemax', e.enduranceMax);
  _setVal('sim107-enemy-dmgdice', e.dmgDice);
  _setVal('sim107-enemy-dmgbonus', e.dmgBonus);
  _setVal('sim107-enemy-armor', e.armor);

  const over = _battleOver(d);
  document.getElementById('sim107-attack').disabled = over;
  document.getElementById('sim107-defend').disabled = over;

  const status = document.getElementById('sim107-status');
  if (p.endurance <= 0) status.innerHTML = t('battlesim107.status.fallen', { skull: SVG_SKULL });
  else if (e.enduranceMax > 0 && e.endurance <= 0) status.innerHTML = t('battlesim107.status.victory', { trophy: SVG_TROPHY });
  else status.innerHTML = '';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim107-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim107-history-summary');
  const listEl = document.getElementById('sim107-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim107.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim107.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim107.history.won') : t('battlesim107.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim107.ui.endurance')} ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim107() {
  const overlay = document.getElementById('sim107-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim107(); return; }
  _renderAll();
}

function openSim107() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim107-overlay').classList.add('active');
}

function closeSim107() {
  document.getElementById('sim107-overlay')?.classList.remove('active');
}

export function setSim107Visible(visible) {
  const btn = document.getElementById('sim107-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim107();
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

export function initSim107() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim107-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim107.ui.title')}</span>
        <button id="sim107-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim107.ui.you')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim107.ui.class')}</span>
              <select id="sim107-class-pick" class="inv-edit-input">
                <option value="">${t('battlesim107.ui.class_pick')}</option>
                <option value="warrior">${t('battlesim107.ui.class_warrior')}</option>
                <option value="trickster">${t('battlesim107.ui.class_trickster')}</option>
                <option value="mystic">${t('battlesim107.ui.class_mystic')}</option>
                <option value="sorcerer">${t('battlesim107.ui.class_sorcerer')}</option>
              </select>
            </div>
            ${_numField(t('battlesim107.ui.fp'), 'sim107-player-fp')}
            ${_numField(t('battlesim107.ui.endurance'), 'sim107-player-endurance')}
            ${_numField(t('battlesim107.ui.endurance_initial'), 'sim107-player-endurancemax')}
            ${_numField(t('battlesim107.ui.dmg_dice'), 'sim107-player-dmgdice')}
            ${_numField(t('battlesim107.ui.dmg_bonus'), 'sim107-player-dmgbonus')}
            ${_numField(t('battlesim107.ui.armor'), 'sim107-player-armor')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim107.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim107.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim107-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim107-enemy-pick-dropdown">
                <ul id="sim107-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim107.ui.fp'), 'sim107-enemy-fp')}
            ${_numField(t('battlesim107.ui.endurance'), 'sim107-enemy-endurance')}
            ${_numField(t('battlesim107.ui.endurance_max'), 'sim107-enemy-endurancemax')}
            ${_numField(t('battlesim107.ui.dmg_dice'), 'sim107-enemy-dmgdice')}
            ${_numField(t('battlesim107.ui.dmg_bonus'), 'sim107-enemy-dmgbonus')}
            ${_numField(t('battlesim107.ui.armor'), 'sim107-enemy-armor')}
          </div>
          <div id="sim107-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim107-attack" class="inv-add-btn bsim-action-primary">${t('battlesim107.btn.attack')}</button>
            <button id="sim107-defend" class="inv-add-btn">${t('battlesim107.btn.defend')}</button>
            <button id="sim107-reset" class="inv-add-btn">${t('battlesim107.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim107-history-summary">${t('battlesim107.history.summary', { n: 0 })}</summary>
            <div id="sim107-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim107-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim107-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim107);
  document.getElementById('sim107-close').addEventListener('click', closeSim107);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim107(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim107-overlay'),
    open:  openSim107,
    close: closeSim107,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim107();
  });

  document.getElementById('sim107-attack').addEventListener('click', _attack);
  document.getElementById('sim107-defend').addEventListener('click', _defend);
  document.getElementById('sim107-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim107-class-pick').addEventListener('change', e => {
    if (e.target.value) _applyClassPreset(e.target.value);
  });

  document.getElementById('sim107-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim107-enemy-pick', 'sim107-enemy-pick-dropdown', enemy => {
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
    'sim107-player-fp': ['player', 'fp'], 'sim107-player-endurance': ['player', 'endurance'],
    'sim107-player-endurancemax': ['player', 'enduranceInitial'], 'sim107-player-dmgdice': ['player', 'dmgDice'],
    'sim107-player-dmgbonus': ['player', 'dmgBonus'], 'sim107-player-armor': ['player', 'armor'],
    'sim107-enemy-fp': ['enemy', 'fp'], 'sim107-enemy-endurance': ['enemy', 'endurance'],
    'sim107-enemy-endurancemax': ['enemy', 'enduranceMax'], 'sim107-enemy-dmgdice': ['enemy', 'dmgDice'],
    'sim107-enemy-dmgbonus': ['enemy', 'dmgBonus'], 'sim107-enemy-armor': ['enemy', 'armor'],
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
