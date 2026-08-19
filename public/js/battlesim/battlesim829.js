// ── Battle Simulator (Пътят на пъдпъдъка, book 829) ─────────────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 829 only) by the caller in boot.js via
// setBattleSimVisible().
// To remove: delete this file, remove its import line and initBattleSim()/
// setBattleSimVisible() calls from boot.js, and remove the .bsim-* CSS.
//
// Equipment/inventory are read-only inputs here (pt.equipment / pt.inventory)
// - this module never writes back to them. All sim-specific state lives in
// pt.sim829, which is already per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=14';
import { showAlert } from '../confirm.js?v=6';
import { getPlayBtnRow } from '../charsheet.js?v=106';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=89';
import { t } from '../i18n.js?v=73';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;


// Labels live in i18n.js under battlesim829.type.<key>.
function _rangedTypeLabel(key) { return t(`battlesim829.type.${key}`) || key; }

const BASE_HP_MAX = 12;
const ENDURANCE_HP_BONUS = 3;
const THROWING_ACCURACY_BONUS = 1;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim829) {
    // Seed А/З from equipped weapon/armor as a starting point - like an
    // enemy autocomplete fill, the fields stay fully editable afterward.
    const { baseA, baseD } = _equipmentBaseStats(pt);
    pt.sim829 = {
      player: {
        a: baseA, d: baseD, hp: 12, hpMax: 12,
        skills: { weapon: 0, parry: 0, endurance: false, archery: 0, throwing: false },
        ranged: { weaponKey: '', type: 'bow', attempts: 0, magicT: 0, magicDmg: 0 },
      },
      enemy:  { name: '', a: 0, d: 0, hp: 12, hpMax: 12, pb: 0 },
      log: [],
      history: [],
    };
  }
  if (!pt.sim829.history) pt.sim829.history = [];
  if (pt.sim829.enemy.pb === undefined) pt.sim829.enemy.pb = 0;
  if (pt.sim829.player.hp === undefined) pt.sim829.player.hp = 12;
  if (!pt.sim829.player.skills) {
    pt.sim829.player.skills = { weapon: 0, parry: 0, endurance: false, archery: 0, throwing: false };
  }
  if (!pt.sim829.player.ranged) {
    pt.sim829.player.ranged = { weaponKey: '', type: 'bow', attempts: 0, magicT: 0, magicDmg: 0 };
  }
  return pt.sim829;
}

function _roll() { return 1 + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || 'врагът'; }
// Escaped variant for log lines, which get dumped into innerHTML in
// _renderLog() - the enemy name is free-text player input, so an unescaped
// "<img src=x onerror=...>" would execute. _recordOutcome()'s history.enemy
// deliberately stays unescaped - _renderHistory() already escapes it once at
// render time, and escaping here too would double-escape it there.
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

// ── Equipment-derived base stats ────────────────────────────────────────────
// pt.equipment[slot] = { itemId, label, note, qty } where note is free text
// like "А: 2, З: 0" (melee) or "Т: 4, А: 2" (ranged). Base attack comes from
// the main weapon (primary slot); base defense is the sum of "З:" values
// across every equipped slot (armor + weapon).
const RE_STAT_A = /А\s*:\s*(-?\d+)/;
const RE_STAT_D = /З\s*:\s*(-?\d+)/;
const RE_STAT_T = /Т\s*:\s*(-?\d+)/;

function _entryNote(entry) {
  return (entry && typeof entry === 'object') ? (entry.note || '') : '';
}
function _entryLabel(entry) {
  return (entry && typeof entry === 'object') ? (entry.label || '?') : '?';
}
function _entryQty(entry) {
  return (entry && typeof entry === 'object' && entry.qty != null) ? entry.qty : 1;
}
function _statFromNote(note, re) {
  const m = String(note || '').match(re);
  return m ? parseInt(m[1], 10) : 0;
}

