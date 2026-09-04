// ── Battle Simulator (The Battlepits of Krarth, book 317, Blood Sword book 1
//    by Dave Morris & Oliver Johnson) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 317 only) by the caller in boot.js via
// setSim317Visible().
// To remove: delete this file, remove its import line and initSim317()/
// setSim317Visible() calls from boot.js, remove 'sim317' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim317-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim317-btn selectors in
// battlesim.css.
//
// Same book/mechanic as book 78 (battlesim78.js), which is the Bulgarian
// translation "Бойните ровове на Крарт" - confirmed identical section
// numbering between editions (every combat encounter here landed on the
// same section number as its Bulgarian counterpart) and identical rank/class
// tables, read fresh from this book's own English text. Four attributes:
// Fighting Prowess (to-hit), Psychic Ability (narrative/spell-resist only,
// not modeled), Awareness (turn-order only, irrelevant to this app's solo
// 1v1 shape, not modeled), Endurance (hp). Per-round choice of Attack or
// Defend: Attack rolls 2d6, hits on a result <= Fighting Prowess, then rolls
// 1-2 damage dice + a flat bonus and subtracts the target's Armour Rating
// (floor 0); Defend skips the player's own attack but forces the enemy to
// roll 3d6 to hit instead of 2d6; whichever side doesn't act still attacks
// back normally after an Attack round.
//
// Starting rank: this book's own rank tables for a solo Adventurer (read
// from its own "THE WARRIOR"/"THE TRICKSTER"/"THE SAGE"/"THE ENCHANTER"
// sections) give Eighth-rank stats matching book 78's rank VIII exactly:
//   Warrior:   FP 9, Damage 3d6+1, Endurance 48, chainmail Armour 3
//   Trickster: FP 8, Damage 3d6,   Endurance 48, studded leather Armour 2
//   Sage:      FP 8, Damage 3d6,   Endurance 40, Armour 2 (series-standard,
//     not restated per-class in this book's text, same precedent as 78/135)
//   Enchanter: FP 7, Damage 2d6+2, Endurance 40, Armour 2
// Selecting a class in this sim's UI just fills these starting numbers in as
// a convenience default - every field remains hand-editable afterward.
//
// Full enemy roster (31 rows, read from all 51 stat-block-bearing sections
// of 534 total, cross-checked against book 78's own roster for the same
// story beats). Recurring encounters retold at several points are seeded
// once at their most representative value, not duplicated per section:
//   - Assassins (§3/§14/§54/§399/§424/§530, group of 3-6, identical stats
//     every telling): FP 7, Dmg 1d6, End 5-6, Armour 0 (none printed). Their
//     Shuriken ranged attack when not adjacent isn't modeled.
//   - Assassin, poisoned dagger (§366, single, distinct from the group
//     above): FP 7, Dmg 1d6+1, End 15. Poison-on-hit instant-kill note not
//     modeled.
//   - Barbarians (§6/§54/§73/§156/§211/§314/§491, group of 2-4, stats
//     consistent every telling): FP 8, Dmg 1d6+2, End 8-12 each, Armour 1.
//   - Dirge-Man (§11, single named): FP 7, Dmg 2d6, End 13, Armour 1.
//   - Dirges (§112/§407, group of 6-7, bite attack, distinct from the
//     Dirge-Man above): FP 6, Dmg 1d6+2, End 5 each, Armour 0.
//   - Skiapyrs, weakest form (§12/§411, group of 6): FP 5, Dmg 1d6, End 10
//     each. Their damage ignores Armour Rating entirely per the book's own
//     footnote - set the enemy's Armour field to 0 regardless of source.
//   - Skiapyrs, mid form (§429, group of 6): FP 7, Dmg 1d6+2, End 12 each.
//     Same armour-ignoring note.
//   - Skiapyrs, strongest form (§376, group of 6): FP 7, Dmg 6d6+2, End 12
//     each. Same armour-ignoring note.
//   - Magus Vyl (§14/§261/§444, identical every telling): FP 7, Dmg 3d6,
//     End 35, Armour 2. His paralysing touch isn't modeled.
//   - Icon the Ungodly (§27/§341, identical both tellings, renamed "the
//     Warlock" the second time): FP 8, Dmg 2d6+2, End 28, Armour 2. His
//     Retributive-Fire cloak and immunity to Enthralment/Command aren't
//     modeled.
//   - Man in Blue (§29): FP 7, Dmg 1d6+1, End 15.
//   - Corpses (§34, group of 6): FP 5, Dmg 1d6+1, End 4 each.
//   - Echidna (§129): FP 8, Dmg 2d6+2, End 40, Armour 2. Poison-bite side
//     effect not modeled.
//   - Skrymir the Giant (§133/§342/§539, three retellings with genuinely
//     different stats each time): seeded at the first, strongest encounter
//     (FP 9, Dmg 4d6, End 70, Armour 3); the second (§342) drops to End 55
//     at the same damage, the third (§539, End 55, Dmg 5d6+6) - adjust by
//     hand for whichever retelling is being simulated.
//   - Adventurers (§198/§284, identical both tellings, per-Adventurer -
//     the source fields two of them at once): FP 8, Dmg 2d6, End 22-23 each,
//     Armour 3.
//   - Bowmen (§82, group of 4): FP 7, Dmg 1d6, End 6 each. Ranged-shoot
//     behaviour not modeled - treat as melee.
//   - Guard (§241, arena duel): FP 6, Dmg 1d6, End 8, Armour 1.
//   - Ranger (§303/§367, identical both tellings): FP 8, Dmg 3d6, End 36,
//     Armour 1. His energy sceptre (4 charges, 5d6 damage, bypasses to-hit)
//     and breakable rusty sword aren't modeled - this sim represents his
//     plain melee option only.
//   - Smeaborg (§312): FP 9, Dmg 5d6, End 45, Armour 2. His 1-in-6-per-round
//     death spell isn't modeled.
//   - Giant Spider(s) (§316/§489, identical both tellings): FP 5, Dmg 1d6+1,
//     End 6.
//   - Youth (§336, one of three class-gated trial duelists, only one is
//     ever fought per playthrough): FP 6, Dmg 1d6, End 6.
//   - Initiate (§373, second trial duelist): FP 6, Dmg 1d6+1, End 5.
//   - Girl (§494, third trial duelist): FP 6, Dmg 1d6-2 (floor 0/round), End
//     5. Her White Fire spell isn't modeled.
//   - Night Elves (§386, group of 4): FP 7, Dmg 1d6+1, End 6 each, Armour 1.
//   - Quel (§473): FP 6, Dmg 2d6, End 35, Armour 1. His two alternating
//     spells aren't modeled.
//   - Death Fetishists (§479, group of 4): FP 5, Dmg 6d6+1, End 4 each.
//   - Nebularon (§484, final demon-god boss): FP 8, Dmg 4d6+4, End 50,
//     Armour 2.
//   - Eidolon (§502): FP 7, Dmg 2d6+2, End 40. Its instant-effect critical
//     on a natural fight roll of 2 isn't modeled.
//   - Gargoyles (§507, group of 7): FP 5, Dmg 1d6+2, End 7 each, Armour 2.
//
// Excluded from the roster: Imragarn (§124, a resurrected NPC who JOINS the
// player's side, not an enemy - has a full stat block but it's a companion,
// not a fight), same exclusion as book 78's identical case.
//
// book_enemies column reuse (only 4 numeric columns exist; this book needs
// 5): attack = Fighting Prowess; hp = Endurance; pb = damage dice count;
// defense = damage flat bonus. Armour Rating has no column - NOT
// autocomplete-seeded, always resets to 0 on enemy pick, hand-entered per
// fight from the notes above.
//
// All state lives in pt.sim317, per-user/per-book via currentPlaythrough().

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
  if (!pt.sim317) {
    const w = CLASS_PRESETS.warrior;
    pt.sim317 = {
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
  const d = pt.sim317;
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
    _appendLog(d, t('battlesim317.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _applyPlayerFall(d) {
  if (d.player.endurance <= 0) {
    _appendLog(d, t('battlesim317.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _enemyStrike(d, threeDice) {
  const roll = threeDice ? _roll3d6() : _roll2d6();
  const hit = roll <= d.enemy.fp;
  if (!hit) {
    _appendLog(d, t('battlesim317.log.enemy_misses', { enemy: _enemyNameSafe(d), dice: threeDice ? 3 : 2, roll, fp: d.enemy.fp }));
    return;
  }
  const raw = _rollNd6(Math.max(1, d.enemy.dmgDice)) + (d.enemy.dmgBonus || 0);
  const dmg = Math.max(0, raw - (d.player.armor || 0));
  d.player.endurance = Math.max(0, d.player.endurance - dmg);
  _appendLog(d, t('battlesim317.log.enemy_hits', { enemy: _enemyNameSafe(d), dice: threeDice ? 3 : 2, roll, fp: d.enemy.fp, raw, armor: d.player.armor, n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
}

function _attack() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  d.roundsThisBattle++;

  const roll = _roll2d6();
  const hit = roll <= d.player.fp;
  _appendLog(d, t('battlesim317.log.attack', { roll, fp: d.player.fp, enemy: _enemyNameSafe(d) }));

  if (!hit) {
    _appendLog(d, t('battlesim317.log.miss'));
  } else {
    const raw = _rollNd6(Math.max(1, d.player.dmgDice)) + (d.player.dmgBonus || 0);
    const dmg = Math.max(0, raw - (d.enemy.armor || 0));
    d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
    _appendLog(d, t('battlesim317.log.you_hit', { enemy: _enemyNameSafe(d), raw, armor: d.enemy.armor, n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax }));
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
  _appendLog(d, t('battlesim317.log.defend'));
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
  if (d.log.length) _appendLog(d, t('battlesim317.log.reset_sep'));
  _appendLog(d, t('battlesim317.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim317.ui.endurance')}:${e.hp ?? '?'}</span></li>`
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

  _setVal('sim317-player-fp', p.fp);
  _setVal('sim317-player-endurance', p.endurance);
  _setVal('sim317-player-endurancemax', p.enduranceInitial);
  _setVal('sim317-player-dmgdice', p.dmgDice);
  _setVal('sim317-player-dmgbonus', p.dmgBonus);
  _setVal('sim317-player-armor', p.armor);

  if (!skipEnemyPick) _setVal('sim317-enemy-pick', e.name);
  _setVal('sim317-enemy-fp', e.fp);
  _setVal('sim317-enemy-endurance', e.endurance);
  _setVal('sim317-enemy-endurancemax', e.enduranceMax);
  _setVal('sim317-enemy-dmgdice', e.dmgDice);
  _setVal('sim317-enemy-dmgbonus', e.dmgBonus);
  _setVal('sim317-enemy-armor', e.armor);

  const over = _battleOver(d);
  document.getElementById('sim317-attack').disabled = over;
  document.getElementById('sim317-defend').disabled = over;

  const status = document.getElementById('sim317-status');
  if (p.endurance <= 0) status.innerHTML = t('battlesim317.status.fallen', { skull: SVG_SKULL });
  else if (e.enduranceMax > 0 && e.endurance <= 0) status.innerHTML = t('battlesim317.status.victory', { trophy: SVG_TROPHY });
  else status.innerHTML = '';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim317-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim317-history-summary');
  const listEl = document.getElementById('sim317-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim317.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim317.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim317.history.won') : t('battlesim317.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim317.ui.endurance')} ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim317() {
  const overlay = document.getElementById('sim317-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim317(); return; }
  _renderAll();
}

function openSim317() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim317-overlay').classList.add('active');
}

function closeSim317() {
  document.getElementById('sim317-overlay')?.classList.remove('active');
}

export function setSim317Visible(visible) {
  const btn = document.getElementById('sim317-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim317();
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

export function initSim317() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim317-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim317.ui.title')}</span>
        <button id="sim317-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim317.ui.you')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim317.ui.class')}</span>
              <select id="sim317-class-pick" class="inv-edit-input">
                <option value="">${t('battlesim317.ui.class_pick')}</option>
                <option value="warrior">${t('battlesim317.ui.class_warrior')}</option>
                <option value="trickster">${t('battlesim317.ui.class_trickster')}</option>
                <option value="mystic">${t('battlesim317.ui.class_mystic')}</option>
                <option value="sorcerer">${t('battlesim317.ui.class_sorcerer')}</option>
              </select>
            </div>
            ${_numField(t('battlesim317.ui.fp'), 'sim317-player-fp')}
            ${_numField(t('battlesim317.ui.endurance'), 'sim317-player-endurance')}
            ${_numField(t('battlesim317.ui.endurance_initial'), 'sim317-player-endurancemax')}
            ${_numField(t('battlesim317.ui.dmg_dice'), 'sim317-player-dmgdice')}
            ${_numField(t('battlesim317.ui.dmg_bonus'), 'sim317-player-dmgbonus')}
            ${_numField(t('battlesim317.ui.armor'), 'sim317-player-armor')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim317.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim317.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim317-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim317-enemy-pick-dropdown">
                <ul id="sim317-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim317.ui.fp'), 'sim317-enemy-fp')}
            ${_numField(t('battlesim317.ui.endurance'), 'sim317-enemy-endurance')}
            ${_numField(t('battlesim317.ui.endurance_max'), 'sim317-enemy-endurancemax')}
            ${_numField(t('battlesim317.ui.dmg_dice'), 'sim317-enemy-dmgdice')}
            ${_numField(t('battlesim317.ui.dmg_bonus'), 'sim317-enemy-dmgbonus')}
            ${_numField(t('battlesim317.ui.armor'), 'sim317-enemy-armor')}
          </div>
          <div id="sim317-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim317-attack" class="inv-add-btn bsim-action-primary">${t('battlesim317.btn.attack')}</button>
            <button id="sim317-defend" class="inv-add-btn">${t('battlesim317.btn.defend')}</button>
            <button id="sim317-reset" class="inv-add-btn">${t('battlesim317.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim317-history-summary">${t('battlesim317.history.summary', { n: 0 })}</summary>
            <div id="sim317-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim317-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim317-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim317);
  document.getElementById('sim317-close').addEventListener('click', closeSim317);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim317(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim317-overlay'),
    open:  openSim317,
    close: closeSim317,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim317();
  });

  document.getElementById('sim317-attack').addEventListener('click', _attack);
  document.getElementById('sim317-defend').addEventListener('click', _defend);
  document.getElementById('sim317-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim317-class-pick').addEventListener('change', e => {
    if (e.target.value) _applyClassPreset(e.target.value);
  });

  document.getElementById('sim317-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim317-enemy-pick', 'sim317-enemy-pick-dropdown', enemy => {
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
    'sim317-player-fp': ['player', 'fp'], 'sim317-player-endurance': ['player', 'endurance'],
    'sim317-player-endurancemax': ['player', 'enduranceInitial'], 'sim317-player-dmgdice': ['player', 'dmgDice'],
    'sim317-player-dmgbonus': ['player', 'dmgBonus'], 'sim317-player-armor': ['player', 'armor'],
    'sim317-enemy-fp': ['enemy', 'fp'], 'sim317-enemy-endurance': ['enemy', 'endurance'],
    'sim317-enemy-endurancemax': ['enemy', 'enduranceMax'], 'sim317-enemy-dmgdice': ['enemy', 'dmgDice'],
    'sim317-enemy-dmgbonus': ['enemy', 'dmgBonus'], 'sim317-enemy-armor': ['enemy', 'armor'],
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
