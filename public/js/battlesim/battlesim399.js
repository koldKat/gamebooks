// ── Battle Simulator (Роди се сянка, book 399, Хроники на Орм) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 399 only) by the caller in boot.js via
// setSim399Visible().
// To remove: delete this file, remove its import line and initSim399()/
// setSim399Visible() calls from boot.js, remove 'sim399' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim399-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim399-btn selectors in
// battlesim.css.
//
// This book's own rules ("ПРОВЕЖДАНЕ НА БИТКИ") define FIVE distinct combat
// types, each with its own order/attack/defence formula, all sharing the
// same shape: order = 1d6(Шанс) + Бързина + (equipment Speed, if armed);
// attack = 1d6(Шанс) + [mode-specific stats]; damage = attack total minus
// the DEFENDER's own stats per the SAME formula the ATTACKER is using (not
// the defender's own combat type) - a fight can be asymmetric (§14/§61/§62
// explicitly state the player fights with Vehicle-combat rules while the
// monster fights with Unarmed-combat rules; each side's attacks still use
// their own assigned formula). A negative result is NOT a miss - "Ако
// резултатът е отрицателно число, загубата е в ущърб на атакуващия" (if the
// result is negative, the ATTACKER takes that damage instead) - modeled
// here as backlash, not a no-op miss.
//
// The five modes and their formulas (order add-in / attack sum / defence
// subtracted from attack):
//   - Невъоръжена схватка (unarmed): order +0; attack = Сила; defence =
//     Устойчивост + Рефлекс.
//   - Бой с хладни оръжия (melee): order + weapon Speed; attack = Сила +
//     Боравене с хладни оръжия + weapon Power; defence = Устойчивост +
//     Рефлекс + Боравене с хладни оръжия (the DEFENDER's own melee skill).
//   - Престрелка (gunfight): order + weapon Speed; attack = Точност +
//     Стрелба + weapon Power; defence = Устойчивост + Рефлекс.
//   - Кибсхватка (cyberspace): order + computer Speed; attack = Точност +
//     Пълзене + computer Power; defence = Устойчивост + Рефлекс.
//   - Бой с превозни средства (vehicle): order + vehicle Speed; attack =
//     Точност + Управление на МПС + vehicle Power + vehicle Armament;
//     defence = Устойчивост + Рефлекс + vehicle Manoeuvrability.
// To keep the form compact, one generic "Skill" field (relabelled per mode:
// melee/shooting/netrunning/driving) and four generic equipment fields
// (Power, Speed, Armament, Manoeuvrability - the last two only meaningful
// for Vehicle combat) are shared across all five modes rather than showing
// 15+ separately-named fields; unused fields for a given mode are simply
// left at 0.
//
// Critical Endurance: each side's Издръжливост has two printed numbers
// (e.g. "15 - 6") - the second is the critical threshold. The book's rules
// state that once current Endurance drops to/below the critical value, ALL
// of that character's remaining coefficients permanently drop by one point
// (until Endurance is restored above the threshold by some other means,
// which this sim can't track). Modeled as a one-time flag per side: the
// first time a hit brings Endurance to/below its critical value, 1 is
// subtracted from every stat field for that side (Speed/Str/Acc/Reflex/
// Resilience/Skill/Power/EqSpeed/Weapon/Manoeuvrability), floor 0.
//
// Full enemy roster (13 rows, read from every stat-block-bearing section of
// 398 total):
//   - Гигантски гущер (§14): End 56-28, Speed 6, Str 10, Reflex 6, Resil 8.
//     Player fights by Vehicle-combat rules (the player is in a digger),
//     the lizard by Unarmed-combat rules - an asymmetric fight.
//   - Служителка на "Бионаги" (§53, Cyberspace): End 18-12, Speed 2, Str 2,
//     Acc 2, Reflex 2, Resil 3, Netrun 4; computer "Toshiba" - no printed
//     Power/Speed for it, left at 0/0 (unconfirmed, not a source gap this
//     sim can resolve).
//   - Виртуален фехтовач (§58, Melee/rapier): End 15-6, Speed 3, Acc 4,
//     Reflex 3, Resil 2, Melee 5; rapier Power 3, Speed 4.
//   - Киберчудовище (§61): End 36-16, Speed 4, Str 8, Reflex 5, Resil 9.
//     Same asymmetric shape as §14 (player: Vehicle-combat, monster:
//     Unarmed-combat).
//   - Киберпаяк (§62): End 16-8, Speed 4, Acc 8, Reflex 5, Resil 8; plasma
//     cannon Power 4, Speed 2. Player fights by Vehicle-combat rules, the
//     spider by Gunfight rules (asymmetric).
//   - Виртуална котка-сънувач "Баст" (§78, Cyberspace): End 8-4, Speed 4,
//     Acc 4, Reflex 5, Resil 3, Netrun 5; her symbiotic system (in place of
//     a computer) has Power 4, Speed 5.
//   - Неизвестен корпоративен служител (§122, Unarmed): End 14 (no printed
//     critical value - the source states this specific fight ends early,
//     at 10 Endurance rather than 0, a one-off rule override this sim
//     doesn't special-case; seeded with critical 10 as the closest fit),
//     Speed 2, Str 2, Reflex 2, Resil 3.
//   - Уличен дилър (§147, Unarmed): End 6-2, Speed 1, Str 2, Reflex 1,
//     Resil 2.
//   - Защитна програма (§270, Cyberspace): End 10-4, Speed 2, Acc 2,
//     Reflex 2, Resil 4, Netrun 3; Power 3, Speed 3.
//   - Виртуални младежи (§291, Unarmed, two separate targets fought in
//     sequence): Момче (Boy) End 12-8, Speed 1, Str 2, Reflex 2, Resil 2;
//     Момиче (Girl) End 8-6, Speed 2, Str 1, Reflex 2, Resil 1 - only the
//     Boy is seeded as the book_enemies row; switch to the Girl's numbers
//     by hand once the Boy falls.
//   - Андроидка убиец (§318): End 20-15, Speed 2, Str 2, Reflex 2, Resil 3,
//     Melee 5 (grafted claws) - the source explicitly lets the player pick
//     either Unarmed-combat or Melee-combat rules for this one; the sim
//     doesn't lock this choice, just pick whichever mode on the player
//     side.
//   - Спецгард на "Саурон" (§385, Melee, standard blades): End 15-6,
//     Speed 2, Acc 4, Reflex 2, Resil 3, Melee 4; blade Power/Speed not
//     printed, left at 0/0. This section's first wave (four basic
//     Gunfight-rules guards using human base stats from "Видово Сечение на
//     населението", End 15-6/Speed 2/Str 2/Acc 2/Reflex 2/Resil 2, each
//     with a different weapon) isn't seeded as its own row - reuse the
//     "Човек" base stats by hand for those four fights.
//   - Неизвестен противник (§396, Melee, standard blades): End 15-6,
//     Speed 3, Acc 3, Reflex 2, Resil 2, Melee 5.
//
// book_enemies column reuse (only 4 numeric columns exist; this book's
// shape needs far more than that): hp = Издръжливост (starting value); pb
// = critical Endurance threshold (reused - NOT a damage-dice count, unlike
// every other sim in this app); attack = the single most relevant "Skill"
// number for that encounter's stated combat type (melee/shooting/netrun/
// driving, whichever applies); defense = Устойчивост. Speed/Str/Acc/Reflex
// and all equipment Power/Speed/Weapon/Manoeuvrability values have no
// column at all - always re-entered by hand per fight from the notes above,
// same as the free-entry pattern already used for Armour in the Blood
// Sword sims.
//
// All state lives in pt.sim399, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const MODES = ['unarmed', 'melee', 'gunfight', 'cyber', 'vehicle'];