function _equipmentBaseStats(pt) {
  const eq = pt.equipment || {};
  const baseA = _statFromNote(_entryNote(eq.primary), RE_STAT_A);
  let baseD = 0;
  for (const key of Object.keys(eq)) {
    baseD += _statFromNote(_entryNote(eq[key]), RE_STAT_D);
  }
  return { baseA, baseD };
}

// Re-derive one stat from equipment + the matching skill, overwriting any
// manual edit - mirrors how picking an enemy from the dropdown overwrites
// its fields. Triggered when the relevant skill changes, or via the
// "От екипировка" button for all three at once.
function _syncStatFromEquipment(d, pt, stat) {
  const { baseA, baseD } = _equipmentBaseStats(pt);
  if (stat === 'a') d.player.a = baseA + (d.player.skills.weapon || 0);
  if (stat === 'd') d.player.d = baseD + (d.player.skills.parry  || 0);
  if (stat === 'hpMax') {
    d.player.hpMax = BASE_HP_MAX + (d.player.skills.endurance ? ENDURANCE_HP_BONUS : 0);
    d.player.hp = Math.min(d.player.hp, d.player.hpMax);
  }
}

// ── Ranged weapons ───────────────────────────────────────────────────────
// Any equipped item or inventory item whose note contains "Т:" is a ranged
// weapon option (bows, muskets, throwing spears/shurikens, etc).
function _rangedWeaponOptions(pt) {
  const out = [];
  const eq = pt.equipment || {};
  for (const slot of Object.keys(eq)) {
    const entry = eq[slot];
    const note  = _entryNote(entry);
    if (!RE_STAT_T.test(note)) continue;
    out.push({
      key: 'eq:' + slot,
      label: _entryLabel(entry),
      t: _statFromNote(note, RE_STAT_T),
      a: _statFromNote(note, RE_STAT_A),
      qty: _entryQty(entry),
    });
  }
  (pt.inventory || []).forEach((it, i) => {
    const note = it?.note || '';
    if (!RE_STAT_T.test(note)) return;
    out.push({
      key: 'inv:' + i,
      label: it.label || '?',
      t: _statFromNote(note, RE_STAT_T),
      a: _statFromNote(note, RE_STAT_A),
      qty: it.qty != null ? it.qty : 1,
    });
  });
  return out;
}

// Accuracy (Т) and damage formulas per book 829 rules.
function _rangedAccuracy(d, weapon) {
  const r = d.player.ranged;
  switch (r.type) {
    case 'bow':      return (weapon?.t || 0) + (d.player.skills.archery >= 1 ? 1 : 0);
    case 'musket':   return 4;
    case 'spear':
    case 'shuriken': return (weapon?.t || 0) + (d.player.skills.throwing ? THROWING_ACCURACY_BONUS : 0);
    case 'magic':    return r.magicT || 0;
    default:         return 0;
  }
}
function _rangedDamage(d, weapon, roll) {
  const r  = d.player.ranged;
  const pb = d.enemy.pb || 0;
  switch (r.type) {
    case 'bow':      return Math.max(0, (weapon?.a || 0) + (d.player.skills.archery >= 2 ? 2 : 0) - pb);
    case 'musket':   return Math.max(0, 6 - pb);
    case 'spear':    return 2;
    case 'shuriken': return roll;
    case 'magic':    return r.magicDmg || 0;
    default:         return 0;
  }
}
function _rangedDamageDisplay(d, weapon) {
  return d.player.ranged.type === 'shuriken' ? t('battlesim829.ranged.dmg_shuriken') : String(_rangedDamage(d, weapon, 0));
}

// Map a stepper's data-group to its target object - 'ranged' lives nested
// under player.ranged, everything else is a top-level sim829 group.
function _getGroupObj(d, group) {
  return group === 'ranged' ? d.player.ranged : d[group];
}

// Per-run record of a finished battle's outcome - kept separate from the
// rolling round-by-round log, which only covers the current battle.
// Uncapped (was previously trimmed to the last 100) - the admin dashboard
// aggregates battle counts app-wide from this array, so per-user history needs
// to be a true lifetime total, not a rolling window.
function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d),
    outcome, // 'win' | 'loss'
    enemyA: d.enemy.a, enemyD: d.enemy.d, enemyHpMax: d.enemy.hpMax, enemyPb: d.enemy.pb,
    playerHp: d.player.hp, playerHpMax: d.player.hpMax,
    ts: Date.now(),
  });
}

