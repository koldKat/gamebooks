// ── Battle Simulator (Царство Уирд / Kingdom of the Weird, book 135, "Кървав
//    меч"/Blood Sword book 2 by Dave Morris & Oliver Johnson) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 135 only) by the caller in boot.js via
// setSim135Visible().
// To remove: delete this file, remove its import line and initSim135()/
// setSim135Visible() calls from boot.js, remove 'sim135' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim135-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim135-btn selectors in
// battlesim.css.
//
// Same series/mechanic as books 78 and 107 (battlesim78.js/battlesim107.js)
// - confirmed from this book's own book_frontmatter rules_text ("ПРАВИЛА НА
// ИГРАТА „КЪРВАВ МЕЧ“"), explicitly cross-referencing book 78 ("Бойните
// ровове на Крарт") as book one of the series and naming book 107
// ("Демонски нокът") as book three in its own closing page - this book is
// series book two. Four attributes: Бойно майсторство/Fighting Prowess
// (to-hit), Психически способности/Psychic Ability (narrative/spell-resist
// only, not modeled here), Нюх/Awareness (turn-order only, irrelevant to
// this app's solo 1v1 shape, not modeled), Издръжливост/Endurance (hp).
// Per-round choice of Attack or Defend: Attack rolls 2d6, hits on a result
// <= Fighting Prowess, then rolls 1-2 damage dice + a flat bonus and
// subtracts the target's Armour Class (floor 0); Defend skips the player's
// own attack but forces the enemy to roll 3d6 to hit instead of 2d6;
// whichever side doesn't act still attacks back normally after an Attack
// round.
//
// Starting rank: this book's own intro_text is explicit and internally
// consistent (unlike book 107's garbled duplicate table) - solo player is
// rank XII ("Самотният Приключенец... от дванадесети ранг"), duo rank VI,
// trio rank IV, quad rank III. Rank XII stats read from each class's own
// per-rank table in book_frontmatter.rules_text:
//   Воин (Warrior):     FP 9, Damage 4d6+2, Endurance 72, starts Armour 3
//     (this book's own Warrior section states "доспехи клас 3" outright)
//   Тарикат (Trickster):FP 8, Damage 4d6+1, Endurance 72, starts Armour 2
//   Мъдрец (Mystic):    FP 8, Damage 4d6+1, Endurance 60, starts Armour 2
//   Магьосник (Sorcerer):FP 8, Damage 3d6+2, Endurance 60, starts Armour 2
// (Psychic Ability/Awareness omitted since they're not modeled here.
// Starting Armour Class for the non-Warrior classes carried over from book
// 78/107's precedent - series-standard "studded leather = class 2" starting
// equipment; this book's own text doesn't restate it per-class the way it
// does for the Warrior.)
// Selecting a class in this sim's UI just fills these rank-XII starting
// numbers in as a convenience default - every field remains hand-editable
// afterward, same as every other sim in this app.
//
// Full enemy roster (31 rows, read from all 47 stat-block-bearing sections
// of 570 total). Recurring named encounters retold at several points in the
// story are seeded once at their most representative value, not duplicated
// per section:
//   - Зомби (§13/§360, identical both times): FP 6, Dmg 1d6, End 30, Armour
//     0 (source says "same armour as worn in life" - not a fixed value,
//     seeded at 0 as a neutral default).
//   - Снежен вампир (Snow Vampire, §37/§309): FP 7, Dmg 1d6+3, End 25,
//     Armour 0.
//   - Мразовити хрътки (Frost Hounds, §61 x7/§233 x6, identical stats both
//     tellings): FP 8, Dmg 2d6+1, End 25 each, Armour 0.
//   - Палач (the Executioner, §64): FP 9, Dmg 4d6+1, End 50, Armour 2.
//   - Демон/Варадаксор (Varadaxor's demon, §69): FP 8, Dmg 2d6, End 30,
//     Armour 2. Poisoned tail (1-in-6 chance per hit taken to lose an
//     extra 4d6 Endurance) not modeled.
//   - Гигантът Танатос (Thanatos the Giant, §71/§477, identical both
//     tellings): FP 8, Dmg 4d6, End 45, Armour 2. The Skull Amulet's
//     +7 Armour/+7 damage bonus for this fight only is not modeled.
//   - Демони слуги (Augustus's Demon Servants, §76, group of 4): FP 8, Dmg
//     1d6+1, End 8 each, Armour 1.
//   - Главатар (the barbarian Chieftain, §92/§243/§416, identical every
//     telling): FP 8, Dmg 2d6+1, End 30, Armour 1.
//   - Скорпиони (Scorpions, §95, group of 4): FP 6, Dmg 3d6, End 18 each,
//     Armour 4.
//   - Силфи (Sylphs, §97/§100/§215/§481, group of 2, identical stats every
//     telling - only the player's own to-hit dice count changes across
//     retellings due to blindness/invisibility, not modeled, this sim's
//     plain Attack always uses 2d6): FP 7, Dmg 1d6+3, End 14 each, Armour
//     0.
//   - Върколаци (Werewolves, §119, pair) + their Слуги (thralls, same
//     section, trio): Werewolves FP 10, Dmg 2d6 (bite), End 22 each,
//     Armour 0 (half damage vs non-magical weapons, not modeled); Слуги FP
//     6, Dmg 1d6, End 10 each, Armour 0.
//   - Сталкер (the Stalker, a recurring supernatural pursuer statted
//     independently at almost every encounter since the book's own text
//     says its Endurance regenerates by magic between fights - §122 End
//     50, §169/§198/§212/§521 End 40, §258 End 31, §276 End 30/FP7/Dmg2d6):
//     seeded at its most common full value (FP 8, Dmg 3d6, End 40, Armour
//     2) - lower the Endurance by hand for the §258 pit fight (31) or the
//     §276 weakened variant (30, FP 7, Dmg 2d6) if simulating those
//     specific encounters.
//   - Моряци (Whalers/Sailors, §148, group of 7): FP 8, Dmg 2d6, End 20
//     each, Armour 0.
//   - Гристун / Чудовище пазач (Gristun the Guardian Monster, §168): FP 8,
//     Dmg 3d6+1, End 60, Armour 3.
//   - Върколак (a lone unturned Werewolf, still human at time of the fight,
//     §172, distinct from the transformed pack at §119) + his Слуги
//     (thralls, same section, trio): Werewolf FP 7, Dmg 1d6+1, End 12,
//     Armour 1; Слуги FP 6, Dmg 1d6, End 10 each, Armour 0.
//   - Скелети пазачи (Skeleton Guards, §216/§374, group of 2-4, identical
//     per-skeleton stats both tellings): FP 9, Dmg 2d6, End 21 each, Armour
//     3.
//   - Джадак (Jadak the Scarred, §237/§242, identical both tellings): FP 8,
//     Dmg 2d6+2, End 30, Armour 1.
//   - Царят на бродниците (the Warlock King, final boss, §255, Endurance
//     already reduced by an earlier archery volley per the source text):
//     FP 6, Dmg 1d6, End 16, Armour 2.
//   - Летящ вълк (the Flying Wolf, §304): FP 7, Dmg 2d6, End 38, Armour 2.
//     Drains 2d6 Endurance/round from the player unconditionally (armour
//     doesn't help) - not modeled.
//   - Наемници (the Chieftain's Mercenaries, §243/§416, group of 6-7,
//     identical stats both tellings): FP 8, Dmg 1d6+2, End 18 each, Armour
//     1.
//   - Бронирани доспехи (animated Armoured Suits, §421, pair): FP 7, Dmg
//     3d6, End 21 each, Armour 5.
//   - Елфи (Elves, §425, group of 7): FP 8, Dmg 1d6+1, End 22 each, Armour
//     1. Their ranged bow attack (same 1d6+1 damage) when not adjacent is
//     not modeled separately.
//   - Скелети (Skeleton warriors blocking the Warlock King, §427, group of
//     4): FP 7, Dmg 1d6+1, End 8 each, Armour 0.
//   - Скелети (a necromancer's raised Skeletons, §450, group of 8, weaker
//     than the §427 group - kept as a separate roster row rather than
//     merged, since the stats genuinely differ): FP 6, Dmg 1d6+1, End 7
//     each, Armour 0.
//   - Хидра (a Hydra, already heavily wounded per the source text, §440):
//     FP 7, Dmg 2d6+2, End 8, Armour 3. Two of its heads are still alive,
//     letting it strike two different players in one round - not modeled
//     in this 1v1 sim shape.
//   - Айслакен (Aislaken, an eight-tentacled ice creature, §457, treated
//     as 8 separate targets per the source text): FP 7, Dmg 2d6, End 11
//     per tentacle, Armour 2.
//   - Лазаръс (Lazarus, §482): FP 8, Dmg 1d6+2, End 14, Armour 0.
//   - Огъстъс (Augustus the sorcerer, §522): FP 8, Dmg 2d6+2, End 40,
//     Armour 0. Rolls a d6 each round to pick dagger-strike (1-2, maps to
//     this sim's plain attack) vs. one of three spells (3-6) - the spell
//     options aren't modeled, this sim represents his melee option only.
//   - Елесгонт (the Elesgont, §413, first encounter): FP 7, Dmg 2d6+3, End
//     35, Armour 3.
//   - Елесгонт (втора среща) (the Elesgont, §540, a second fully-healed
//     encounter later in the story with a slightly different damage line):
//     FP 7, Dmg 2d6+1, End 35, Armour 3.
//
// NOT seeded: Дама в сиво (the Grey Lady, §421) - a spell-only target with
// Psychic Ability/Armour/Endurance printed but no Fighting Prowess anywhere
// in the text (she can't physically strike back and is only affected by
// spells) - doesn't fit this sim's melee-attack shape, so left out of the
// roster rather than seeded with a fabricated FP.
//
// book_enemies column reuse (same convention as books 78/107, only 4
// numeric columns exist for a 5-stat need): attack = Fighting Prowess; hp =
// Endurance; pb = damage dice count; defense = damage flat bonus. Armour
// Class has no column - NOT autocomplete-seeded, always resets to 0 on
// enemy pick, hand-entered per fight from the notes above.
//
// All state lives in pt.sim135, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Rank XII (solo Adventurer) starting stats per class, from the book's own
// character tables - autocomplete-style convenience defaults only.
const CLASS_PRESETS = {
  warrior:   { fp: 9, dmgDice: 4, dmgBonus: 2, endurance: 72, armor: 3 },
  trickster: { fp: 8, dmgDice: 4, dmgBonus: 1, endurance: 72, armor: 2 },
  mystic:    { fp: 8, dmgDice: 4, dmgBonus: 1, endurance: 60, armor: 2 },
  sorcerer:  { fp: 8, dmgDice: 3, dmgBonus: 2, endurance: 60, armor: 2 },
};

