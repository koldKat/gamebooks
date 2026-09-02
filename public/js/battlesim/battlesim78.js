// ── Battle Simulator (Бойните ровове на Крарт / The Battlepits of Krarth,
//    book 78, "Кървав меч"/Blood Sword book 1 by Dave Morris & Oliver Johnson) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 78 only) by the caller in boot.js via
// setSim78Visible().
// To remove: delete this file, remove its import line and initSim78()/
// setSim78Visible() calls from boot.js, remove 'sim78' from SIM_HISTORY_KEYS
// in server/db/xp.js, remove 'sim78-overlay' from ALL_PANEL_OVERLAY_IDS in
// util.js and the #sim78-btn selectors in battlesim.css.
//
// Genuinely different mechanic from every prior sim in this app - read from
// this book's own frontmatter rules text (book_frontmatter, plus the source
// PDF's "ПРАВИЛА НА ИГРАТА" section, since the imported book_sections prose
// starts directly at the story with no rules recap). Four attributes:
// Бойно майсторство/Fighting Prowess (to-hit), Психически способности/
// Psychic Ability (narrative/spell-resist only, not modeled - no spellcasting
// UI here), Нюх/Awareness (turn-order only in the book's team-combat rules;
// irrelevant for this app's solo 1-attacker-vs-1-defender shape, not
// modeled), Издръжливост/Endurance (hp). Per-round choice of Attack or
// Defend (not a per-hit reactive block like the Fighting-Fantasy-style
// sims): Attack rolls 2d6, hits on a result <= Fighting Prowess, then rolls
// 1-2 damage dice + a flat bonus (both fixed per rank/weapon, not re-rolled
// choices) and subtracts the target's Armour Class (floor 0); Defend skips
// the player's own attack for the round but forces the enemy to roll 3d6
// (not 2d6) to hit instead, a much harder threshold since three dice skew
// higher than two against the same Fighting Prowess number. Whichever side
// doesn't act still attacks back normally after an Attack round.
//
// Solo pre-generated character, per this book's own rules ("Самотният
// Приключенец, предприел мисията, ще бъде от осми ранг" - a lone
// Adventurer is rank VIII): the book prints a fixed per-rank stat table for
// each of 4 character types (Воин/Warrior, Тарикат/Trickster, Мъдрец/
// Mystic, Магьосник/Sorcerer), not a randomly-rolled character. Rank VIII
// starting stats, read directly from the book's own tables (source PDF,
// "ВОИН"/"ТАРИКАТ"/"МЪДРЕЦ"/"МАГЬОСНИК" sections):
//   Воин:     FP 9, Damage 3d6+1, Endurance 48, starts Armour Class 3
//   Тарикат:  FP 8, Damage 3d6,   Endurance 48, starts Armour Class 2
//   Мъдрец:   FP 8, Damage 3d6,   Endurance 40, starts Armour Class 2
//   Магьосник:FP 7, Damage 2d6+2, Endurance 40, starts Armour Class 2
// (Psychic Ability/Awareness omitted above since they're not modeled here.)
// Selecting a class in this sim's UI just fills these rank-VIII starting
// numbers in as a convenience default - every field remains hand-editable
// afterward, same as every other sim in this app, since equipment loss,
// injuries, and rank-up between books all change these over the course of
// play and aren't tracked automatically.
//
// Full enemy roster (26 rows, read from all 51 stat-block-bearing sections
// of 540 total). Recurring generic encounters (the same named group fought
// at several different points in the dungeon crawl, sometimes with a
// slightly different starting Endurance per instance since earlier damage
// carries over) are seeded once at their most common/representative value,
// not duplicated per section:
//   - Варвари (Barbarians, §6/§54/§73/§156/§211/§314/§491): FP 8, Dmg 1d6+2,
//     Armour 1, End 12 (representative - some retellings start as low as 8
//     if already wounded from an earlier round of the same fight).
//   - Убийци (Assassins, §14/§54/§366/§399/§424/§530): FP 7, Dmg 1d6, End 6
//     (representative, ranges 5-6). Their shuriken-throwing ranged attack
//     between rounds isn't modeled (adds no extra field this schema has
//     room for) - apply extra damage by hand if simulating that detail.
//   - Скиапири, early form (Fire Spirits, §12/§411): FP 5, Dmg 1d6, End 10.
//     Their damage ignores armour entirely per the book's own footnote -
//     set the enemy's Armour field to 0 when fighting these regardless of
//     what the player's own sheet says.
//   - Скиапири, втора среща (Fire Spirits, stronger form, §376/§429): FP 7,
//     Dmg 6d6+2, End 12 - same armour-ignoring note as above. Two distinct
//     power tiers of the same monster name, kept as two rows rather than
//     merged (same judgment as book 377's two Пещерен трол encounters).
//   - Лешояди-човеци/Лешояди (Vulture-men, §112/§407): FP 6, Dmg 1d6+2, End 5.
//   - Гигантски паяк (Giant Spider, §316/§489): FP 5, Dmg 1d6+1, End 6.
//   - Трупове (Corpses, §34): FP 5, Dmg 1d6+1, End 4. Source fight is
//     grid-positional (must reach a door past several corpses) - simplified
//     to one representative Endurance value, positioning not modeled.
//   - Стрелци с лъкове (Archers, §82): FP 7, Dmg 1d6, End 6. Ranged/target-
//     priority behaviour not modeled - treat as a normal melee stat block.
//   - Магът Вил (Mage Vil, vampire, §14/§261/§444, same stats all 3 times):
//     FP 7, Dmg 3d6, Armour 2, End 35. His paralysing touch isn't modeled -
//     the book's own rule requires a Psychic Ability check this sim doesn't
//     track.
//   - Айкън Безбожника (§27/§341, identical both times): FP 8, Dmg 2d6+2,
//     Armour 2, End 28. His retaliation-fire aura (1 pt unblockable damage
//     to whoever melee-hits him) and immunity to one specific spell aren't
//     modeled.
//   - Ехидна (§129): FP 8, Dmg 2d6+2, Armour 2, End 40. Poison-bite side
//     effect not modeled.
//   - Гигантът Скраймир (§133/§342/§539, three retellings with genuinely
//     different stats each time - 70/28dmg-4d, 55/4d, 55/5d+6 - the book's
//     own story has him revived twice at reduced power): seeded at the
//     first, strongest full encounter (FP 9, Dmg 4d6, Armour 3, End 70);
//     lower the Endurance/damage by hand for the two later, weaker
//     rematches per whichever section you're actually on.
//   - Авантюристи/Приключенци (rival Adventurer duo, §198/§284, same fight
//     retold): FP 8, Dmg 2d6, Armour 3, End 22 (per-Adventurer - the book
//     fields two of them at once; this sim fights one at a time, re-pick
//     between the two).
//   - Рейнджър (Ranger, §303/§367/§418, same base stats all 3 times, two
//     different signature weapons - a breakable rusty sword in one telling,
//     a 4-charge energy sceptre in another, neither modeled): FP 8,
//     Dmg 3d6, Armour 1, End 36.
//   - Смийборг (§312): FP 9, Dmg 5d6, Armour 2, End 45. His 1-in-6-per-round
//     death spell (bypasses armour, needs a Psychic Ability save) isn't
//     modeled.
//   - Небуларон (§484, final demon-god boss): FP 8, Dmg 4d6+4, Armour 2,
//     End 50. No Psychic Ability value is printed for this one at all.
//   - Куел (§473): FP 6, Dmg 2d6, Armour 1, End 35. His two alternating
//     Psychic-Ability-check spells aren't modeled.
//   - Фантом (§502): FP 7, Dmg 2d6+2, End 40. His instant-kill critical
//     (to-hit roll of exactly 2) isn't modeled - watch for a natural 2 on
//     the enemy's attack roll and treat it as a loss by hand if desired.
//   - Страж (arena guard, §241): FP 6, Dmg 1d6, Armour 1, End 8. Source
//     fight ends early (at End 5, not 0) with a decisive-enough-to-end-the-
//     duel threshold - stop the sim at End 5 rather than 0 for this one.
//   - Младеж/Посветен/Момиче (three separate class-gated "trial" duelists,
//     §336/§373/§494 - only one is ever encountered per playthrough
//     depending on which class you picked): Младеж FP 6 Dmg 1d6 End 6;
//     Посветен FP 6 Dmg 1d6+1 End 5; Момиче FP 6 Dmg 1d6-2 End 5 (floor 0
//     per round, same as this book's own negative-damage convention).
//   - Човекът в синьо (§29): FP 7, Dmg 1d6+1, End 15.
//   - Нощни елфи (§386): FP 7, Dmg 1d6+1, Armour 1, End 6.
//   - Мъртви фетишисти (§479): FP 5, Dmg 6d6+1, End 4.
//   - Чучури горгони (§507): FP 5, Dmg 1d6+2, Armour 2, End 7.
//
// Excluded from the roster: Имрагарн (§124, a resurrected NPC who JOINS the
// player's side, not an enemy - has a full stat block but it's a companion,
// not a fight).
//
// book_enemies column reuse (only 4 numeric columns exist; this book's
// combat needs 5 - Fighting Prowess, Endurance, damage-dice-count,
// damage-bonus, Armour Class): attack = Fighting Prowess (used for the
// enemy's own to-hit rolls, unlike every SKILL/Defense-style sim before
// this one where "attack" meant something else); hp = Endurance; pb =
// damage dice count; defense = damage flat bonus. Armour Class has no
// column to live in - it is NOT autocomplete-seeded, always resets to 0 on
// enemy pick, and must be hand-entered per fight from the notes above (same
// "autocomplete-fill default only" precedent as several fields in the
// Way of the Tiger sims).
//
// All state lives in pt.sim78, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Rank VIII (solo Adventurer) starting stats per class, from the book's own
// character tables - autocomplete-style convenience defaults only.
const CLASS_PRESETS = {
  warrior:   { fp: 9, dmgDice: 3, dmgBonus: 1, endurance: 48, armor: 3 },
  trickster: { fp: 8, dmgDice: 3, dmgBonus: 0, endurance: 48, armor: 2 },
  mystic:    { fp: 8, dmgDice: 3, dmgBonus: 0, endurance: 40, armor: 2 },
  sorcerer:  { fp: 7, dmgDice: 2, dmgBonus: 2, endurance: 40, armor: 2 },
};