// Which combat mode each book_enemies row's OWN stats are meant to be used
// with (per the section text) - book_enemies has no column for this, so
// it's kept here purely as an autocomplete convenience. Does not touch the
// player's own mode field, since several of these fights are asymmetric
// (the player's mode is a separate choice made from reading the section).
const ENEMY_MODE = {
  'Гигантски гущер': 'unarmed',
  'Служителка на "Бионаги"': 'cyber',
  'Виртуален фехтовач': 'melee',
  'Киберчудовище': 'unarmed',
  'Киберпаяк': 'gunfight',
  'Виртуална котка-сънувач "Баст"': 'cyber',
  'Неизвестен корпоративен служител': 'unarmed',
  'Уличен дилър': 'unarmed',
  'Защитна програма': 'cyber',
  'Виртуални младежи (момче)': 'unarmed',
  'Андроидка убиец': 'melee',
  'Спецгард на "Саурон"': 'melee',
  'Неизвестен противник': 'melee',
};

function _emptySide() {
  return {
    mode: 'unarmed',
    speed: 0, str: 0, acc: 0, reflex: 0, resil: 0,
    skill: 0, power: 0, eqspeed: 0, weapon: 0, maneuver: 0,
    endurance: 0, enduranceInitial: 0, enduranceCritical: 0,
    critApplied: false,
  };
}

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim399) {
    pt.sim399 = {
      player: { ..._emptySide(), speed: 2, str: 2, acc: 2, reflex: 2, resil: 2, endurance: 15, enduranceInitial: 15, enduranceCritical: 6 },
      enemy: { ..._emptySide(), name: '' },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim399;
  for (const side of [d.player, d.enemy]) {
    const blank = _emptySide();
    for (const k of Object.keys(blank)) {
      if (side[k] === undefined) side[k] = blank[k];
    }
  }
  if (d.enemy.name === undefined) d.enemy.name = '';
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

// ── Combat math ──────────────────────────────────────────────────────────

function _orderVal(side) {
  const eq = side.mode === 'unarmed' ? 0 : side.eqspeed;
  return _roll1d6() + side.speed + eq;
}

function _attackSum(side) {
  switch (side.mode) {
    case 'unarmed':  return _roll1d6() + side.str;
    case 'melee':    return _roll1d6() + side.str + side.skill + side.power;
    case 'gunfight': return _roll1d6() + side.acc + side.skill + side.power;
    case 'cyber':    return _roll1d6() + side.acc + side.skill + side.power;
    case 'vehicle':  return _roll1d6() + side.acc + side.skill + side.power + side.weapon;
    default:         return _roll1d6();
  }
}

// Defence uses the ATTACKER's mode formula, applied to the DEFENDER's own stats.
function _defenceSum(attackerMode, defenderSide) {
  switch (attackerMode) {
    case 'unarmed':  return defenderSide.resil + defenderSide.reflex;
    case 'melee':    return defenderSide.resil + defenderSide.reflex + defenderSide.skill;
    case 'gunfight': return defenderSide.resil + defenderSide.reflex;
    case 'cyber':    return defenderSide.resil + defenderSide.reflex;
    case 'vehicle':  return defenderSide.resil + defenderSide.reflex + defenderSide.maneuver;
    default:         return defenderSide.resil + defenderSide.reflex;
  }
}

function _applyCritCheck(side) {
  if (!side.critApplied && side.enduranceCritical > 0 && side.endurance <= side.enduranceCritical) {
    side.critApplied = true;
    for (const k of ['speed', 'str', 'acc', 'reflex', 'resil', 'skill', 'power', 'eqspeed', 'weapon', 'maneuver']) {
      side[k] = Math.max(0, side[k] - 1);
    }
    return true;
  }
  return false;
}

function _battleOver(d) { return d.player.endurance <= 0 || (d.enemy.enduranceInitial > 0 && d.enemy.endurance <= 0); }

function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerEndurance: d.player.endurance, playerEnduranceMax: d.player.enduranceInitial,
    ts: Date.now(),
  });
}

