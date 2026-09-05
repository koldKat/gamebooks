// ── Battle Simulator (Стените на Спайт / The Walls of Spyte, book 398,
//    Blood Sword book 5 by Dave Morris & Oliver Johnson) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 398 only) by the caller in boot.js via
// setSim398Visible().
// To remove: delete this file, remove its import line and initSim398()/
// setSim398Visible() calls from boot.js, remove 'sim398' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim398-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim398-btn selectors in
// battlesim.css.
//
// Same mechanic as books 317/318/319/320 (battlesim317.js et al) -
// confirmed from this book's own rules recap (identical wording to the
// other four). Four attributes: Fighting Prowess (to-hit), Psychic Ability
// (narrative/spell-resist only, not modeled), Awareness (turn-order only,
// not modeled), Endurance (hp). Per-round choice of Attack (2d6 to-hit,
// then 1-2 damage dice + flat bonus minus target Armour Rating) or Defend
// (skips own attack, forces the enemy to roll 3d6 instead of 2d6 to hit).
//
// Starting rank: this book's own text states a solo player is 20th rank
// (higher than books 317-320's 16th, since this is the final book in the
// series) - read fresh from this book's own class tables, not assumed:
// Warrior FP 11/Dmg 7d6+1/End 120/Armour 4 (plate armour, an upgrade from
// earlier books' chainmail Armour 3), Trickster FP 10/Dmg 7d6/End 120/
// Armour 2 (studded leather), Sage FP 10/Dmg 7d6/End 100/Armour 2 (studded
// leather), Enchanter FP 9/Dmg 5d6+2/End 100/Armour 2 (studded leather).
// Selecting a class in this sim's UI just fills these starting numbers in
// as a convenience default - every field remains hand-editable afterward.
//
// This is the Bulgarian translation of book 321 (The Walls of Spyte);
// both share identical section numbering (550 sections each). This book
// was never previously imported (0 rows in book_sections until this pass)
// - built from scratch by parsing the PDF directly, since book 321's own
// import has pre-existing merge corruption at several key sections (e.g.
// its own §294 repeats one paragraph twice then splices in unrelated
// content from elsewhere), which made it useful only as a hint, not a
// ground truth, when reconstructing this book's choice graph. 433/550
// sections are reachable from §1; the remaining 117 form one coherent,
// well-understood side-branch whose true entry point (§316) is a
// puzzle-computed destination (the reader assembles 5 collected key
// pieces into an entry code, per that section's own text) rather than a
// printed "turn to N" reference - confirmed structurally identical in
// book 321 (same section shows zero referrers there too), not a parsing
// gap specific to this translation.
//
// Full enemy roster (31 rows, cross-verified against battlesim321.js's
// English data at matching section numbers). Recurring encounters retold
// at several points are seeded once at their most representative value:
//   - Cataphract (§54/§135/§195/§271, several duplicate battles guarding
//     the ice doors, identical stats every telling): FP 8, Dmg 6d6, End 90,
//     Armour 5 (melts by 1 per hit struck, not modeled - always resets to
//     5 on pick).
//   - The Anarch (§16): FP 8, Dmg 3d6, End 30, Armour variable (0, not
//     modeled - its Armour Rating is randomised per hit in the source, not
//     a fixed value).
//   - Onaka (§20/§415, twin tellings, identical stats): FP 8, Dmg 4d6,
//     End 40, Armour 4. Its acid-spit alternate attack (2d6+6) and spell
//     option aren't modeled - this sim represents its melee only.
//   - Angels of Death (§23, three bat-creatures): FP 8, Dmg 2d6, End 21
//     each, Armour 0.
//   - Demon-Lord (§43): FP 12, Dmg 3d6, End 90, Armour 3. Strikes five
//     times per Round with its wands, bypassing armour entirely - not
//     modeled (this sim treats it as one normal attack).
//   - Magus Tor (§44, final-boss remnant if the Five are destroyed but
//     Karunaz absent): FP 12, Dmg 8d6, End 50, Armour 0 vs Blood Sword/3 vs
//     other weapons. Grows by +1 Psychic Ability and +25 Endurance per
//     Round - not modeled (seeded at its starting Endurance only).
//   - Ta'ashim Swordsman (§49): FP 13, Dmg 9d6, End 100, Armour 0.
//   - Devil (§64/§109/§129, identical every telling): FP 9, Dmg 5d6+2,
//     End 105, Armour 1.
//   - Disciples of the Magi, staircase ambush (§478, a variable-size mob
//     keyed to the codeword ROUT, seeded at 20 as printed in the source's
//     example roster at §78): FP 6, Dmg 1d6, End 10 each, Armour 0.
//   - Fiery Serpents (§93, four of them): FP 7, Dmg 3d6+3, End 21 each,
//     Armour 3.
//   - Dissembler (§112/§159/§240, an illusion-caster, same stats every
//     telling): FP 8, Dmg 3d6, End 56, Armour 0. Its four alternating
//     spells aren't modeled.
//   - Undead Queen (§139): FP 8, Dmg 4d6, End 60, Armour 3. Her hypnotic
//     gaze (forces a Psychic resistance roll before you can even attack)
//     isn't modeled.
//   - Giant Bat (§145/§177/§245/§518, identical every telling): FP 10,
//     Dmg 2d6+2, End 77, Armour 0.
//   - Disciples, armoured (§152, six of them, defensive spells acting as
//     armour): FP 7, Dmg 3d6, End 15 each, Armour 3.
//   - Nightshrieker (§175): FP 9, Dmg 4d6, End 50, Armour 0.
//   - Kraken (§179): FP 8, Dmg 6d6, End 50, Armour 4. Its option to attack
//     the barge instead of a player isn't modeled (irrelevant to this
//     app's 1v1 sim shape).
//   - Basilisk (§280, fought alongside the two entries below): FP 6,
//     Dmg 2d6, End 24, Armour 1. Its instant-kill gaze isn't modeled.
//   - Ice Bear (§280): FP 8, Dmg 4d6, End 38, Armour 2. Its retaliatory
//     spine damage on melee attackers isn't modeled.
//   - Razor Birds (§280, six of them): FP 9, Dmg 1d6, End 2 each,
//     Armour 0.
//   - Argus (§324/§501, identical both tellings): FP 9, Dmg 3d6+3, End 54,
//     Armour 3. Its ability to strike up to four adjacent players at once
//     isn't modeled (this sim is 1v1 only).
//   - Orcs (§297/§348/§457, group sizes vary 3-6 across tellings, seeded
//     at §457's six-strong telling): FP 6, Dmg 3d6, End 25 each, Armour 2.
//   - Harbingers of Red Death (§315, three of them): FP 8, Dmg 5d6, End 35
//     each, Armour 5. Their 1-in-3 fear-paralysis isn't modeled.
//   - The True Magi (§347/§452, the final-boss quintet, seeded at §452's
//     later/stronger telling): FP 12, Dmg 8d6, End 75 each, Armour 0 vs
//     Blood Sword/3 vs other weapons. Growing by +1 Psychic Ability and
//     +10 Endurance per Round isn't modeled (seeded at starting Endurance
//     only).
//   - Snorrid the Giant (§385): FP 11, Dmg 20d6, End 950, Armour 10. This
//     Endurance is not a typo - printed as 950, an effectively-unwinnable
//     narrative encounter (fleeing is the intended response); included for
//     completeness, not as a realistic sim target.
//   - Disciples of the Magi, salt-warded (§404/§439, defenceless while the
//     ritual is disrupted, five of them): FP 5, Dmg 1d6, End 15 each,
//     Armour 0.
//   - Biophage (§410): FP 8, Dmg 3d6 (absorbs, ignores armour), End 30,
//     Armour 4. Its Fighting-Prowess/Psychic-Ability drain isn't modeled.
//   - Ebon Automaton (§219/§370, identical both tellings): FP 9, Dmg 3d6,
//     End 70, Armour 7. Its eye-bolt archery alternate attack isn't
//     modeled - this sim represents its melee only.
//   - Undead Lepers (§372, three of them): FP 6, Dmg 3d6, End 30 each,
//     Armour 3. Their wound-disease effect isn't modeled.
//   - Lice (§496, twelve of them, a swarm fought while crossing a titan's
//     carcass): FP 6, Dmg 1d6, End 6 each, Armour 0.
//   - Brontophon (§497): FP 8, Dmg 4d6, End 40, Armour 5. Its escalating
//     noise-damage aura isn't modeled.
//   - Dragon (§524): FP 8, Dmg 7d6, End 150, Armour 4. Its alternate-Round
//     flame breath (6d6 to all players) isn't modeled - this sim
//     represents its claw attack only.
//
// book_enemies column reuse (only 4 numeric columns exist; this book needs
// 5): attack = Fighting Prowess; hp = Endurance; pb = damage dice count;
// defense = damage flat bonus. Armour Rating has no column - NOT
// autocomplete-seeded, always resets to 0 on enemy pick, hand-entered per
// fight from the notes above.
//
// All state lives in pt.sim398, per-user/per-book via currentPlaythrough().

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
  warrior:   { fp: 11, dmgDice: 7, dmgBonus: 1, endurance: 120, armor: 4 },
  trickster: { fp: 10, dmgDice: 7, dmgBonus: 0, endurance: 120, armor: 2 },
  mystic:    { fp: 10, dmgDice: 7, dmgBonus: 0, endurance: 100, armor: 2 },
  sorcerer:  { fp: 9,  dmgDice: 5, dmgBonus: 2, endurance: 100, armor: 2 },
};

