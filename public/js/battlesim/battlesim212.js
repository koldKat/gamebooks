// ── Battle Simulator (Seas of Blood, book 212) ────────────────────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 212 only) by the caller in boot.js via
// setSim212Visible().
// To remove: delete this file, remove its import line and initSim212()/
// setSim212Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with every other battlesim*.js module, so only remove it if all of them
// are gone).
//
// One combat engine, two independent stat pools - the book's own rules
// (Individual Combat / Large-scale Battles) are explicitly the same
// procedure twice: "use the same basic combat procedure, substituting CREW
// STRIKE/CREW STRENGTH for your individual values." Simultaneous opposed
// 2d6+attack roll each side, higher wins, flat 2 damage to the loser's
// STAMINA/STRENGTH, ties miss both ways. No Test Your Luck anywhere in
// combat at all (unlike most FF books) - LUCK exists only for narrative
// page prompts, same situation book211's own header comment already noted
// for a different book.
// Two independent pools (person: SKILL/STAMINA/LUCK: crew: CREW
// STRIKE/CREW STRENGTH) with their own enemy tracker and round counter, so
// switching modes mid-fight can't let Reset or a stat edit touch the
// untouched pool - same fix every prior dual-pool sim in this app needed.
// One special permanent toggle: the Awkmute's staff (won at sec 63, kept at
// sec 125) - once held, a landed personal-combat hit rolls 1d: 1-2 costs the
// opponent 1 SKILL instead of the normal 2 STAMINA, 3-6 is a normal hit.
// Only meaningful in Individual Combat - the player wields it personally,
// not the crew, so the checkbox is hidden in Crew Battle mode.
// All state lives in pt.sim212, per-user/per-book via currentPlaythrough().
//
// Not modeled: sec 48's punch-out minigame ("the first to hit the other
// wins the bout") has no STAMINA at all in the book - a genuinely different
// resolution rule this engine doesn't implement. Its book_enemies seed row
// (Ogre Champion) uses STAMINA 2 as an approximation instead of leaving it
// null - null left the fight silently unwinnable (STAMINA max stuck at 0,
// Round did nothing, no error) rather than close enough to "first hit
// decides it" either way.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=1467';
import { showAlert } from '../confirm.js?v=1467';
import { getPlayBtnRow } from '../charsheet.js?v=1467';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=1467';
import { t } from '../i18n.js?v=1467';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const MODES = [
  ['person', 'battlesim212.mode.person'],
  ['crew',   'battlesim212.mode.crew'],
];

const ESCAPE_CREW_COST = 2;