function _renderHistory() {
  const d         = _data();
  const summaryEl = document.getElementById('bsim-history-summary');
  const listEl    = document.getElementById('bsim-history-list');
  if (!d || !summaryEl || !listEl) return;
  const hist = d.history;
  summaryEl.textContent = t('battlesim829.history.summary', { n: hist.length });
  if (!hist.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim829.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = hist.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim829.history.won') : t('battlesim829.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">ТЖ ${h.playerHp}/${h.playerHpMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('bsim-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _updateStatus() {
  const d  = _data();
  const pt = currentPlaythrough();
  const el = document.getElementById('bsim-status');
  if (!d || !pt || !el) return;
  if (d.player.hp <= 0)      el.innerHTML = `${SVG_SKULL} ${t('battlesim829.status.fallen')}`;
  else if (d.enemy.hp <= 0)  el.innerHTML = `${SVG_TROPHY} ${t('battlesim829.status.victory')}`;
  else                       el.innerHTML = '';
  const over = d.player.hp <= 0 || d.enemy.hp <= 0;
  document.getElementById('bsim-round').disabled = over;
  document.getElementById('bsim-heal').disabled  = over;

  const r        = d.player.ranged;
  const weapons  = _rangedWeaponOptions(pt);
  const weapon   = weapons.find(w => w.key === r.weaponKey);
  const noWeapon = r.type !== 'magic' && !weapon;
  document.getElementById('bsim-ranged-attack').disabled = over || r.attempts <= 0 || noWeapon;
}

function _renderRangedPanel(d, pt) {
  const weapons = _rangedWeaponOptions(pt);
  const sel = document.getElementById('bsim-ranged-weapon');
  if (sel) {
    sel.innerHTML = weapons.length
      ? weapons.map(w => `<option value="${escapeHtml(w.key)}">${escapeHtml(w.label)} (Т:${w.t}${w.a ? ', А:' + w.a : ''}) ×${w.qty}</option>`).join('')
      : `<option value="">${t('battlesim829.ranged.no_weapons')}</option>`;
    if (weapons.some(w => w.key === d.player.ranged.weaponKey)) {
      sel.value = d.player.ranged.weaponKey;
    } else if (weapons.length) {
      d.player.ranged.weaponKey = weapons[0].key;
      sel.value = weapons[0].key;
    } else {
      d.player.ranged.weaponKey = '';
    }
  }

  const typeSel = document.getElementById('bsim-ranged-type');
  if (typeSel) typeSel.value = d.player.ranged.type;

  const magicRow = document.getElementById('bsim-ranged-magic-row');
  if (magicRow) magicRow.style.display = d.player.ranged.type === 'magic' ? 'flex' : 'none';

  const weapon = weapons.find(w => w.key === d.player.ranged.weaponKey);
  const acc        = _rangedAccuracy(d, weapon);
  const dmgDisplay = _rangedDamageDisplay(d, weapon);
  const infoEl = document.getElementById('bsim-ranged-info');
  if (infoEl) infoEl.textContent = t('battlesim829.ranged.info', { acc, dmg: dmgDisplay });
}

function _renderInputs() {
  const d  = _data();
  const pt = currentPlaythrough();
  if (!d || !pt) return;

  document.getElementById('bsim-player-a').value      = d.player.a;
  document.getElementById('bsim-player-d').value      = d.player.d;
  document.getElementById('bsim-player-hp').value     = Math.min(d.player.hp, d.player.hpMax);
  document.getElementById('bsim-player-hpmax').value  = d.player.hpMax;
  document.getElementById('bsim-enemy-pick').value  = d.enemy.name;
  document.getElementById('bsim-enemy-a').value     = d.enemy.a;
  document.getElementById('bsim-enemy-d').value     = d.enemy.d;
  document.getElementById('bsim-enemy-hp').value    = d.enemy.hp;
  document.getElementById('bsim-enemy-hpmax').value = d.enemy.hpMax;
  document.getElementById('bsim-enemy-pb').value    = d.enemy.pb;

  document.getElementById('bsim-skill-weapon').value      = d.player.skills.weapon;
  document.getElementById('bsim-skill-parry').value       = d.player.skills.parry;
  document.getElementById('bsim-skill-endurance').checked = d.player.skills.endurance;
  document.getElementById('bsim-skill-archery').value     = d.player.skills.archery;
  document.getElementById('bsim-skill-throwing').checked  = d.player.skills.throwing;

  document.getElementById('bsim-ranged-attempts').value  = d.player.ranged.attempts;
  document.getElementById('bsim-ranged-magic-t').value   = d.player.ranged.magicT;
  document.getElementById('bsim-ranged-magic-dmg').value = d.player.ranged.magicDmg;

  _renderRangedPanel(d, pt);
  _updateStatus();
}

function _enemyAttack(d) {
  const eRoll  = _roll();
  const eTotal = d.enemy.a + eRoll;
  if (eTotal > d.player.d) {
    const dmg = eTotal - d.player.d;
    d.player.hp = Math.max(0, d.player.hp - dmg);
    _appendLog(d, t('battlesim829.log.enemy_hit', { enemy: _enemyNameSafe(d), roll: eRoll, a: d.enemy.a, total: eTotal, def: d.player.d, dmg, hp: d.player.hp, hpMax: d.player.hpMax }));
  } else {
    _appendLog(d, t('battlesim829.log.enemy_miss', { enemy: _enemyNameSafe(d), roll: eRoll, a: d.enemy.a, total: eTotal, def: d.player.d }));
  }
  if (d.player.hp <= 0) {
    _appendLog(d, `${SVG_SKULL} ${t('battlesim829.log.player_fallen')}`);
    _recordOutcome(d, 'loss');
  }
}

function _runRound() {
  const d = _data();
  if (!d || d.player.hp <= 0 || d.enemy.hp <= 0) return;

  const pRoll  = _roll();
  const pTotal = d.player.a + pRoll;
  if (pTotal > d.enemy.d) {
    const dmg = pTotal - d.enemy.d;
    d.enemy.hp = Math.max(0, d.enemy.hp - dmg);
    _appendLog(d, t('battlesim829.log.player_hit', { roll: pRoll, a: d.player.a, total: pTotal, def: d.enemy.d, enemy: _enemyNameSafe(d), dmg, hp: d.enemy.hp, hpMax: d.enemy.hpMax }));
  } else {
    _appendLog(d, t('battlesim829.log.player_miss', { roll: pRoll, a: d.player.a, total: pTotal, def: d.enemy.d, enemy: _enemyNameSafe(d) }));
  }

  if (d.enemy.hp <= 0) {
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim829.log.enemy_defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  } else {
    _enemyAttack(d);
  }

  saveState();
  _renderInputs();
  _renderLog();
  _renderHistory();
}

function _heal() {
  const d = _data();
  if (!d || d.player.hp <= 0 || d.enemy.hp <= 0) return;
  const amount = Number(document.getElementById('bsim-heal-amount').value) || 0;
  if (amount <= 0) return;

  const before = d.player.hp;
  d.player.hp = Math.min(d.player.hpMax, d.player.hp + amount);
  _appendLog(d, t('battlesim829.log.heal', { before, hp: d.player.hp, hpMax: d.player.hpMax }));

  _enemyAttack(d);

  saveState();
  _renderInputs();
  _renderLog();
  _renderHistory();
}

// Resolve one ranged attack: roll, compare to accuracy (Т), apply damage if
// hit. No counter-attack - ranged attacks happen before the enemy closes in.
function _rangedAttack() {
  const d  = _data();
  const pt = currentPlaythrough();
  if (!d || !pt || d.player.hp <= 0 || d.enemy.hp <= 0) return;
  const r = d.player.ranged;
  if (r.attempts <= 0) return;

  const weapons = _rangedWeaponOptions(pt);
  const weapon  = weapons.find(w => w.key === r.weaponKey);
  if (r.type !== 'magic' && !weapon) return;

  const acc  = _rangedAccuracy(d, weapon);
  const roll = _roll();
  r.attempts--;

  const typeLabel = _rangedTypeLabel(r.type);
  if (roll <= acc) {
    const dmg = Math.max(0, _rangedDamage(d, weapon, roll));
    d.enemy.hp = Math.max(0, d.enemy.hp - dmg);
    _appendLog(d, t('battlesim829.log.ranged_hit', { type: typeLabel, roll, acc, dmg, enemy: _enemyNameSafe(d), hp: d.enemy.hp, hpMax: d.enemy.hpMax }));
  } else {
    _appendLog(d, t('battlesim829.log.ranged_miss', { type: typeLabel, roll, acc }));
  }

  if (d.enemy.hp <= 0) {
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim829.log.enemy_defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  }

  saveState();
  _renderInputs();
  _renderLog();
  _renderHistory();
}

function _flee() {
  const d = _data();
  if (!d) return;
  const roll = _roll();
  _appendLog(d, t('battlesim829.log.flee', { roll }));
  saveState();
  _renderLog();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.hp  = d.enemy.hpMax;
  d.player.hp = d.player.hpMax;
  if (d.log.length) _appendLog(d, t('battlesim829.log.reset_sep'));
  _appendLog(d, t('battlesim829.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderBattleSim() {
  const overlay = document.getElementById('bsim-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeBattleSim(); return; }
  _renderInputs();
  _renderLog();
  _renderHistory();
}

function openBattleSim() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderInputs();
  _renderLog();
  _renderHistory();
  document.getElementById('bsim-overlay').classList.add('active');
}

function closeBattleSim() {
  document.getElementById('bsim-overlay')?.classList.remove('active');
}

export function setBattleSimVisible(visible) {
  const btn = document.getElementById('battlesim-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeBattleSim();
}

// Build one stat row using the same .inv-edit-row / .inv-qty-* pattern as
// the inventory item-edit popover, bound to pt.sim829[group][key]
// (group 'ranged' resolves to pt.sim829.player.ranged - see _getGroupObj).
function _statField(label, id, group, key) {
  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <div class="inv-qty-wrap">
        <button class="inv-qty-btn" data-id="${id}" data-group="${group}" data-key="${key}" data-delta="-1">−</button>
        <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric" data-group="${group}" data-key="${key}">
        <button class="inv-qty-btn" data-id="${id}" data-group="${group}" data-key="${key}" data-delta="1">+</button>
      </div>
    </div>`;
}

function _selectField(label, id, options) {
  const opts = options.map(([v, t]) => `<option value="${v}">${escapeHtml(t)}</option>`).join('');
  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <select id="${id}" class="inv-edit-input bsim-select">${opts}</select>
    </div>`;
}

function _checkField(label, id, note) {
  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <input id="${id}" type="checkbox" class="inv-edit-check">
      <label for="${id}" class="inv-edit-check-label">${escapeHtml(note)}</label>
    </div>`;
}

function _enemyNameField() {
  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${t('battlesim829.ui.pick_enemy')}</span>
      <div class="autocomplete-wrap bsim-enemy-ac">
        <input id="bsim-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="bsim-enemy-pick-dropdown">
        <ul id="bsim-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
      </div>
    </div>`;
}

// Reference enemy stat blocks for this book, loaded once from
// /api/books/:id/enemies and cached for the autocomplete dropdown.
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

function _enemyStatLabel(e) {
  const v = x => x == null ? '?' : x;
  return `А:${v(e.attack)} ТЖ:${v(e.hp)} З:${v(e.defense)} ПБ:${v(e.pb)}`;
}

function _setupEnemyAutocomplete() {
  const input    = document.getElementById('bsim-enemy-pick');
  const dropdown = document.getElementById('bsim-enemy-pick-dropdown');
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
      `<li role="option" id="bsim-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${escapeHtml(_enemyStatLabel(e))}</span></li>`
    ).join('');
    activeIdx = -1;
    dropdown.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
  }

  function select(enemy) {
    const d = _data();
    if (!d || !enemy) return;
    input.value = enemy.name;
    d.enemy.name = enemy.name;
    if (enemy.attack  != null) d.enemy.a = enemy.attack;
    if (enemy.defense != null) d.enemy.d = enemy.defense;
    if (enemy.hp != null) { d.enemy.hp = enemy.hp; d.enemy.hpMax = enemy.hp; }
    if (enemy.pb != null) d.enemy.pb = enemy.pb;
    closeDropdown();
    saveState();
    _renderInputs();
  }

  dropdown.addEventListener('mousedown', e => {
    const li = e.target.closest('li');
    if (!li) return;
    select(matches[+li.dataset.idx]);
    e.preventDefault();
  });

  input.addEventListener('focus', async () => {
    input.removeAttribute('readonly');
    await _loadEnemyList();
    render(input.value);
  });
  input.addEventListener('input', async () => {
    await _loadEnemyList();
    render(input.value);
  });
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

export function initBattleSim() {
  const overlay = document.createElement('div');
  overlay.id        = 'bsim-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim829.ui.title')}</span>
        <button id="bsim-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">
              <span>${t('battlesim829.ui.you')}</span>
              <button id="bsim-sync-equip" class="bsim-sync-btn" type="button" data-tooltip="${t('battlesim829.ui.sync_equip_tooltip')}">${t('battlesim829.ui.sync_equip')}</button>
            </div>
            ${_statField(t('battlesim829.ui.attack'),   'bsim-player-a',     'player', 'a')}
            ${_statField(t('battlesim829.ui.defense'),  'bsim-player-d',     'player', 'd')}
            ${_statField(t('battlesim829.ui.life'),     'bsim-player-hp',    'player', 'hp')}
            ${_statField(t('battlesim829.ui.life_max'), 'bsim-player-hpmax', 'player', 'hpMax')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim829.ui.skills')}</div>
            ${_selectField(t('battlesim829.ui.skill_weapon'), 'bsim-skill-weapon', [
              [0, t('battlesim829.skill_weapon.0')], [1, t('battlesim829.skill_weapon.1')], [2, t('battlesim829.skill_weapon.2')], [3, t('battlesim829.skill_weapon.3')],
            ])}
            ${_selectField(t('battlesim829.ui.skill_parry'), 'bsim-skill-parry', [
              [0, t('battlesim829.skill_parry.0')], [1, t('battlesim829.skill_parry.1')], [2, t('battlesim829.skill_parry.2')],
            ])}
            ${_checkField(t('battlesim829.ui.endurance'), 'bsim-skill-endurance', t('battlesim829.ui.endurance_note', { base: BASE_HP_MAX, total: BASE_HP_MAX + ENDURANCE_HP_BONUS }))}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim829.ui.enemy')}</div>
            ${_enemyNameField()}
            ${_statField(t('battlesim829.ui.attack'),   'bsim-enemy-a',     'enemy', 'a')}
            ${_statField(t('battlesim829.ui.defense'),  'bsim-enemy-d',     'enemy', 'd')}
            ${_statField(t('battlesim829.ui.life'),     'bsim-enemy-hp',    'enemy', 'hp')}
            ${_statField(t('battlesim829.ui.life_max'), 'bsim-enemy-hpmax', 'enemy', 'hpMax')}
            ${_statField(t('battlesim829.ui.enemy_pb'), 'bsim-enemy-pb',   'enemy', 'pb')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim829.ui.ranged_combat')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim829.ui.weapon')}</span>
              <select id="bsim-ranged-weapon" class="inv-edit-input bsim-select"></select>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim829.ui.type')}</span>
              <select id="bsim-ranged-type" class="inv-edit-input bsim-select">
                <option value="bow">${t('battlesim829.type.bow')}</option>
                <option value="musket">${t('battlesim829.type.musket')}</option>
                <option value="spear">${t('battlesim829.type.spear')}</option>
                <option value="shuriken">${t('battlesim829.type.shuriken')}</option>
                <option value="magic">${t('battlesim829.type.magic')}</option>
              </select>
            </div>
            ${_selectField(t('battlesim829.ui.skill_archery'), 'bsim-skill-archery', [
              [0, t('battlesim829.skill_archery.0')], [1, t('battlesim829.skill_archery.1')], [2, t('battlesim829.skill_archery.2')],
            ])}
            ${_checkField(t('battlesim829.ui.skill_throwing'), 'bsim-skill-throwing', t('battlesim829.ui.throwing_note', { n: THROWING_ACCURACY_BONUS }))}
            <div id="bsim-ranged-magic-row" class="bsim-ranged-magic-row">
              ${_statField(t('battlesim829.ui.magic_t'),   'bsim-ranged-magic-t',   'ranged', 'magicT')}
              ${_statField(t('battlesim829.ui.magic_dmg'), 'bsim-ranged-magic-dmg', 'ranged', 'magicDmg')}
            </div>
            <div id="bsim-ranged-info" class="bsim-ranged-info"></div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim829.ui.attempts')}</span>
              <div class="inv-qty-wrap">
                <button class="inv-qty-btn" data-id="bsim-ranged-attempts" data-group="ranged" data-key="attempts" data-delta="-1">−</button>
                <input id="bsim-ranged-attempts" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric" data-group="ranged" data-key="attempts">
                <button class="inv-qty-btn" data-id="bsim-ranged-attempts" data-group="ranged" data-key="attempts" data-delta="1">+</button>
              </div>
              <button id="bsim-ranged-attack" class="inv-edit-done bsim-ranged-attack-btn">${t('battlesim829.btn.ranged_attack')}</button>
            </div>
          </div>
          <div id="bsim-status" class="bsim-status"></div>
          <div class="inv-edit-row bsim-heal-row">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim829.ui.heal')}</span>
            <div class="inv-qty-wrap">
              <button class="inv-qty-btn" data-id="bsim-heal-amount" data-delta="-1" data-min="1">−</button>
              <input id="bsim-heal-amount" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric" value="1">
              <button class="inv-qty-btn" data-id="bsim-heal-amount" data-delta="1" data-min="1">+</button>
            </div>
            <button id="bsim-heal" class="inv-edit-done bsim-heal-btn">${t('battlesim829.btn.heal')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="bsim-round" class="inv-add-btn bsim-action-primary">${t('battlesim829.btn.round')}</button>
            <button id="bsim-flee" class="inv-add-btn">${t('battlesim829.btn.flee')}</button>
            <button id="bsim-reset" class="inv-add-btn">${t('battlesim829.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="bsim-history-summary">${t('battlesim829.history.summary', { n: 0 })}</summary>
            <div id="bsim-history-list" class="bsim-history-list"></div>
          </details>
          <div id="bsim-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'battlesim-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openBattleSim);
  document.getElementById('bsim-close').addEventListener('click', closeBattleSim);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeBattleSim(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'bsim-overlay'),
    open:  openBattleSim,
    close: closeBattleSim,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeBattleSim();
  });

  document.getElementById('bsim-round').addEventListener('click', _runRound);
  document.getElementById('bsim-heal').addEventListener('click', _heal);
  document.getElementById('bsim-flee').addEventListener('click', _flee);
  document.getElementById('bsim-reset').addEventListener('click', _resetBattle);
  document.getElementById('bsim-ranged-attack').addEventListener('click', _rangedAttack);

  // Stat steppers - read group/key off the input itself. player.hp is
  // clamped to player.hpMax; raising/lowering player.hpMax re-clamps hp.
  overlay.querySelectorAll('.inv-qty-input[data-group]').forEach(input => {
    input.addEventListener('input', () => {
      // type="text" (needed to avoid native number-input spinner/scroll-wheel quirks,
      // see charsheet.js) accepts any keystroke - filter live so garbage can't be typed.
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      const d = _data();
      if (!d) return;
      let val = Math.max(0, Number(raw) || 0);
      if (input.dataset.group === 'player' && input.dataset.key === 'hp') {
        val = Math.min(val, d.player.hpMax);
      }
      _getGroupObj(d, input.dataset.group)[input.dataset.key] = val;
      if (input.dataset.group === 'player' && input.dataset.key === 'hpMax') {
        d.player.hp = Math.min(d.player.hp, val);
      }
      saveState();
      _renderInputs();
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-group]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      const d = _data();
      if (!d || !input) return;
      let next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
      if (btnEl.dataset.group === 'player' && btnEl.dataset.key === 'hp') {
        next = Math.min(next, d.player.hpMax);
      }
      _getGroupObj(d, btnEl.dataset.group)[btnEl.dataset.key] = next;
      if (btnEl.dataset.group === 'player' && btnEl.dataset.key === 'hpMax') {
        d.player.hp = Math.min(d.player.hp, next);
      }
      saveState();
      _renderInputs();
    });
  });

  // Heal-amount stepper (min 1, not tied to sim829 data)
  overlay.querySelectorAll('.inv-qty-btn:not([data-group])').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input) return;
      const min  = Number(btnEl.dataset.min) || 0;
      const next = Math.max(min, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
      input.value = next;
    });
  });
  document.getElementById('bsim-heal-amount').addEventListener('input', e => {
    const raw = String(e.target.value).replace(/[^0-9]/g, '');
    if (raw !== e.target.value) e.target.value = raw;
  });

  document.getElementById('bsim-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  // "От екипировка" - recompute А/З/Максимум ТЖ from current equipment +
  // skills, overwriting whatever's in the fields (like re-picking an enemy).
  document.getElementById('bsim-sync-equip').addEventListener('click', () => {
    const d  = _data();
    const pt = currentPlaythrough();
    if (!d || !pt) return;
    _syncStatFromEquipment(d, pt, 'a');
    _syncStatFromEquipment(d, pt, 'd');
    _syncStatFromEquipment(d, pt, 'hpMax');
    saveState();
    _renderInputs();
  });

  // Skill toggles - each one re-syncs only its own stat from equipment, so
  // manual edits to the other stats aren't disturbed.
  document.getElementById('bsim-skill-weapon').addEventListener('change', e => {
    const d  = _data();
    const pt = currentPlaythrough();
    if (!d || !pt) return;
    d.player.skills.weapon = Number(e.target.value) || 0;
    _syncStatFromEquipment(d, pt, 'a');
    saveState();
    _renderInputs();
  });
  document.getElementById('bsim-skill-parry').addEventListener('change', e => {
    const d  = _data();
    const pt = currentPlaythrough();
    if (!d || !pt) return;
    d.player.skills.parry = Number(e.target.value) || 0;
    _syncStatFromEquipment(d, pt, 'd');
    saveState();
    _renderInputs();
  });
  document.getElementById('bsim-skill-endurance').addEventListener('change', e => {
    const d  = _data();
    const pt = currentPlaythrough();
    if (!d || !pt) return;
    d.player.skills.endurance = e.target.checked;
    _syncStatFromEquipment(d, pt, 'hpMax');
    saveState();
    _renderInputs();
  });

  // Ranged combat controls
  document.getElementById('bsim-skill-archery').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.skills.archery = Number(e.target.value) || 0;
    saveState();
    _renderInputs();
  });
  document.getElementById('bsim-skill-throwing').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.skills.throwing = e.target.checked;
    saveState();
    _renderInputs();
  });
  document.getElementById('bsim-ranged-weapon').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.ranged.weaponKey = e.target.value;
    saveState();
    _renderInputs();
  });
  document.getElementById('bsim-ranged-type').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.ranged.type = e.target.value;
    saveState();
    _renderInputs();
  });

  _setupEnemyAutocomplete();
}