function _emptyEnemy() {
  return { name: '', fp: 0, endurance: 0, enduranceMax: 0, dmgDice: 1, dmgBonus: 0, armor: 0 };
}

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim78) {
    const w = CLASS_PRESETS.warrior;
    pt.sim78 = {
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
  const d = pt.sim78;
  const p = d.player;
  if (p.fp === undefined) p.fp = 9;
  if (p.endurance === undefined) p.endurance = 48;
  if (p.enduranceInitial === undefined) p.enduranceInitial = 48;
  if (p.dmgDice === undefined) p.dmgDice = 3;
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
    _appendLog(d, t('battlesim78.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _applyPlayerFall(d) {
  if (d.player.endurance <= 0) {
    _appendLog(d, t('battlesim78.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _enemyStrike(d, threeDice) {
  const roll = threeDice ? _roll3d6() : _roll2d6();
  const hit = roll <= d.enemy.fp;
  if (!hit) {
    _appendLog(d, t('battlesim78.log.enemy_misses', { enemy: _enemyNameSafe(d), dice: threeDice ? 3 : 2, roll, fp: d.enemy.fp }));
    return;
  }
  const raw = _rollNd6(Math.max(1, d.enemy.dmgDice)) + (d.enemy.dmgBonus || 0);
  const dmg = Math.max(0, raw - (d.player.armor || 0));
  d.player.endurance = Math.max(0, d.player.endurance - dmg);
  _appendLog(d, t('battlesim78.log.enemy_hits', { enemy: _enemyNameSafe(d), dice: threeDice ? 3 : 2, roll, fp: d.enemy.fp, raw, armor: d.player.armor, n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
}

function _attack() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  d.roundsThisBattle++;

  const roll = _roll2d6();
  const hit = roll <= d.player.fp;
  _appendLog(d, t('battlesim78.log.attack', { roll, fp: d.player.fp, enemy: _enemyNameSafe(d) }));

  if (!hit) {
    _appendLog(d, t('battlesim78.log.miss'));
  } else {
    const raw = _rollNd6(Math.max(1, d.player.dmgDice)) + (d.player.dmgBonus || 0);
    const dmg = Math.max(0, raw - (d.enemy.armor || 0));
    d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
    _appendLog(d, t('battlesim78.log.you_hit', { enemy: _enemyNameSafe(d), raw, armor: d.enemy.armor, n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax }));
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
  _appendLog(d, t('battlesim78.log.defend'));
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
  if (d.log.length) _appendLog(d, t('battlesim78.log.reset_sep'));
  _appendLog(d, t('battlesim78.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim78.ui.endurance')}:${e.hp ?? '?'}</span></li>`
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

  _setVal('sim78-player-fp', p.fp);
  _setVal('sim78-player-endurance', p.endurance);
  _setVal('sim78-player-endurancemax', p.enduranceInitial);
  _setVal('sim78-player-dmgdice', p.dmgDice);
  _setVal('sim78-player-dmgbonus', p.dmgBonus);
  _setVal('sim78-player-armor', p.armor);

  if (!skipEnemyPick) _setVal('sim78-enemy-pick', e.name);
  _setVal('sim78-enemy-fp', e.fp);
  _setVal('sim78-enemy-endurance', e.endurance);
  _setVal('sim78-enemy-endurancemax', e.enduranceMax);
  _setVal('sim78-enemy-dmgdice', e.dmgDice);
  _setVal('sim78-enemy-dmgbonus', e.dmgBonus);
  _setVal('sim78-enemy-armor', e.armor);

  const over = _battleOver(d);
  document.getElementById('sim78-attack').disabled = over;
  document.getElementById('sim78-defend').disabled = over;

  const status = document.getElementById('sim78-status');
  if (p.endurance <= 0) status.innerHTML = t('battlesim78.status.fallen', { skull: SVG_SKULL });
  else if (e.enduranceMax > 0 && e.endurance <= 0) status.innerHTML = t('battlesim78.status.victory', { trophy: SVG_TROPHY });
  else status.innerHTML = '';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim78-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim78-history-summary');
  const listEl = document.getElementById('sim78-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim78.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim78.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim78.history.won') : t('battlesim78.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim78.ui.endurance')} ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim78() {
  const overlay = document.getElementById('sim78-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim78(); return; }
  _renderAll();
}

function openSim78() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim78-overlay').classList.add('active');
}

function closeSim78() {
  document.getElementById('sim78-overlay')?.classList.remove('active');
}

export function setSim78Visible(visible) {
  const btn = document.getElementById('sim78-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim78();
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

export function initSim78() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim78-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim78.ui.title')}</span>
        <button id="sim78-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim78.ui.you')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim78.ui.class')}</span>
              <select id="sim78-class-pick" class="inv-edit-input">
                <option value="">${t('battlesim78.ui.class_pick')}</option>
                <option value="warrior">${t('battlesim78.ui.class_warrior')}</option>
                <option value="trickster">${t('battlesim78.ui.class_trickster')}</option>
                <option value="mystic">${t('battlesim78.ui.class_mystic')}</option>
                <option value="sorcerer">${t('battlesim78.ui.class_sorcerer')}</option>
              </select>
            </div>
            ${_numField(t('battlesim78.ui.fp'), 'sim78-player-fp')}
            ${_numField(t('battlesim78.ui.endurance'), 'sim78-player-endurance')}
            ${_numField(t('battlesim78.ui.endurance_initial'), 'sim78-player-endurancemax')}
            ${_numField(t('battlesim78.ui.dmg_dice'), 'sim78-player-dmgdice')}
            ${_numField(t('battlesim78.ui.dmg_bonus'), 'sim78-player-dmgbonus')}
            ${_numField(t('battlesim78.ui.armor'), 'sim78-player-armor')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim78.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim78.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim78-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim78-enemy-pick-dropdown">
                <ul id="sim78-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim78.ui.fp'), 'sim78-enemy-fp')}
            ${_numField(t('battlesim78.ui.endurance'), 'sim78-enemy-endurance')}
            ${_numField(t('battlesim78.ui.endurance_max'), 'sim78-enemy-endurancemax')}
            ${_numField(t('battlesim78.ui.dmg_dice'), 'sim78-enemy-dmgdice')}
            ${_numField(t('battlesim78.ui.dmg_bonus'), 'sim78-enemy-dmgbonus')}
            ${_numField(t('battlesim78.ui.armor'), 'sim78-enemy-armor')}
          </div>
          <div id="sim78-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim78-attack" class="inv-add-btn bsim-action-primary">${t('battlesim78.btn.attack')}</button>
            <button id="sim78-defend" class="inv-add-btn">${t('battlesim78.btn.defend')}</button>
            <button id="sim78-reset" class="inv-add-btn">${t('battlesim78.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim78-history-summary">${t('battlesim78.history.summary', { n: 0 })}</summary>
            <div id="sim78-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim78-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim78-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim78);
  document.getElementById('sim78-close').addEventListener('click', closeSim78);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim78(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim78-overlay'),
    open:  openSim78,
    close: closeSim78,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim78();
  });

  document.getElementById('sim78-attack').addEventListener('click', _attack);
  document.getElementById('sim78-defend').addEventListener('click', _defend);
  document.getElementById('sim78-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim78-class-pick').addEventListener('change', e => {
    if (e.target.value) _applyClassPreset(e.target.value);
  });

  document.getElementById('sim78-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim78-enemy-pick', 'sim78-enemy-pick-dropdown', enemy => {
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
    'sim78-player-fp': ['player', 'fp'], 'sim78-player-endurance': ['player', 'endurance'],
    'sim78-player-endurancemax': ['player', 'enduranceInitial'], 'sim78-player-dmgdice': ['player', 'dmgDice'],
    'sim78-player-dmgbonus': ['player', 'dmgBonus'], 'sim78-player-armor': ['player', 'armor'],
    'sim78-enemy-fp': ['enemy', 'fp'], 'sim78-enemy-endurance': ['enemy', 'endurance'],
    'sim78-enemy-endurancemax': ['enemy', 'enduranceMax'], 'sim78-enemy-dmgdice': ['enemy', 'dmgDice'],
    'sim78-enemy-dmgbonus': ['enemy', 'dmgBonus'], 'sim78-enemy-armor': ['enemy', 'armor'],
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