function _emptyEnemy() {
  return { name: '', fp: 0, endurance: 0, enduranceMax: 0, dmgDice: 1, dmgBonus: 0, armor: 0 };
}

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim398) {
    const w = CLASS_PRESETS.warrior;
    pt.sim398 = {
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
  const d = pt.sim398;
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
    _appendLog(d, t('battlesim398.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _applyPlayerFall(d) {
  if (d.player.endurance <= 0) {
    _appendLog(d, t('battlesim398.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _enemyStrike(d, threeDice) {
  const roll = threeDice ? _roll3d6() : _roll2d6();
  const hit = roll <= d.enemy.fp;
  if (!hit) {
    _appendLog(d, t('battlesim398.log.enemy_misses', { enemy: _enemyNameSafe(d), dice: threeDice ? 3 : 2, roll, fp: d.enemy.fp }));
    return;
  }
  const raw = _rollNd6(Math.max(1, d.enemy.dmgDice)) + (d.enemy.dmgBonus || 0);
  const dmg = Math.max(0, raw - (d.player.armor || 0));
  d.player.endurance = Math.max(0, d.player.endurance - dmg);
  _appendLog(d, t('battlesim398.log.enemy_hits', { enemy: _enemyNameSafe(d), dice: threeDice ? 3 : 2, roll, fp: d.enemy.fp, raw, armor: d.player.armor, n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
}

function _attack() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  d.roundsThisBattle++;

  const roll = _roll2d6();
  const hit = roll <= d.player.fp;
  _appendLog(d, t('battlesim398.log.attack', { roll, fp: d.player.fp, enemy: _enemyNameSafe(d) }));

  if (!hit) {
    _appendLog(d, t('battlesim398.log.miss'));
  } else {
    const raw = _rollNd6(Math.max(1, d.player.dmgDice)) + (d.player.dmgBonus || 0);
    const dmg = Math.max(0, raw - (d.enemy.armor || 0));
    d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
    _appendLog(d, t('battlesim398.log.you_hit', { enemy: _enemyNameSafe(d), raw, armor: d.enemy.armor, n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax }));
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
  _appendLog(d, t('battlesim398.log.defend'));
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
  if (d.log.length) _appendLog(d, t('battlesim398.log.reset_sep'));
  _appendLog(d, t('battlesim398.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim398.ui.endurance')}:${e.hp ?? '?'}</span></li>`
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

  _setVal('sim398-player-fp', p.fp);
  _setVal('sim398-player-endurance', p.endurance);
  _setVal('sim398-player-endurancemax', p.enduranceInitial);
  _setVal('sim398-player-dmgdice', p.dmgDice);
  _setVal('sim398-player-dmgbonus', p.dmgBonus);
  _setVal('sim398-player-armor', p.armor);

  if (!skipEnemyPick) _setVal('sim398-enemy-pick', e.name);
  _setVal('sim398-enemy-fp', e.fp);
  _setVal('sim398-enemy-endurance', e.endurance);
  _setVal('sim398-enemy-endurancemax', e.enduranceMax);
  _setVal('sim398-enemy-dmgdice', e.dmgDice);
  _setVal('sim398-enemy-dmgbonus', e.dmgBonus);
  _setVal('sim398-enemy-armor', e.armor);

  const over = _battleOver(d);
  document.getElementById('sim398-attack').disabled = over;
  document.getElementById('sim398-defend').disabled = over;

  const status = document.getElementById('sim398-status');
  if (p.endurance <= 0) status.innerHTML = t('battlesim398.status.fallen', { skull: SVG_SKULL });
  else if (e.enduranceMax > 0 && e.endurance <= 0) status.innerHTML = t('battlesim398.status.victory', { trophy: SVG_TROPHY });
  else status.innerHTML = '';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim398-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim398-history-summary');
  const listEl = document.getElementById('sim398-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim398.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim398.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim398.history.won') : t('battlesim398.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim398.ui.endurance')} ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim398() {
  const overlay = document.getElementById('sim398-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim398(); return; }
  _renderAll();
}

function openSim398() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim398-overlay').classList.add('active');
}

function closeSim398() {
  document.getElementById('sim398-overlay')?.classList.remove('active');
}

export function setSim398Visible(visible) {
  const btn = document.getElementById('sim398-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim398();
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

export function initSim398() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim398-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim398.ui.title')}</span>
        <button id="sim398-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim398.ui.you')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim398.ui.class')}</span>
              <select id="sim398-class-pick" class="inv-edit-input">
                <option value="">${t('battlesim398.ui.class_pick')}</option>
                <option value="warrior">${t('battlesim398.ui.class_warrior')}</option>
                <option value="trickster">${t('battlesim398.ui.class_trickster')}</option>
                <option value="mystic">${t('battlesim398.ui.class_mystic')}</option>
                <option value="sorcerer">${t('battlesim398.ui.class_sorcerer')}</option>
              </select>
            </div>
            ${_numField(t('battlesim398.ui.fp'), 'sim398-player-fp')}
            ${_numField(t('battlesim398.ui.endurance'), 'sim398-player-endurance')}
            ${_numField(t('battlesim398.ui.endurance_initial'), 'sim398-player-endurancemax')}
            ${_numField(t('battlesim398.ui.dmg_dice'), 'sim398-player-dmgdice')}
            ${_numField(t('battlesim398.ui.dmg_bonus'), 'sim398-player-dmgbonus')}
            ${_numField(t('battlesim398.ui.armor'), 'sim398-player-armor')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim398.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim398.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim398-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim398-enemy-pick-dropdown">
                <ul id="sim398-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim398.ui.fp'), 'sim398-enemy-fp')}
            ${_numField(t('battlesim398.ui.endurance'), 'sim398-enemy-endurance')}
            ${_numField(t('battlesim398.ui.endurance_max'), 'sim398-enemy-endurancemax')}
            ${_numField(t('battlesim398.ui.dmg_dice'), 'sim398-enemy-dmgdice')}
            ${_numField(t('battlesim398.ui.dmg_bonus'), 'sim398-enemy-dmgbonus')}
            ${_numField(t('battlesim398.ui.armor'), 'sim398-enemy-armor')}
          </div>
          <div id="sim398-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim398-attack" class="inv-add-btn bsim-action-primary">${t('battlesim398.btn.attack')}</button>
            <button id="sim398-defend" class="inv-add-btn">${t('battlesim398.btn.defend')}</button>
            <button id="sim398-reset" class="inv-add-btn">${t('battlesim398.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim398-history-summary">${t('battlesim398.history.summary', { n: 0 })}</summary>
            <div id="sim398-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim398-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim398-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim398);
  document.getElementById('sim398-close').addEventListener('click', closeSim398);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim398(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim398-overlay'),
    open:  openSim398,
    close: closeSim398,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim398();
  });

  document.getElementById('sim398-attack').addEventListener('click', _attack);
  document.getElementById('sim398-defend').addEventListener('click', _defend);
  document.getElementById('sim398-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim398-class-pick').addEventListener('change', e => {
    if (e.target.value) _applyClassPreset(e.target.value);
  });

  document.getElementById('sim398-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim398-enemy-pick', 'sim398-enemy-pick-dropdown', enemy => {
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
    'sim398-player-fp': ['player', 'fp'], 'sim398-player-endurance': ['player', 'endurance'],
    'sim398-player-endurancemax': ['player', 'enduranceInitial'], 'sim398-player-dmgdice': ['player', 'dmgDice'],
    'sim398-player-dmgbonus': ['player', 'dmgBonus'], 'sim398-player-armor': ['player', 'armor'],
    'sim398-enemy-fp': ['enemy', 'fp'], 'sim398-enemy-endurance': ['enemy', 'endurance'],
    'sim398-enemy-endurancemax': ['enemy', 'enduranceMax'], 'sim398-enemy-dmgdice': ['enemy', 'dmgDice'],
    'sim398-enemy-dmgbonus': ['enemy', 'dmgBonus'], 'sim398-enemy-armor': ['enemy', 'armor'],
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