function _emptyEnemy() {
  return { name: '', fp: 0, endurance: 0, enduranceMax: 0, dmgDice: 1, dmgBonus: 0, armor: 0 };
}

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim135) {
    const w = CLASS_PRESETS.warrior;
    pt.sim135 = {
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
  const d = pt.sim135;
  const p = d.player;
  if (p.fp === undefined) p.fp = 9;
  if (p.endurance === undefined) p.endurance = 72;
  if (p.enduranceInitial === undefined) p.enduranceInitial = 72;
  if (p.dmgDice === undefined) p.dmgDice = 4;
  if (p.dmgBonus === undefined) p.dmgBonus = 2;
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
    _appendLog(d, t('battlesim135.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _applyPlayerFall(d) {
  if (d.player.endurance <= 0) {
    _appendLog(d, t('battlesim135.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _enemyStrike(d, threeDice) {
  const roll = threeDice ? _roll3d6() : _roll2d6();
  const hit = roll <= d.enemy.fp;
  if (!hit) {
    _appendLog(d, t('battlesim135.log.enemy_misses', { enemy: _enemyNameSafe(d), dice: threeDice ? 3 : 2, roll, fp: d.enemy.fp }));
    return;
  }
  const raw = _rollNd6(Math.max(1, d.enemy.dmgDice)) + (d.enemy.dmgBonus || 0);
  const dmg = Math.max(0, raw - (d.player.armor || 0));
  d.player.endurance = Math.max(0, d.player.endurance - dmg);
  _appendLog(d, t('battlesim135.log.enemy_hits', { enemy: _enemyNameSafe(d), dice: threeDice ? 3 : 2, roll, fp: d.enemy.fp, raw, armor: d.player.armor, n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
}

function _attack() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  d.roundsThisBattle++;

  const roll = _roll2d6();
  const hit = roll <= d.player.fp;
  _appendLog(d, t('battlesim135.log.attack', { roll, fp: d.player.fp, enemy: _enemyNameSafe(d) }));

  if (!hit) {
    _appendLog(d, t('battlesim135.log.miss'));
  } else {
    const raw = _rollNd6(Math.max(1, d.player.dmgDice)) + (d.player.dmgBonus || 0);
    const dmg = Math.max(0, raw - (d.enemy.armor || 0));
    d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
    _appendLog(d, t('battlesim135.log.you_hit', { enemy: _enemyNameSafe(d), raw, armor: d.enemy.armor, n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax }));
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
  _appendLog(d, t('battlesim135.log.defend'));
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
  if (d.log.length) _appendLog(d, t('battlesim135.log.reset_sep'));
  _appendLog(d, t('battlesim135.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim135.ui.endurance')}:${e.hp ?? '?'}</span></li>`
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

  _setVal('sim135-player-fp', p.fp);
  _setVal('sim135-player-endurance', p.endurance);
  _setVal('sim135-player-endurancemax', p.enduranceInitial);
  _setVal('sim135-player-dmgdice', p.dmgDice);
  _setVal('sim135-player-dmgbonus', p.dmgBonus);
  _setVal('sim135-player-armor', p.armor);

  if (!skipEnemyPick) _setVal('sim135-enemy-pick', e.name);
  _setVal('sim135-enemy-fp', e.fp);
  _setVal('sim135-enemy-endurance', e.endurance);
  _setVal('sim135-enemy-endurancemax', e.enduranceMax);
  _setVal('sim135-enemy-dmgdice', e.dmgDice);
  _setVal('sim135-enemy-dmgbonus', e.dmgBonus);
  _setVal('sim135-enemy-armor', e.armor);

  const over = _battleOver(d);
  document.getElementById('sim135-attack').disabled = over;
  document.getElementById('sim135-defend').disabled = over;

  const status = document.getElementById('sim135-status');
  if (p.endurance <= 0) status.innerHTML = t('battlesim135.status.fallen', { skull: SVG_SKULL });
  else if (e.enduranceMax > 0 && e.endurance <= 0) status.innerHTML = t('battlesim135.status.victory', { trophy: SVG_TROPHY });
  else status.innerHTML = '';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim135-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim135-history-summary');
  const listEl = document.getElementById('sim135-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim135.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim135.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim135.history.won') : t('battlesim135.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim135.ui.endurance')} ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim135() {
  const overlay = document.getElementById('sim135-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim135(); return; }
  _renderAll();
}

function openSim135() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim135-overlay').classList.add('active');
}

function closeSim135() {
  document.getElementById('sim135-overlay')?.classList.remove('active');
}

export function setSim135Visible(visible) {
  const btn = document.getElementById('sim135-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim135();
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

export function initSim135() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim135-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim135.ui.title')}</span>
        <button id="sim135-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim135.ui.you')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim135.ui.class')}</span>
              <select id="sim135-class-pick" class="inv-edit-input">
                <option value="">${t('battlesim135.ui.class_pick')}</option>
                <option value="warrior">${t('battlesim135.ui.class_warrior')}</option>
                <option value="trickster">${t('battlesim135.ui.class_trickster')}</option>
                <option value="mystic">${t('battlesim135.ui.class_mystic')}</option>
                <option value="sorcerer">${t('battlesim135.ui.class_sorcerer')}</option>
              </select>
            </div>
            ${_numField(t('battlesim135.ui.fp'), 'sim135-player-fp')}
            ${_numField(t('battlesim135.ui.endurance'), 'sim135-player-endurance')}
            ${_numField(t('battlesim135.ui.endurance_initial'), 'sim135-player-endurancemax')}
            ${_numField(t('battlesim135.ui.dmg_dice'), 'sim135-player-dmgdice')}
            ${_numField(t('battlesim135.ui.dmg_bonus'), 'sim135-player-dmgbonus')}
            ${_numField(t('battlesim135.ui.armor'), 'sim135-player-armor')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim135.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim135.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim135-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim135-enemy-pick-dropdown">
                <ul id="sim135-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim135.ui.fp'), 'sim135-enemy-fp')}
            ${_numField(t('battlesim135.ui.endurance'), 'sim135-enemy-endurance')}
            ${_numField(t('battlesim135.ui.endurance_max'), 'sim135-enemy-endurancemax')}
            ${_numField(t('battlesim135.ui.dmg_dice'), 'sim135-enemy-dmgdice')}
            ${_numField(t('battlesim135.ui.dmg_bonus'), 'sim135-enemy-dmgbonus')}
            ${_numField(t('battlesim135.ui.armor'), 'sim135-enemy-armor')}
          </div>
          <div id="sim135-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim135-attack" class="inv-add-btn bsim-action-primary">${t('battlesim135.btn.attack')}</button>
            <button id="sim135-defend" class="inv-add-btn">${t('battlesim135.btn.defend')}</button>
            <button id="sim135-reset" class="inv-add-btn">${t('battlesim135.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim135-history-summary">${t('battlesim135.history.summary', { n: 0 })}</summary>
            <div id="sim135-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim135-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim135-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim135);
  document.getElementById('sim135-close').addEventListener('click', closeSim135);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim135(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim135-overlay'),
    open:  openSim135,
    close: closeSim135,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim135();
  });

  document.getElementById('sim135-attack').addEventListener('click', _attack);
  document.getElementById('sim135-defend').addEventListener('click', _defend);
  document.getElementById('sim135-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim135-class-pick').addEventListener('change', e => {
    if (e.target.value) _applyClassPreset(e.target.value);
  });

  document.getElementById('sim135-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim135-enemy-pick', 'sim135-enemy-pick-dropdown', enemy => {
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
    'sim135-player-fp': ['player', 'fp'], 'sim135-player-endurance': ['player', 'endurance'],
    'sim135-player-endurancemax': ['player', 'enduranceInitial'], 'sim135-player-dmgdice': ['player', 'dmgDice'],
    'sim135-player-dmgbonus': ['player', 'dmgBonus'], 'sim135-player-armor': ['player', 'armor'],
    'sim135-enemy-fp': ['enemy', 'fp'], 'sim135-enemy-endurance': ['enemy', 'endurance'],
    'sim135-enemy-endurancemax': ['enemy', 'enduranceMax'], 'sim135-enemy-dmgdice': ['enemy', 'dmgDice'],
    'sim135-enemy-dmgbonus': ['enemy', 'dmgBonus'], 'sim135-enemy-armor': ['enemy', 'armor'],
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
