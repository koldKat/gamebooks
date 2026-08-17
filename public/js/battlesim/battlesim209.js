// ── Battle Simulator (Freeway Fighter, book 209) ─────────────────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 209 only) by the caller in boot.js via
// setSim209Visible().
// To remove: delete this file, remove its import line and initSim209()/
// setSim209Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js modules, so only remove it if all of them are gone).
//
// Three separate combat types, all using the same opposed 2d6+SKILL(or
// FIREPOWER) Attack Round as every other Fighting Fantasy book, but differing
// in damage and win condition:
// - Hand Fighting: fixed damage per hit (book default 1, but weapons often
//   override it per-section - "your knife and the thug's crowbar reduce
//   STAMINA by 2 points" - so it's an editable field, not hardcoded).
//   Ends when either side has lost 6 cumulative STAMINA this fight (knocked
//   out) OR reaches 0 STAMINA (dead) - the *only* combat type with this dual
//   win condition, tracked via playerHandLoss/enemyHandLoss, reset per battle.
// - Shooting: 1d6 damage per hit, ends at 0 STAMINA (death). No KO threshold.
// - Vehicle Combat: 1d6 damage to ARMOUR per hit, ends at 0 ARMOUR
//   (destroyed). No KO threshold. A rocket (4 carried) is an instant-kill
//   option instead of a normal Attack Round.
// Two independent stat pools - player+enemy (SKILL/STAMINA, for Hand
// Fighting/Shooting) and car+enemyCar (FIREPOWER/ARMOUR, for Vehicle Combat)
// - both shown at once rather than toggled, since the book switches between
// foot combat and car combat constantly within the same session. `mode`
// just picks which pool _runRound() resolves against.
// All state lives in pt.sim209, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=13';
import { showAlert } from '../play.js?v=136';
import { getPlayBtnRow } from '../charsheet.js?v=91';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=74';
import { t } from '../i18n.js?v=61';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const MODES = [
  ['hand',    'Hand Fighting'],
  ['shoot',   'Shooting'],
  ['vehicle', 'Vehicle Combat'],
];