function _applyEnemyDefeat(d) {
  if (d.enemy.enduranceInitial > 0 && d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim399.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _applyPlayerFall(d) {
  if (d.player.endurance <= 0) {
    _appendLog(d, t('battlesim399.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _strike(d, attackerKey) {
  const attacker = d[attackerKey];
  const defender = attackerKey === 'player' ? d.enemy : d.player;
  const attackerName = attackerKey === 'player' ? t('battlesim399.ui.you') : _enemyNameSafe(d);
  const defenderName = attackerKey === 'player' ? _enemyNameSafe(d) : t('battlesim399.ui.you');

  const atk = _attackSum(attacker);
  const def = _defenceSum(attacker.mode, defender);
  const raw = atk - def;

  if (raw >= 0) {
    defender.endurance = Math.max(0, defender.endurance - raw);
    _appendLog(d, t('battlesim399.log.hit', { attacker: attackerName, defender: defenderName, atk, def, n: raw, endurance: defender.endurance, enduranceMax: defender.enduranceInitial }));
    if (_applyCritCheck(defender)) {
      _appendLog(d, t('battlesim399.log.critical', { name: defenderName }));
    }
  } else {
    const back = -raw;
    attacker.endurance = Math.max(0, attacker.endurance - back);
    _appendLog(d, t('battlesim399.log.backlash', { attacker: attackerName, defender: defenderName, atk, def, n: back, endurance: attacker.endurance, enduranceMax: attacker.enduranceInitial }));
    if (_applyCritCheck(attacker)) {
      _appendLog(d, t('battlesim399.log.critical', { name: attackerName }));
    }
  }
}

function _attack() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  d.roundsThisBattle++;

  let playerOrder = _orderVal(d.player);
  let enemyOrder = _orderVal(d.enemy);
  let tieRerolls = 0;
  while (playerOrder === enemyOrder && tieRerolls < 20) {
    // "Ако изискваният от правилата на битката сбор е еднакъв за двамата
    // противници, хвърлянето се повтаря без никакви промени" - the book
    // says reroll on a tie, not default to a fixed winner.
    playerOrder = _orderVal(d.player);
    enemyOrder = _orderVal(d.enemy);
    tieRerolls++;
  }
  const first = playerOrder > enemyOrder ? 'player' : 'enemy';
  const second = first === 'player' ? 'enemy' : 'player';
  _appendLog(d, t('battlesim399.log.order', {
    first: first === 'player' ? t('battlesim399.ui.you') : _enemyNameSafe(d),
  }));

  _strike(d, first);
  let over = _applyEnemyDefeat(d) || _applyPlayerFall(d);
  if (!over) {
    _strike(d, second);
    over = _applyEnemyDefeat(d) || _applyPlayerFall(d);
  }

  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.endurance = d.enemy.enduranceInitial;
  d.enemy.critApplied = false;
  d.player.endurance = d.player.enduranceInitial;
  d.player.critApplied = false;
  d.roundsThisBattle = 0;
  if (d.log.length) _appendLog(d, t('battlesim399.log.reset_sep'));
  _appendLog(d, t('battlesim399.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim399.ui.endurance')}:${e.hp ?? '?'}</span></li>`
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

// ── Render ───────────────────────────────────────────────────────────────

function _setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

function _renderSide(prefix, side, skipNamePick) {
  _setVal(`${prefix}-mode`, side.mode);
  _setVal(`${prefix}-speed`, side.speed);
  _setVal(`${prefix}-str`, side.str);
  _setVal(`${prefix}-acc`, side.acc);
  _setVal(`${prefix}-reflex`, side.reflex);
  _setVal(`${prefix}-resil`, side.resil);
  _setVal(`${prefix}-skill`, side.skill);
  _setVal(`${prefix}-power`, side.power);
  _setVal(`${prefix}-eqspeed`, side.eqspeed);
  _setVal(`${prefix}-weapon`, side.weapon);
  _setVal(`${prefix}-maneuver`, side.maneuver);
  _setVal(`${prefix}-endurance`, side.endurance);
  _setVal(`${prefix}-endurancemax`, side.enduranceInitial);
  _setVal(`${prefix}-endurancecrit`, side.enduranceCritical);
  if (!skipNamePick && prefix === 'sim399-enemy') _setVal('sim399-enemy-pick', side.name || '');
}

function _renderInputs(skipEnemyPick) {
  const d = _data();
  if (!d) return;
  _renderSide('sim399-player', d.player, true);
  _renderSide('sim399-enemy', d.enemy, skipEnemyPick);

  const over = _battleOver(d);
  document.getElementById('sim399-attack').disabled = over;

  const status = document.getElementById('sim399-status');
  if (d.player.endurance <= 0) status.innerHTML = t('battlesim399.status.fallen', { skull: SVG_SKULL });
  else if (d.enemy.enduranceInitial > 0 && d.enemy.endurance <= 0) status.innerHTML = t('battlesim399.status.victory', { trophy: SVG_TROPHY });
  else status.innerHTML = '';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim399-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim399-history-summary');
  const listEl = document.getElementById('sim399-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim399.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim399.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim399.history.won') : t('battlesim399.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim399.ui.endurance')} ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim399() {
  const overlay = document.getElementById('sim399-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim399(); return; }
  _renderAll();
}

function openSim399() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim399-overlay').classList.add('active');
}

function closeSim399() {
  document.getElementById('sim399-overlay')?.classList.remove('active');
}

export function setSim399Visible(visible) {
  const btn = document.getElementById('sim399-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim399();
}

// ── Init ──────────────────────────────────────────────────────────────────

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

function _modeSelect(prefix) {
  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${t('battlesim399.ui.mode')}</span>
      <select id="${prefix}-mode" class="inv-edit-input">
        <option value="unarmed">${t('battlesim399.ui.mode_unarmed')}</option>
        <option value="melee">${t('battlesim399.ui.mode_melee')}</option>
        <option value="gunfight">${t('battlesim399.ui.mode_gunfight')}</option>
        <option value="cyber">${t('battlesim399.ui.mode_cyber')}</option>
        <option value="vehicle">${t('battlesim399.ui.mode_vehicle')}</option>
      </select>
    </div>`;
}

function _sideFields(prefix) {
  return `
    ${_modeSelect(prefix)}
    ${_numField(t('battlesim399.ui.speed'), `${prefix}-speed`)}
    ${_numField(t('battlesim399.ui.str'), `${prefix}-str`)}
    ${_numField(t('battlesim399.ui.acc'), `${prefix}-acc`)}
    ${_numField(t('battlesim399.ui.reflex'), `${prefix}-reflex`)}
    ${_numField(t('battlesim399.ui.resil'), `${prefix}-resil`)}
    ${_numField(t('battlesim399.ui.skill'), `${prefix}-skill`)}
    ${_numField(t('battlesim399.ui.power'), `${prefix}-power`)}
    ${_numField(t('battlesim399.ui.eqspeed'), `${prefix}-eqspeed`)}
    ${_numField(t('battlesim399.ui.weapon'), `${prefix}-weapon`)}
    ${_numField(t('battlesim399.ui.maneuver'), `${prefix}-maneuver`)}
    ${_numField(t('battlesim399.ui.endurance'), `${prefix}-endurance`)}
    ${_numField(t('battlesim399.ui.endurance_initial'), `${prefix}-endurancemax`)}
    ${_numField(t('battlesim399.ui.endurance_crit'), `${prefix}-endurancecrit`)}`;
}

export function initSim399() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim399-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim399.ui.title')}</span>
        <button id="sim399-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim399.ui.you')}</div>
            ${_sideFields('sim399-player')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim399.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim399.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim399-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim399-enemy-pick-dropdown">
                <ul id="sim399-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_sideFields('sim399-enemy')}
          </div>
          <div id="sim399-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim399-attack" class="inv-add-btn bsim-action-primary">${t('battlesim399.btn.attack')}</button>
            <button id="sim399-reset" class="inv-add-btn">${t('battlesim399.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim399-history-summary">${t('battlesim399.history.summary', { n: 0 })}</summary>
            <div id="sim399-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim399-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim399-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim399);
  document.getElementById('sim399-close').addEventListener('click', closeSim399);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim399(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim399-overlay'),
    open:  openSim399,
    close: closeSim399,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim399();
  });

  document.getElementById('sim399-attack').addEventListener('click', _attack);
  document.getElementById('sim399-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim399-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim399-enemy-pick', 'sim399-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name              = enemy.name;
    d.enemy.mode              = ENEMY_MODE[enemy.name] || d.enemy.mode;
    d.enemy.skill             = enemy.attack ?? 0;
    d.enemy.resil             = enemy.defense ?? 0;
    d.enemy.endurance         = enemy.hp ?? 0;
    d.enemy.enduranceInitial  = enemy.hp ?? 0;
    d.enemy.enduranceCritical = enemy.pb ?? 0;
    d.enemy.critApplied       = false;
    d.roundsThisBattle        = 0;
    saveState();
    _renderAll();
  });

  const fieldMap = {};
  for (const prefix of ['sim399-player', 'sim399-enemy']) {
    const side = prefix === 'sim399-player' ? 'player' : 'enemy';
    fieldMap[`${prefix}-speed`] = [side, 'speed'];
    fieldMap[`${prefix}-str`] = [side, 'str'];
    fieldMap[`${prefix}-acc`] = [side, 'acc'];
    fieldMap[`${prefix}-reflex`] = [side, 'reflex'];
    fieldMap[`${prefix}-resil`] = [side, 'resil'];
    fieldMap[`${prefix}-skill`] = [side, 'skill'];
    fieldMap[`${prefix}-power`] = [side, 'power'];
    fieldMap[`${prefix}-eqspeed`] = [side, 'eqspeed'];
    fieldMap[`${prefix}-weapon`] = [side, 'weapon'];
    fieldMap[`${prefix}-maneuver`] = [side, 'maneuver'];
    fieldMap[`${prefix}-endurance`] = [side, 'endurance'];
    fieldMap[`${prefix}-endurancemax`] = [side, 'enduranceInitial'];
    fieldMap[`${prefix}-endurancecrit`] = [side, 'enduranceCritical'];
  }
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
  for (const prefix of ['sim399-player', 'sim399-enemy']) {
    const side = prefix === 'sim399-player' ? 'player' : 'enemy';
    document.getElementById(`${prefix}-mode`).addEventListener('change', e => {
      const d = _data();
      if (!d) return;
      d[side].mode = e.target.value;
      saveState();
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