function _roll2d6() { return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }
function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim212) {
    pt.sim212 = {
      rolled: false,
      player: { skill: 0, skillInitial: 0, stamina: 0, staminaInitial: 0, luck: 0, luckInitial: 0, gold: 20, hasStaff: false },
      crew:   { strike: 0, strikeInitial: 0, strength: 0, strengthInitial: 0 },
      mode: 'person',
      enemyPerson: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      enemyCrew:   { name: '', strike: 0, strength: 0, strengthMax: 0 },
      roundsPerson: 0,
      roundsCrew: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim212;
  // Defaults for anyone whose save predates a field added later.
  if (d.player.gold === undefined) d.player.gold = 20;
  if (d.player.hasStaff === undefined) d.player.hasStaff = false;
  if (!d.mode) d.mode = 'person';
  return d;
}

function _notReady(d) { return !d.rolled; }

function _appendLog(d, msg) {
  d.log.push(msg);
  if (d.log.length > 200) d.log.shift();
}

// Which pool _runRound() reads/writes, based on the current mode - keeps
// round resolution mode-agnostic since both modes share one procedure.
function _activeSide(d) {
  return d.mode === 'crew'
    ? { self: d.crew, foe: d.enemyCrew, selfAtk: 'strike', selfHp: 'strength', selfHpMax: 'strengthInitial', foeAtk: 'strike', foeHp: 'strength', foeHpMax: 'strengthMax', roundsKey: 'roundsCrew', label: 'STRENGTH' }
    : { self: d.player, foe: d.enemyPerson, selfAtk: 'skill', selfHp: 'stamina', selfHpMax: 'staminaInitial', foeAtk: 'skill', foeHp: 'stamina', foeHpMax: 'staminaMax', roundsKey: 'roundsPerson', label: 'STAMINA' };
}

function _selfMaxHp(d, side) {
  return d.mode === 'crew' ? d.crew.strengthInitial : d.player.staminaInitial;
}

function _foeName(d) {
  const side = _activeSide(d);
  return side.foe.name.trim() || t('battlesim.default_enemy');
}
function _foeNameSafe(d) { return escapeHtml(_foeName(d)); }

function _recordOutcome(d, side, outcome) {
  d.history.push({
    enemy: `${_foeName(d)} (${MODES.find(m => m[0] === d.mode)[1]})`,
    outcome,
    statLabel: side.label,
    statValue: side.self[side.selfHp], statMax: _selfMaxHp(d, side),
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

  const selfAS = _roll2d6() + side.self[side.selfAtk];
  const foeAS  = _roll2d6() + side.foe[side.foeAtk];
  _appendLog(d, t('battlesim212.log.round', { round: d[side.roundsKey], selfAS, enemy: _foeNameSafe(d), enemyAS: foeAS }));

  if (selfAS === foeAS) {
    _appendLog(d, t('battlesim212.log.both_avoided'));
  } else if (selfAS > foeAS) {
    if (d.mode === 'person' && d.player.hasStaff && _roll1d6() <= 2) {
      side.foe.skill = Math.max(0, side.foe.skill - 1);
      _appendLog(d, t('battlesim212.log.staff_strike', { enemy: _foeNameSafe(d), skill: side.foe.skill }));
    } else {
      side.foe[side.foeHp] = Math.max(0, side.foe[side.foeHp] - 2);
      _appendLog(d, t('battlesim212.log.you_wound', { enemy: _foeNameSafe(d), label: side.label, hp: side.foe[side.foeHp], hpMax: side.foe[side.foeHpMax] }));
    }
  } else {
    side.self[side.selfHp] = Math.max(0, side.self[side.selfHp] - 2);
    _appendLog(d, t('battlesim212.log.enemy_wounds', { enemy: _foeNameSafe(d), label: side.label, hp: side.self[side.selfHp], hpMax: _selfMaxHp(d, side) }));
  }

  _checkOutcome(d, side);
  saveState();
  _renderAll();
}

function _checkOutcome(d, side) {
  if (side.foe[side.foeHp] <= 0) {
    _appendLog(d, t('battlesim212.log.defeated', { trophy: SVG_TROPHY, enemy: _foeNameSafe(d) }));
    _recordOutcome(d, side, 'win');
  } else if (side.self[side.selfHp] <= 0) {
    _appendLog(d, d.mode === 'crew' ? t('battlesim212.log.dead_crew', { skull: SVG_SKULL }) : t('battlesim212.log.dead_person', { skull: SVG_SKULL }));
    _recordOutcome(d, side, 'loss');
  }
}

// Escaping a Large-scale Battle automatically costs ESCAPE_CREW_COST CREW
// STRENGTH per the book's own rule ("Whenever you choose to escape... you
// automatically lose 2 CREW STRENGTH") - not available in Individual Combat,
// which has no equivalent rule.
function _escape() {
  const d = _data();
  if (!d || _notReady(d) || d.mode !== 'crew') return;
  if (d.crew.strength <= 0 || d.enemyCrew.strength <= 0) return;
  d.crew.strength = Math.max(0, d.crew.strength - ESCAPE_CREW_COST);
  _appendLog(d, t('battlesim212.log.escape', { cost: ESCAPE_CREW_COST, strength: d.crew.strength, strengthMax: d.crew.strengthInitial }));
  d.roundsCrew = 0;
  saveState();
  _renderAll();
}

// Only resets the pool the current mode is actually using - see every
// other dual-pool sim in this app for why a blanket reset is wrong: it
// would wipe real, unrelated damage in the other pool just because Reset
// was hit on an unrelated fight.
function _resetBattle() {
  const d = _data();
  if (!d) return;
  const side = _activeSide(d);
  side.foe[side.foeHp] = side.foe[side.foeHpMax];
  side.self[side.selfHp] = _selfMaxHp(d, side);
  d[side.roundsKey] = 0;
  if (d.log.length) _appendLog(d, t('battlesim212.log.reset_sep'));
  _appendLog(d, t('battlesim212.log.reset'));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim212-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const side = _activeSide(d);
  const hasFoe = side.foe[side.foeHpMax] > 0;
  if (notReady)                                el.innerHTML = t('battlesim212.status.not_ready');
  else if (side.self[side.selfHp] <= 0)         el.innerHTML = t('battlesim212.status.fallen', { skull: SVG_SKULL });
  else if (hasFoe && side.foe[side.foeHp] <= 0) el.innerHTML = t('battlesim212.status.victory', { trophy: SVG_TROPHY });
  else                                          el.innerHTML = '';
  const over = notReady || side.self[side.selfHp] <= 0 || (hasFoe && side.foe[side.foeHp] <= 0);
  document.getElementById('sim212-round').disabled  = over;
  document.getElementById('sim212-escape').disabled = notReady || d.mode !== 'crew' || over;
  document.getElementById('sim212-escape-row').style.display = d.mode === 'crew' ? '' : 'none';
  document.getElementById('sim212-staff-row').style.display  = d.mode === 'person' ? '' : 'none';
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim212-history-summary');
  const listEl = document.getElementById('sim212-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim212.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim212.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim212.history.won') : t('battlesim212.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${h.statLabel} ${h.statValue}/${h.statMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim212-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim212-mode').value = d.mode;

  document.getElementById('sim212-player-skill').value      = d.player.skill;
  document.getElementById('sim212-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim212-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim212-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim212-player-luck').value       = d.player.luck;
  document.getElementById('sim212-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim212-player-gold').value       = d.player.gold;
  document.getElementById('sim212-staff').checked           = d.player.hasStaff;

  document.getElementById('sim212-crew-strike').value          = d.crew.strike;
  document.getElementById('sim212-crew-strikemax').value       = d.crew.strikeInitial;
  document.getElementById('sim212-crew-strength').value        = Math.min(d.crew.strength, d.crew.strengthInitial);
  document.getElementById('sim212-crew-strengthmax').value     = d.crew.strengthInitial;

  document.getElementById('sim212-enemy-pick').value       = d.enemyPerson.name;
  document.getElementById('sim212-enemy-skill').value      = d.enemyPerson.skill;
  document.getElementById('sim212-enemy-stamina').value    = Math.min(d.enemyPerson.stamina, d.enemyPerson.staminaMax);
  document.getElementById('sim212-enemy-staminamax').value = d.enemyPerson.staminaMax;

  document.getElementById('sim212-enemycrew-pick').value        = d.enemyCrew.name;
  document.getElementById('sim212-enemycrew-strike').value      = d.enemyCrew.strike;
  document.getElementById('sim212-enemycrew-strength').value    = Math.min(d.enemyCrew.strength, d.enemyCrew.strengthMax);
  document.getElementById('sim212-enemycrew-strengthmax').value = d.enemyCrew.strengthMax;

  document.getElementById('sim212-person-fields').style.display = d.mode === 'crew' ? 'none' : '';
  document.getElementById('sim212-crew-fields').style.display   = d.mode === 'crew' ? '' : 'none';
  document.getElementById('sim212-enemy-fields').style.display      = d.mode === 'crew' ? 'none' : '';
  document.getElementById('sim212-enemycrew-fields').style.display  = d.mode === 'crew' ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim212() {
  const overlay = document.getElementById('sim212-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim212(); return; }
  _renderAll();
}

function openSim212() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim212-overlay').classList.add('active');
}

function closeSim212() {
  document.getElementById('sim212-overlay')?.classList.remove('active');
}

export function setSim212Visible(visible) {
  const btn = document.getElementById('sim212-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim212();
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">ATK:${e.attack ?? '?'} HP:${e.hp ?? '?'}</span></li>`
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

export function initSim212() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim212-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim212-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="inv-edit-row">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim212.ui.combat_type')}</span>
            <select id="sim212-mode" class="inv-edit-input bsim-select">
              ${MODES.map(m => `<option value="${m[0]}">${escapeHtml(t(m[1]))}</option>`).join('')}
            </select>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim212.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim212-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim212.btn.roll')}</button>
            </div>
            <div id="sim212-person-fields">
              ${_numField(t('battlesim212.ui.skill'), 'sim212-player-skill')}
              ${_numField(t('battlesim212.ui.skill_initial'), 'sim212-player-skillmax')}
              ${_numField(t('battlesim212.ui.stamina'), 'sim212-player-stamina')}
              ${_numField(t('battlesim212.ui.stamina_initial'), 'sim212-player-staminamax')}
              <div id="sim212-staff-row" class="bsim-tech-footer">
                <label class="inv-edit-check-label"><input type="checkbox" id="sim212-staff" class="inv-edit-check"> ${t('battlesim212.ui.staff_held')}</label>
              </div>
            </div>
            <div id="sim212-crew-fields" style="display:none">
              ${_numField(t('battlesim212.ui.crew_strike'), 'sim212-crew-strike')}
              ${_numField(t('battlesim212.ui.crew_strike_initial'), 'sim212-crew-strikemax')}
              ${_numField(t('battlesim212.ui.crew_strength'), 'sim212-crew-strength')}
              ${_numField(t('battlesim212.ui.crew_strength_initial'), 'sim212-crew-strengthmax')}
            </div>
            ${_numField(t('battlesim212.ui.luck'), 'sim212-player-luck')}
            ${_numField(t('battlesim212.ui.luck_initial'), 'sim212-player-luckmax')}
            ${_numField(t('battlesim212.ui.gold'), 'sim212-player-gold')}
          </div>
          <div id="sim212-enemy-fields" class="bsim-side">
            <div class="bsim-side-title">${t('battlesim212.ui.enemy_individual')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim212.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim212-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim212-enemy-pick-dropdown">
                <ul id="sim212-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim212.ui.skill'), 'sim212-enemy-skill')}
            ${_numField(t('battlesim212.ui.stamina'), 'sim212-enemy-stamina')}
            ${_numField(t('battlesim212.ui.stamina_max'), 'sim212-enemy-staminamax')}
          </div>
          <div id="sim212-enemycrew-fields" class="bsim-side" style="display:none">
            <div class="bsim-side-title">${t('battlesim212.ui.enemy_crew')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim212.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim212-enemycrew-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim212-enemycrew-pick-dropdown">
                <ul id="sim212-enemycrew-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim212.ui.strike'), 'sim212-enemycrew-strike')}
            ${_numField(t('battlesim212.ui.strength'), 'sim212-enemycrew-strength')}
            ${_numField(t('battlesim212.ui.strength_max'), 'sim212-enemycrew-strengthmax')}
          </div>
          <div id="sim212-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim212-round" class="inv-add-btn bsim-action-primary">${t('battlesim212.btn.round')}</button>
            <div id="sim212-escape-row" style="display:none">
              <button id="sim212-escape" class="inv-add-btn">${t('battlesim212.btn.escape', { n: ESCAPE_CREW_COST, strength: t('battlesim212.ui.crew_strength') })}</button>
            </div>
            <button id="sim212-reset" class="inv-add-btn">${t('battlesim212.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim212-history-summary">${t('battlesim212.history.summary', { n: 0 })}</summary>
            <div id="sim212-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim212-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim212-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim212);
  document.getElementById('sim212-close').addEventListener('click', closeSim212);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim212(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim212-overlay'),
    open:  openSim212,
    close: closeSim212,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim212();
  });

  document.getElementById('sim212-round').addEventListener('click', _runRound);
  document.getElementById('sim212-escape').addEventListener('click', _escape);
  document.getElementById('sim212-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim212-mode').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.mode = e.target.value;
    saveState();
    _renderAll();
  });

  document.getElementById('sim212-staff').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.hasStaff = e.target.checked;
    saveState();
  });

  document.getElementById('sim212-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.crew.strikeInitial   = _roll1d6() + 6;
    d.crew.strengthInitial = _roll2d6() + 6;
    d.crew.strike   = d.crew.strikeInitial;
    d.crew.strength = d.crew.strengthInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim212.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial, crewStrike: d.crew.strikeInitial, crewStrength: d.crew.strengthInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim212-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemyPerson.name = e.target.value;
    saveState();
  });
  document.getElementById('sim212-enemycrew-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemyCrew.name = e.target.value;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim212-player-skill':      ['player', 'skill'],
    'sim212-player-skillmax':   ['player', 'skillInitial'],
    'sim212-player-stamina':    ['player', 'stamina'],
    'sim212-player-staminamax': ['player', 'staminaInitial'],
    'sim212-player-luck':       ['player', 'luck'],
    'sim212-player-luckmax':    ['player', 'luckInitial'],
    'sim212-player-gold':       ['player', 'gold'],
    'sim212-crew-strike':          ['crew', 'strike'],
    'sim212-crew-strikemax':       ['crew', 'strikeInitial'],
    'sim212-crew-strength':        ['crew', 'strength'],
    'sim212-crew-strengthmax':     ['crew', 'strengthInitial'],
    'sim212-enemy-skill':       ['enemyPerson', 'skill'],
    'sim212-enemy-stamina':     ['enemyPerson', 'stamina'],
    'sim212-enemy-staminamax':  ['enemyPerson', 'staminaMax'],
    'sim212-enemycrew-strike':          ['enemyCrew', 'strike'],
    'sim212-enemycrew-strength':        ['enemyCrew', 'strength'],
    'sim212-enemycrew-strengthmax':     ['enemyCrew', 'strengthMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = Math.max(0, val);
    if (id === 'sim212-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim212-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim212-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim212-crew-strike') val = Math.min(val, d.crew.strikeInitial);
    if (id === 'sim212-crew-strength') val = Math.min(val, d.crew.strengthInitial);
    if (id === 'sim212-enemy-stamina') val = Math.min(val, d.enemyPerson.staminaMax);
    if (id === 'sim212-enemycrew-strength') val = Math.min(val, d.enemyCrew.strengthMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim212-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim212-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim212-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim212-crew-strikemax') d.crew.strike = Math.min(d.crew.strike, val);
    if (id === 'sim212-crew-strengthmax') d.crew.strength = Math.min(d.crew.strength, val);
    if (id === 'sim212-enemy-staminamax') d.enemyPerson.stamina = Math.min(d.enemyPerson.stamina, val);
    if (id === 'sim212-enemycrew-strengthmax') d.enemyCrew.strength = Math.min(d.enemyCrew.strength, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim212-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim212-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim212-enemy-pick', 'sim212-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemyPerson.name = enemy.name;
    if (enemy.attack != null) d.enemyPerson.skill = enemy.attack;
    if (enemy.hp != null) { d.enemyPerson.stamina = enemy.hp; d.enemyPerson.staminaMax = enemy.hp; }
    d.roundsPerson = 0;
    saveState();
    _renderAll();
  });
  _setupEnemyAutocomplete('sim212-enemycrew-pick', 'sim212-enemycrew-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemyCrew.name = enemy.name;
    if (enemy.attack != null) d.enemyCrew.strike = enemy.attack;
    if (enemy.hp != null) { d.enemyCrew.strength = enemy.hp; d.enemyCrew.strengthMax = enemy.hp; }
    d.roundsCrew = 0;
    saveState();
    _renderAll();
  });
}