const MAX_MEDKIT = 10;
const MAX_ROCKETS = 4;
const MAX_SPIKES = 3;
const MAX_OIL = 2;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim209) {
    pt.sim209 = {
      player: { skill: 0, skillInitial: 0, stamina: 0, staminaInitial: 0, luck: 0, luckInitial: 0, medKitLeft: MAX_MEDKIT },
      car: { firepower: 0, firepowerInitial: 0, armour: 0, armourInitial: 0, rockets: MAX_ROCKETS, spikes: MAX_SPIKES, oil: MAX_OIL },
      mode: 'hand',
      handDmg: 1,
      playerHandLoss: 0, enemyHandLoss: 0,
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      enemyCar: { name: '', firepower: 0, armour: 0, armourMax: 0 },
      rolled: false,
      roundsPerson: 0,
      roundsVehicle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim209;
  if (d.rolled === undefined) d.rolled = false;
  // Two independent pools (person: hand/shoot share it; vehicle: its own)
  // need their own "is a battle actually in progress" counter - a single
  // shared one meant switching modes mid-fight silently lost track of
  // whichever pool you'd left mid-battle (Med-Kit's "not usable mid-combat"
  // guard would incorrectly read the *other*, untouched pool as at rest).
  if (d.roundsPerson === undefined) d.roundsPerson = d.roundsThisBattle ?? 0;
  if (d.roundsVehicle === undefined) d.roundsVehicle = 0;
  delete d.roundsThisBattle;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  if (!d.mode) d.mode = 'hand';
  if (d.handDmg === undefined) d.handDmg = 1;
  if (d.playerHandLoss === undefined) d.playerHandLoss = 0;
  if (d.enemyHandLoss === undefined) d.enemyHandLoss = 0;
  if (d.player.medKitLeft === undefined) d.player.medKitLeft = MAX_MEDKIT;
  if (!d.car) d.car = { firepower: 0, firepowerInitial: 0, armour: 0, armourInitial: 0, rockets: MAX_ROCKETS, spikes: MAX_SPIKES, oil: MAX_OIL };
  if (d.car.rockets === undefined) d.car.rockets = MAX_ROCKETS;
  if (d.car.spikes === undefined) d.car.spikes = MAX_SPIKES;
  if (d.car.oil === undefined) d.car.oil = MAX_OIL;
  if (!d.enemyCar) d.enemyCar = { name: '', firepower: 0, armour: 0, armourMax: 0 };
  return d;
}

function _notReady(d) { return !d.rolled; }
function _roll2d6() { return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }
function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

// Which pool _runRound() reads/writes, based on the current mode - keeps the
// round-resolution logic itself mode-agnostic instead of three near-duplicate
// functions.
function _activeSide(d) {
  return d.mode === 'vehicle'
    ? { self: d.car, foe: d.enemyCar, selfAtk: 'firepower', selfHp: 'armour', selfHpMax: 'armourInitial', foeAtk: 'firepower', foeHp: 'armour', foeHpMax: 'armourMax', roundsKey: 'roundsVehicle' }
    : { self: d.player, foe: d.enemy, selfAtk: 'skill', selfHp: 'stamina', selfHpMax: 'staminaInitial', foeAtk: 'skill', foeHp: 'stamina', foeHpMax: 'staminaMax', roundsKey: 'roundsPerson' };
}

function _foeName(d) {
  const name = d.mode === 'vehicle' ? d.enemyCar.name : d.enemy.name;
  return name.trim() || 'the enemy';
}
function _foeNameSafe(d) { return escapeHtml(_foeName(d)); }

// `side` decides which pool's own remaining/max values actually belong in
// this entry - a Vehicle Combat win previously always logged the player's
// (unrelated, likely untouched) person STAMINA instead of the car's ARMOUR,
// which was the stat that fight actually turned on.
function _recordOutcome(d, side, outcome, note) {
  d.history.push({
    enemy: `${_foeName(d)} (${MODES.find(m => m[0] === d.mode)[1]}${note ? `, ${note}` : ''})`,
    outcome,
    statLabel: side.selfHp.toUpperCase(),
    statValue: side.self[side.selfHp], statMax: side.self[side.selfHpMax],
    ts: Date.now(),
  });
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _runRound() {
  const d = _data();
  if (!d || _notReady(d)) return;
  const side = _activeSide(d);
  if (side.self[side.selfHp] <= 0 || side.foe[side.foeHp] <= 0) return;
  d[side.roundsKey]++;

  const selfRoll = _roll2d6() + side.self[side.selfAtk];
  const foeRoll  = _roll2d6() + side.foe[side.foeAtk];
  _appendLog(d, `Round ${d[side.roundsKey]}: you ${selfRoll} vs ${_foeNameSafe(d)} ${foeRoll}.`);

  if (selfRoll === foeRoll) {
    _appendLog(d, 'Both attacks miss.');
  } else if (selfRoll > foeRoll) {
    const dmg = d.mode === 'hand' ? d.handDmg : _roll1d6();
    side.foe[side.foeHp] = Math.max(0, side.foe[side.foeHp] - dmg);
    if (d.mode === 'hand') d.enemyHandLoss += dmg;
    _appendLog(d, `You hit ${_foeNameSafe(d)} for ${dmg}. ${side.foeHp.toUpperCase()}: ${side.foe[side.foeHp]}/${side.foe[side.foeHpMax]}.`);
  } else {
    const dmg = d.mode === 'hand' ? d.handDmg : _roll1d6();
    side.self[side.selfHp] = Math.max(0, side.self[side.selfHp] - dmg);
    if (d.mode === 'hand') d.playerHandLoss += dmg;
    _appendLog(d, `${_foeNameSafe(d)} hits you for ${dmg}. ${side.selfHp.toUpperCase()}: ${side.self[side.selfHp]}/${side.self[side.selfHpMax]}.`);
  }

  _checkOutcome(d, side);
  saveState();
  _renderAll();
}

function _checkOutcome(d, side) {
  if (side.foe[side.foeHp] <= 0) {
    _appendLog(d, `${SVG_TROPHY} ${_foeNameSafe(d)} is ${d.mode === 'vehicle' ? 'destroyed' : 'dead'}!`);
    _recordOutcome(d, side, 'win');
    return;
  }
  if (side.self[side.selfHp] <= 0) {
    _appendLog(d, `${SVG_SKULL} You are ${d.mode === 'vehicle' ? 'destroyed' : 'dead'}.`);
    _recordOutcome(d, side, 'loss');
    return;
  }
  // Knocked-out threshold only applies to Hand Fighting.
  if (d.mode === 'hand') {
    if (d.enemyHandLoss >= 6) {
      _appendLog(d, `${SVG_TROPHY} ${_foeNameSafe(d)} is knocked out!`);
      _recordOutcome(d, side, 'win', 'KO');
    } else if (d.playerHandLoss >= 6) {
      _appendLog(d, `${SVG_SKULL} You are knocked out.`);
      _recordOutcome(d, side, 'loss', 'KO');
    }
  }
}

// A rocket is fired instead of a normal Attack Round - the book rules it as
// an automatic hit that destroys any target outright, no roll needed.
function _fireRocket() {
  const d = _data();
  if (!d || _notReady(d) || d.mode !== 'vehicle' || d.car.rockets <= 0) return;
  if (d.enemyCar.armour <= 0 || d.car.armour <= 0) return;
  d.car.rockets--;
  d.enemyCar.armour = 0;
  d.roundsVehicle++;
  _appendLog(d, `You launch a rocket - ${_foeNameSafe(d)} is destroyed! (${d.car.rockets} rocket(s) left)`);
  _recordOutcome(d, _activeSide(d), 'win', 'rocket');
  saveState();
  _renderAll();
}

// Only resets the pool the current mode is actually using - Hand Fighting
// and Shooting share the person pool (switching between those two mid-fight
// is not something the book ever asks you to do, so treating them as one
// battle is fine), but Vehicle Combat is a genuinely separate pool. A reset
// that touched both unconditionally would wipe real, unrelated car damage
// you'd already taken just because you hit Reset on an unrelated fistfight.
function _resetBattle() {
  const d = _data();
  if (!d) return;
  const side = _activeSide(d);
  side.foe[side.foeHp] = side.foe[side.foeHpMax];
  side.self[side.selfHp] = side.self[side.selfHpMax];
  d[side.roundsKey] = 0;
  if (d.mode === 'hand') {
    d.playerHandLoss = 0;
    d.enemyHandLoss = 0;
  }
  if (d.log.length) _appendLog(d, '──────────');
  _appendLog(d, 'Battle reset.');
  saveState();
  _renderAll();
}

// ── Med-Kit ──────────────────────────────────────────────────────────────────

function _useMedKit() {
  const d = _data();
  if (!d || _notReady(d)) return;
  const side = _activeSide(d);
  const midFight = d[side.roundsKey] > 0 && side.self[side.selfHp] > 0 && side.foe[side.foeHp] > 0;
  if (midFight) {
    showAlert('The Med-Kit cannot be used while engaged in combat.');
    return;
  }
  if (d.player.medKitLeft <= 0 || d.player.stamina >= d.player.staminaInitial) return;
  d.player.medKitLeft--;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 4);
  _appendLog(d, `You use the Med-Kit: STAMINA ${before} → ${d.player.stamina}/${d.player.staminaInitial}.`);
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim209-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const side = _activeSide(d);
  const hasFoe = side.foe[side.foeHpMax] > 0;
  if (notReady)                                el.innerHTML = 'Roll your starting SKILL, STAMINA, LUCK and car FIREPOWER/ARMOUR to begin.';
  else if (side.self[side.selfHp] <= 0)         el.innerHTML = `${SVG_SKULL} You have fallen.`;
  else if (hasFoe && side.foe[side.foeHp] <= 0) el.innerHTML = `${SVG_TROPHY} Victory!`;
  else                                          el.innerHTML = '';
  const over = notReady || side.self[side.selfHp] <= 0 || (hasFoe && side.foe[side.foeHp] <= 0);
  document.getElementById('sim209-round').disabled = over;
  document.getElementById('sim209-rocket').disabled = notReady || d.mode !== 'vehicle' || d.car.rockets <= 0 || over;
  document.getElementById('sim209-rocket').style.display = d.mode === 'vehicle' ? '' : 'none';
  document.getElementById('sim209-handdmg-row').style.display = d.mode === 'hand' ? '' : 'none';
  document.getElementById('sim209-medkit').disabled =
    notReady || d.player.medKitLeft <= 0 || d.player.stamina >= d.player.staminaInitial ||
    (d[side.roundsKey] > 0 && side.self[side.selfHp] > 0 && side.foe[side.foeHp] > 0);
}

function _renderConsumablesHtml(d) {
  return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Iron-spike canisters</div>
      <div class="bsim-tech-desc">Narrative use only (drop behind you to blow a pursuer's tyre) - track how many are left.</div>
      <div class="bsim-tech-footer"><span class="bsim-ae-display">${d.car.spikes}/${MAX_SPIKES}</span>
        <button class="inv-edit-done bsim-tech-btn" id="sim209-spike-use" ${d.car.spikes <= 0 ? 'disabled' : ''}>Use one</button></div>
    </div>
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">Oil canisters</div>
      <div class="bsim-tech-desc">Narrative use only (rear spray, makes pursuers skid) - track how many are left.</div>
      <div class="bsim-tech-footer"><span class="bsim-ae-display">${d.car.oil}/${MAX_OIL}</span>
        <button class="inv-edit-done bsim-tech-btn" id="sim209-oil-use" ${d.car.oil <= 0 ? 'disabled' : ''}>Use one</button></div>
    </div>`;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim209-history-summary');
  const listEl = document.getElementById('sim209-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = `Battle History (${d.history.length})`;
  if (!d.history.length) {
    listEl.innerHTML = '<div class="bsim-history-empty">No finished battles yet.</div>';
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? 'won' : 'lost';
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${h.statLabel} ${h.statValue}/${h.statMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim209-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim209-player-skill').value      = d.player.skill;
  document.getElementById('sim209-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim209-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim209-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim209-player-luck').value       = d.player.luck;
  document.getElementById('sim209-player-luckmax').value    = d.player.luckInitial;

  document.getElementById('sim209-car-firepower').value      = d.car.firepower;
  document.getElementById('sim209-car-firepowermax').value   = d.car.firepowerInitial;
  document.getElementById('sim209-car-armour').value         = Math.min(d.car.armour, d.car.armourInitial);
  document.getElementById('sim209-car-armourmax').value      = d.car.armourInitial;

  const rollBtn = document.getElementById('sim209-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? 'Rolled' : 'Roll starting stats';

  document.getElementById('sim209-medkit-left').textContent = `${d.player.medKitLeft}/${MAX_MEDKIT}`;
  document.getElementById('sim209-rockets-left').textContent = `${d.car.rockets}/${MAX_ROCKETS}`;

  document.getElementById('sim209-mode').value = d.mode;
  document.getElementById('sim209-handdmg').value = d.handDmg;
  document.getElementById('sim209-handloss').textContent = `You: ${d.playerHandLoss}/6 · Foe: ${d.enemyHandLoss}/6`;

  document.getElementById('sim209-enemy-pick').value       = d.enemy.name;
  document.getElementById('sim209-enemy-skill').value      = d.enemy.skill;
  document.getElementById('sim209-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim209-enemy-staminamax').value = d.enemy.staminaMax;

  document.getElementById('sim209-enemycar-pick').value        = d.enemyCar.name;
  document.getElementById('sim209-enemycar-firepower').value   = d.enemyCar.firepower;
  document.getElementById('sim209-enemycar-armour').value      = Math.min(d.enemyCar.armour, d.enemyCar.armourMax);
  document.getElementById('sim209-enemycar-armourmax').value   = d.enemyCar.armourMax;

  document.getElementById('sim209-consumables').innerHTML = _renderConsumablesHtml(d);

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim209() {
  const overlay = document.getElementById('sim209-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim209(); return; }
  _renderAll();
}

function openSim209() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim209-overlay').classList.add('active');
}

function closeSim209() {
  document.getElementById('sim209-overlay')?.classList.remove('active');
}

export function setSim209Visible(visible) {
  const btn = document.getElementById('sim209-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim209();
}

// ── Enemy autocomplete (fed by book_enemies, seeded per book_id) ───────────
// Shared between the person-combat and car-combat pickers - book_enemies has
// no notion of "is this a car," so both pickers draw from the same list and
// it's on the reader to pick the right one for whichever mode they're in.

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

function _setupEnemyAutocomplete(inputId, dropdownId, onSelect) {
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">SKILL:${e.attack ?? '?'} STAMINA:${e.hp ?? '?'}</span></li>`
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

export function initSim209() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim209-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">Battle Simulator</span>
        <button id="sim209-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="inv-edit-row">
            <span class="inv-edit-label bsim-stat-label">Combat type</span>
            <select id="sim209-mode" class="inv-edit-input bsim-select">
              ${MODES.map(m => `<option value="${m[0]}">${escapeHtml(m[1])}</option>`).join('')}
            </select>
          </div>
          <div id="sim209-handdmg-row" class="inv-edit-row bsim-ae-row">
            <span class="inv-edit-label bsim-stat-label">Hand damage/hit</span>
            <div class="inv-qty-wrap">
              <button class="inv-qty-btn" data-id="sim209-handdmg" data-delta="-1">−</button>
              <input id="sim209-handdmg" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
              <button class="inv-qty-btn" data-id="sim209-handdmg" data-delta="1">+</button>
            </div>
          </div>
          <div id="sim209-handloss" class="bsim-ae-display"></div>
          <div class="bsim-side">
            <div class="bsim-side-title">You</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim209-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">Roll starting stats</button>
            </div>
            ${_numField('SKILL', 'sim209-player-skill')}
            ${_numField('Initial SKILL', 'sim209-player-skillmax')}
            ${_numField('STAMINA', 'sim209-player-stamina')}
            ${_numField('Initial STAMINA', 'sim209-player-staminamax')}
            ${_numField('LUCK', 'sim209-player-luck')}
            ${_numField('Initial LUCK', 'sim209-player-luckmax')}
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">Med-Kit</span>
              <span id="sim209-medkit-left" class="bsim-ae-display"></span>
              <button id="sim209-medkit" class="inv-edit-done bsim-ae-roll-btn" type="button">Use (+4 STAMINA)</button>
            </div>
            ${_numField('FIREPOWER', 'sim209-car-firepower')}
            ${_numField('Initial FIREPOWER', 'sim209-car-firepowermax')}
            ${_numField('ARMOUR', 'sim209-car-armour')}
            ${_numField('Initial ARMOUR', 'sim209-car-armourmax')}
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">Rockets</span>
              <span id="sim209-rockets-left" class="bsim-ae-display"></span>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">Enemy (Hand/Shooting)</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Pick</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim209-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim209-enemy-pick-dropdown">
                <ul id="sim209-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField('SKILL', 'sim209-enemy-skill')}
            ${_numField('STAMINA', 'sim209-enemy-stamina')}
            ${_numField('Max STAMINA', 'sim209-enemy-staminamax')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">Enemy vehicle</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Pick</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim209-enemycar-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim209-enemycar-pick-dropdown">
                <ul id="sim209-enemycar-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField('FIREPOWER', 'sim209-enemycar-firepower')}
            ${_numField('ARMOUR', 'sim209-enemycar-armour')}
            ${_numField('Max ARMOUR', 'sim209-enemycar-armourmax')}
          </div>
          <div id="sim209-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim209-round" class="inv-add-btn bsim-action-primary">Round</button>
            <button id="sim209-rocket" class="inv-add-btn">Fire rocket (instant kill)</button>
            <button id="sim209-reset" class="inv-add-btn">Reset</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>Spikes &amp; Oil</summary>
            <div id="sim209-consumables" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim209-history-summary">Battle History (0)</summary>
            <div id="sim209-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim209-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim209-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim209);
  document.getElementById('sim209-close').addEventListener('click', closeSim209);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim209(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim209-overlay'),
    open:  openSim209,
    close: closeSim209,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim209();
  });

  document.getElementById('sim209-round').addEventListener('click', _runRound);
  document.getElementById('sim209-rocket').addEventListener('click', _fireRocket);
  document.getElementById('sim209-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim209-medkit').addEventListener('click', _useMedKit);

  document.getElementById('sim209-mode').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.mode = e.target.value;
    saveState();
    _renderAll();
  });

  document.getElementById('sim209-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 24;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.car.firepowerInitial = _roll1d6() + 6;
    d.car.armourInitial    = _roll2d6() + 24;
    d.car.firepower = d.car.firepowerInitial;
    d.car.armour    = d.car.armourInitial;
    d.rolled = true;
    _appendLog(d, `Starting stats rolled: SKILL ${d.player.skillInitial}, STAMINA ${d.player.staminaInitial}, LUCK ${d.player.luckInitial}, FIREPOWER ${d.car.firepowerInitial}, ARMOUR ${d.car.armourInitial}.`);
    saveState();
    _renderAll();
  });

  document.getElementById('sim209-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  document.getElementById('sim209-enemycar-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemyCar.name = e.target.value;
    saveState();
  });

  document.getElementById('sim209-consumables').addEventListener('click', e => {
    const d = _data();
    if (!d) return;
    if (e.target.id === 'sim209-spike-use' && d.car.spikes > 0) {
      d.car.spikes--;
      _appendLog(d, `You drop a canister of iron spikes. (${d.car.spikes} left)`);
      saveState(); _renderAll();
    } else if (e.target.id === 'sim209-oil-use' && d.car.oil > 0) {
      d.car.oil--;
      _appendLog(d, `You release a spray of oil. (${d.car.oil} left)`);
      saveState(); _renderAll();
    }
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim209-player-skill':       ['player', 'skill'],
    'sim209-player-skillmax':    ['player', 'skillInitial'],
    'sim209-player-stamina':     ['player', 'stamina'],
    'sim209-player-staminamax':  ['player', 'staminaInitial'],
    'sim209-player-luck':        ['player', 'luck'],
    'sim209-player-luckmax':     ['player', 'luckInitial'],
    'sim209-car-firepower':      ['car', 'firepower'],
    'sim209-car-firepowermax':   ['car', 'firepowerInitial'],
    'sim209-car-armour':         ['car', 'armour'],
    'sim209-car-armourmax':      ['car', 'armourInitial'],
    'sim209-enemy-skill':        ['enemy', 'skill'],
    'sim209-enemy-stamina':      ['enemy', 'stamina'],
    'sim209-enemy-staminamax':   ['enemy', 'staminaMax'],
    'sim209-enemycar-firepower':    ['enemyCar', 'firepower'],
    'sim209-enemycar-armour':       ['enemyCar', 'armour'],
    'sim209-enemycar-armourmax':    ['enemyCar', 'armourMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    if (id === 'sim209-handdmg') {
      d.handDmg = Math.max(1, val);
      saveState();
      _renderInputs();
      return;
    }
    const map = FIELD_MAP[id];
    if (!map) return;
    val = Math.max(0, val);
    if (id === 'sim209-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim209-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim209-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim209-car-firepower') val = Math.min(val, d.car.firepowerInitial);
    if (id === 'sim209-car-armour') val = Math.min(val, d.car.armourInitial);
    if (id === 'sim209-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim209-enemycar-armour') val = Math.min(val, d.enemyCar.armourMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim209-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim209-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim209-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim209-car-firepowermax') d.car.firepower = Math.min(d.car.firepower, val);
    if (id === 'sim209-car-armourmax') d.car.armour = Math.min(d.car.armour, val);
    if (id === 'sim209-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    if (id === 'sim209-enemycar-armourmax') d.enemyCar.armour = Math.min(d.enemyCar.armour, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim209-"]').forEach(input => {
    if (!FIELD_MAP[input.id] && input.id !== 'sim209-handdmg') return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim209-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || (!FIELD_MAP[btnEl.dataset.id] && btnEl.dataset.id !== 'sim209-handdmg')) return;
      const next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim209-enemy-pick', 'sim209-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.skill = enemy.attack;
    if (enemy.hp != null) { d.enemy.stamina = enemy.hp; d.enemy.staminaMax = enemy.hp; }
    d.roundsPerson = 0;
    // A new enemy means a fresh fight - carrying over cumulative
    // Hand-Fighting knockout progress from whichever encounter you just
    // left would start this one already partway to a KO for one side.
    d.playerHandLoss = 0;
    d.enemyHandLoss = 0;
    saveState();
    _renderAll();
  });
  _setupEnemyAutocomplete('sim209-enemycar-pick', 'sim209-enemycar-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemyCar.name = enemy.name;
    if (enemy.attack != null) d.enemyCar.firepower = enemy.attack;
    if (enemy.hp != null) { d.enemyCar.armour = enemy.hp; d.enemyCar.armourMax = enemy.hp; }
    d.roundsVehicle = 0;
    saveState();
    _renderAll();
  });
}
