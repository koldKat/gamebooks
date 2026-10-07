// Printed encounter effects apply only to newly started fights.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../core/state.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const HEALING_POTION_HEAL = 4;

// Rows: 1-9, then 0. Columns: Combat Ratio buckets -11..11, clamped at the extremes.
// Cells are [enemyLoss, playerLoss]; K means instant death.
const COMBAT_TABLE = [
  [[0,'K'], [0,'K'], [0,8], [0,6], [1,6], [2,5], [3,5], [4,5], [5,4], [6,4], [7,4], [8,3], [9,3]],
  [[0,'K'], [0,8],   [0,7], [1,6], [2,5], [3,5], [4,4], [5,4], [6,3], [7,3], [8,3], [9,3], [10,2]],
  [[0,8],   [0,7],   [1,6], [2,5], [3,5], [4,4], [5,4], [6,3], [7,3], [8,3], [9,2], [10,2], [11,2]],
  [[0,8],   [1,7],   [2,6], [3,5], [4,4], [5,4], [6,3], [7,3], [8,2], [9,2], [10,2], [11,2], [12,2]],
  [[1,7],   [2,6],   [3,5], [4,4], [5,4], [6,3], [7,2], [8,2], [9,2], [10,2], [11,2], [12,2], [14,1]],
  [[2,6],   [3,6],   [4,5], [5,4], [6,3], [7,2], [8,2], [9,2], [10,2], [11,1], [12,1], [14,1], [16,1]],
  [[3,5],   [4,5],   [5,4], [6,3], [7,2], [8,2], [9,1], [10,1], [11,1], [12,0], [14,0], [16,0], [18,0]],
  [[4,4],   [5,4],   [6,3], [7,2], [8,1], [9,1], [10,0], [11,0], [12,0], [14,0], [16,0], [18,0], ['K',0]],
  [[5,3],   [6,3],   [7,2], [8,0], [9,0], [10,0], [11,0], [12,0], [14,0], [16,0], [18,0], ['K',0], ['K',0]],
  [[6,0],   [7,0],   [8,0], [9,0], [10,0], [11,0], [12,0], [14,0], [16,0], [18,0], ['K',0], ['K',0], ['K',0]],
];

function _ratioCol(ratio) {
  if (ratio <= -11) return 0;
  if (ratio <= -9) return 1;
  if (ratio <= -7) return 2;
  if (ratio <= -5) return 3;
  if (ratio <= -3) return 4;
  if (ratio <= -1) return 5;
  if (ratio === 0) return 6;
  if (ratio <= 2) return 7;
  if (ratio <= 4) return 8;
  if (ratio <= 6) return 9;
  if (ratio <= 8) return 10;
  if (ratio <= 10) return 11;
  return 12;
}

function _pickRow(pick) { return pick === 0 ? 9 : pick - 1; }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim438) {
    pt.sim438 = {
      combatSkill: 0, combatSkillInitial: 0,
      endurance: 0, enduranceInitial: 0,
      attackModifier: 0,
      hasHealingPotion: true, healingPotionUsed: false,
      rolled: false,
      printedRules: 1,
      combatEffects: {},
      ratio: 0,
      enemy: { name: '', skill: 0, endurance: 0, enduranceMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim438;
  if (d.combatSkill === undefined) d.combatSkill = 0;
  if (d.combatSkillInitial === undefined) d.combatSkillInitial = 0;
  if (d.endurance === undefined) d.endurance = 0;
  if (d.enduranceInitial === undefined) d.enduranceInitial = 0;
  if (d.attackModifier === undefined) d.attackModifier = 0;
  if (d.hasHealingPotion === undefined) d.hasHealingPotion = true;
  if (d.healingPotionUsed === undefined) d.healingPotionUsed = false;
  if (d.rolled === undefined) d.rolled = false;
  if (d.ratio === undefined) d.ratio = 0;
  if (!d.enemy) d.enemy = { name: '', skill: 0, endurance: 0, enduranceMax: 0 };
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _pick10() { return Math.floor(Math.random() * 10); } // 0-9, "0 counts as zero"

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
}

const FIGHT_OPTIONS = ['tracking', 'animal', 'spirit', 'tutelary', 'weapon', 'shield'];
const BLAST_IMMUNE = [76,113,133,148,168,180,211,252,286,311];

function _captureFightEffects(d) {
  d.printedRules = 1;
  const section = Number(d.enemy.name.match(/§(\d+)/)?.[1]) || 0;
  d.combatEffects = { captured: true, section, phase: section === 274 && d.enemy.skill === 17 ? 1 : 0,
    initialEnemy: { ...d.enemy }, psychic: d.nextPsychic || 'none' };
  for (const option of FIGHT_OPTIONS) d.combatEffects[option] = !!d['next' + option[0].toUpperCase() + option.slice(1)];
  d.ratio = _effectiveSkill(d) - d.enemy.skill;
}

function _psychic(d) {
  const e = d.combatEffects;
  if (!e?.captured) return 'none';
  if (e.psychic === 'blast' && !BLAST_IMMUNE.includes(e.section)) return 'blast';
  if (e.psychic === 'surge' && d.endurance > 6) return 'surge';
  return 'none';
}

function _effectiveSkill(d) {
  let skill = d.combatSkill + (d.attackModifier || 0);
  const e = d.combatEffects;
  if (!e?.captured) return skill;
  const psychic = _psychic(d);
  let bonus = psychic === 'surge' ? 4 : psychic === 'blast' ? 2 : 0;
  if ([81,254].includes(e.section)) bonus *= e.spirit ? 3 : 2;
  skill += bonus;
  if (e.section === 28 && d.roundsThisBattle === 0 && !e.tracking) skill -= 3;
  if ([54,304].includes(e.section)) skill -= 3;
  if (e.section === 54 && !e.weapon || e.section === 336 && d.roundsThisBattle === 0) skill -= e.tutelary ? 2 : 4;
  if (e.section === 118 && e.animal || [168,245,288].includes(e.section)) skill += 2;
  if (e.section === 251 && d.roundsThisBattle === 0) skill += 2;
  if (e.section === 304 && e.shield) skill -= 2;
  return skill;
}

function _battleOver(d) {
  return !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0 || !!d.combatEffects?.finished;
}

function _setRoute(d, section) {
  d.combatEffects.finished = true;
  d.combatEffects.route = section;
  _appendLog(d, t('battlesim438.log.continue', { section }));
}

function _escapeRoute(d) {
  const e = d.combatEffects;
  if (!e?.captured) return 0;
  if (e.section === 81) return 340;
  if ([132,216].includes(e.section)) return 23;
  if (e.section === 113 && d.roundsThisBattle >= 3) return 229;
  if (e.section === 118 && d.roundsThisBattle >= 2) return 39;
  return 0;
}

function _escape() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  const route = _escapeRoute(d);
  if (!route) return;
  if ([113,118].includes(d.combatEffects.section)) _runRound(true);
  if (d.endurance > 0) _setRoute(d, route);
  saveState();
  _renderAll();
}

function _runRound(escaping = false) {
  const d = _data();
  if (!d || _battleOver(d)) return;
  escaping = escaping === true;
  const e = d.combatEffects || {};
  if (e.captured && (e.section === 41 && d.roundsThisBattle >= 3 || [187,336,349].includes(e.section) && d.roundsThisBattle >= 4)) {
    _setRoute(d, e.section === 41 ? 10 : 234);
    saveState();
    _renderAll();
    return;
  }
  const psychic = _psychic(d);
  if (e.captured) d.ratio = _effectiveSkill(d) - d.enemy.skill;
  d.roundsThisBattle++;

  const pick = _pick10();
  const col = _ratioCol(d.ratio);
  let [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  if (escaping) enemyLoss = 0;
  if (e.captured && e.section === 133 && enemyLoss !== 'K') enemyLoss *= 2;
  if (e.captured && e.section === 172 && lwLoss !== 'K') lwLoss /= 2;
  _appendLog(d, t('battlesim438.log.round', { round: d.roundsThisBattle, ratio: d.ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (lwLoss === 'K') d.endurance = 0;
  else d.endurance = Math.max(0, d.endurance - lwLoss);
  if (psychic === 'surge' && d.endurance > 0) {
    d.endurance = Math.max(0, d.endurance - 2);
    _appendLog(d, t('battlesim438.log.extra_loss', { n: 2 }));
  }

  _appendLog(d, t('battlesim438.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'K' ? t('battlesim438.log.k_word') : enemyLoss,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? t('battlesim438.log.k_word') : lwLoss,
    endurance: d.endurance, enduranceMax: d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  if (e.captured && !_battleOver(d)) {
    if (e.section === 41 && d.roundsThisBattle >= 3) _setRoute(d, 10);
    if ([187,336,349].includes(e.section) && d.roundsThisBattle >= 4) _setRoute(d, 234);
  }
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const e = d.combatEffects || {};
  if (d.printedRules && d.endurance <= 0) {
    _appendLog(d, t('battlesim438.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  } else if (e.captured && e.section === 286 && d.enemy.endurance <= 20) {
    _setRoute(d, 20);
  } else if (e.captured && e.section === 274 && e.phase === 0 && d.enemy.endurance <= 0) {
    e.phase = 1;
    d.enemy = { name: t('battlesim438.ui.second_enemy'), skill: 17, endurance: 29, enduranceMax: 29 };
    _appendLog(d, t('battlesim438.log.next_enemy'));
  } else if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim438.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    if (e.captured) {
      let route = { 2:332,23:239,33:145,41:326,54:237,76:34,81:268,109:162,113:300,
        115:297,118:239,119:84,132:170,133:156,143:56,148:206,168:156,170:239,
        172:217,208:145,211:87,216:170,251:271,252:305,254:220,274:68,288:44,
        304:72,311:34,312:178,315:84,318:332,320:162,344:271,348:177 }[e.section];
      if ([28,245].includes(e.section)) route = d.roundsThisBattle <= 4 ? 169 : 309;
      if (e.section === 126) route = d.roundsThisBattle <= 4 ? 11 : 321;
      if (e.section === 180) route = d.roundsThisBattle <= 2 ? 316 : 261;
      if ([187,336,349].includes(e.section)) route = 202;
      if (route) _setRoute(d, route);
    }
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim438.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  if (d.combatEffects?.initialEnemy) d.enemy = { ...d.combatEffects.initialEnemy };
  d.enemy.endurance = d.enemy.enduranceMax;
  d.endurance = d.enduranceInitial;
  _captureFightEffects(d);
  if (d.log.length) _appendLog(d, t('battlesim438.log.reset_sep'));
  _appendLog(d, t('battlesim438.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

function _usePotion() {
  const d = _data();
  if (!d || !d.rolled || !d.hasHealingPotion || d.healingPotionUsed) return;
  if (d.printedRules && d.endurance <= 0) return;
  if (d.roundsThisBattle > 0 && !_battleOver(d)) {
    showAlert(t('battlesim438.alert.potion_midfight'));
    return;
  }
  d.healingPotionUsed = true;
  const before = d.endurance;
  d.endurance = Math.min(d.enduranceInitial, d.endurance + HEALING_POTION_HEAL);
  _appendLog(d, t('battlesim438.log.potion', { before, endurance: d.endurance, enduranceMax: d.enduranceInitial }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">БУ:${e.attack ?? '?'} ТИ:${e.hp ?? '?'}</span></li>`
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
  _setVal('sim438-cs', d.combatSkill);
  _setVal('sim438-csmax', d.combatSkillInitial);
  _setVal('sim438-en', d.endurance);
  _setVal('sim438-enmax', d.enduranceInitial);
  _setVal('sim438-atkmod', d.attackModifier);
  _setVal('sim438-psychic', d.nextPsychic || 'none');
  for (const option of FIGHT_OPTIONS) document.getElementById('sim438-' + option).checked = !!d['next' + option[0].toUpperCase() + option.slice(1)];
  if (d.combatEffects?.captured && !_battleOver(d)) d.ratio = _effectiveSkill(d) - d.enemy.skill;
  _setVal('sim438-enemy-skill', d.enemy.skill);
  _setVal('sim438-enemy-en', d.enemy.endurance);
  _setVal('sim438-enemy-enmax', d.enemy.enduranceMax);
  _setVal('sim438-ratio', d.ratio);
  if (!skipEnemyPick) _setVal('sim438-enemy-pick', d.enemy.name);

  const potionBtn = document.getElementById('sim438-use-potion');
  potionBtn.disabled = !d.rolled || !d.hasHealingPotion || d.healingPotionUsed || !!d.printedRules && (d.endurance <= 0 || d.roundsThisBattle > 0 && !_battleOver(d));
  potionBtn.textContent = d.healingPotionUsed ? t('battlesim438.btn.used') : t('battlesim438.btn.drink');

  const rollBtn = document.getElementById('sim438-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim438.btn.rolled') : t('battlesim438.btn.roll');

  const status = document.getElementById('sim438-status');
  if (!d.rolled) {
    status.textContent = t('battlesim438.status.not_ready');
  } else if (d.endurance <= 0) {
    status.textContent = t('battlesim438.status.fallen');
  } else if (d.combatEffects?.finished) {
    status.textContent = t('battlesim438.log.continue', { section: d.combatEffects.route });
  } else if (d.enemy.endurance <= 0 && d.enemy.enduranceMax > 0) {
    status.textContent = t('battlesim438.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim438-round').disabled = _battleOver(d);
  const escape = document.getElementById('sim438-escape');
  escape.hidden = !_escapeRoute(d);
  escape.disabled = _battleOver(d);
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim438-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim438-history-summary');
  const listEl = document.getElementById('sim438-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim438.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim438.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim438.history.won') : t('battlesim438.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim438() {
  const overlay = document.getElementById('sim438-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim438(); return; }
  _renderAll();
}

function openSim438() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim438-overlay').classList.add('active');
}

function closeSim438() {
  document.getElementById('sim438-overlay')?.classList.remove('active');
}

export function setSim438Visible(visible) {
  const btn = document.getElementById('sim438-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim438();
}

// ── Init ──────────────────────────────────────────────────────────────────────

function _numField(label, id, width, readonly) {
  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <div class="inv-qty-wrap">
        ${readonly ? '' : `<button class="inv-qty-btn" data-id="${id}" data-delta="-1">−</button>`}
        <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric"${readonly ? ' readonly' : ''}${width ? ` style="width:${width}"` : ''}>
        ${readonly ? '' : `<button class="inv-qty-btn" data-id="${id}" data-delta="1">+</button>`}
      </div>
    </div>`;
}

export function initSim438() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim438-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim438.ui.title')}</span>
        <button id="sim438-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim438-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim438.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim438.ui.cs'), 'sim438-cs')}
            ${_numField(t('battlesim438.ui.cs_initial'), 'sim438-csmax')}
            ${_numField(t('battlesim438.ui.en'), 'sim438-en')}
            ${_numField(t('battlesim438.ui.en_initial'), 'sim438-enmax')}
            ${_numField(t('battlesim438.ui.atkmod'), 'sim438-atkmod')}
            <details class="bsim-history">
              <summary>${t('battlesim438.ui.next_fight')}</summary>
              <p>${t('battlesim438.ui.options_hint')}</p>
              <div class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim438.ui.psychic')}</span><select id="sim438-psychic" class="inv-edit-input"><option value="none">${t('battlesim438.ui.none')}</option><option value="blast">${t('battlesim438.ui.blast')}</option><option value="surge">${t('battlesim438.ui.surge')}</option></select></div>
              ${FIGHT_OPTIONS.map(id => `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim438.ui.' + id)}</span><input type="checkbox" id="sim438-${id}"></label>`).join('')}
            </details>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim438.ui.potion')}</span>
              <button id="sim438-use-potion" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim438.btn.drink')}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim438.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim438-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim438-enemy-pick-dropdown">
                <ul id="sim438-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim438.ui.enemy_cs'), 'sim438-enemy-skill')}
            ${_numField(t('battlesim438.ui.enemy_en'), 'sim438-enemy-en')}
            ${_numField(t('battlesim438.ui.enemy_en_max'), 'sim438-enemy-enmax')}
            ${_numField(t('battlesim438.ui.ratio'), 'sim438-ratio', null, true)}
          </div>
          <div id="sim438-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim438-round" class="inv-add-btn bsim-action-primary">${t('battlesim438.btn.round')}</button>
            <button id="sim438-escape" class="inv-add-btn" hidden>${t('battlesim438.btn.escape')}</button>
            <button id="sim438-reset" class="inv-add-btn">${t('battlesim438.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim438-history-summary">${t('battlesim438.history.summary', { n: 0 })}</summary>
            <div id="sim438-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim438-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim438-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim438);
  document.getElementById('sim438-close').addEventListener('click', closeSim438);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim438(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim438-overlay'),
    open:  openSim438,
    close: closeSim438,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim438();
  });

  document.getElementById('sim438-round').addEventListener('click', _runRound);
  document.getElementById('sim438-escape').addEventListener('click', _escape);
  document.getElementById('sim438-psychic').addEventListener('change', event => {
    const d = _data();
    if (!d) return;
    d.nextPsychic = event.target.value;
    saveState();
  });
  for (const option of FIGHT_OPTIONS) document.getElementById('sim438-' + option).addEventListener('change', event => {
    const d = _data();
    if (!d) return;
    d['next' + option[0].toUpperCase() + option.slice(1)] = event.target.checked;
    saveState();
  });
  document.getElementById('sim438-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim438-use-potion').addEventListener('click', _usePotion);

  document.getElementById('sim438-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.combatSkillInitial = _pick10() + 10;
    d.enduranceInitial   = _pick10() + 20;
    d.combatSkill = d.combatSkillInitial;
    d.endurance   = d.enduranceInitial;
    d.rolled = true;
    d.ratio  = _effectiveSkill(d) - d.enemy.skill;
    _appendLog(d, t('battlesim438.log.rolled', { cs: d.combatSkillInitial, en: d.enduranceInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim438-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim438-enemy-pick', 'sim438-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name          = enemy.name;
    d.enemy.skill          = enemy.attack ?? 0;
    d.enemy.endurance      = enemy.hp ?? 0;
    d.enemy.enduranceMax   = enemy.hp ?? 0;
    d.roundsThisBattle     = 0;
    _captureFightEffects(d);
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim438-cs': ['combatSkill'], 'sim438-csmax': ['combatSkillInitial'],
    'sim438-en': ['endurance'], 'sim438-enmax': ['enduranceInitial'],
    'sim438-atkmod': ['attackModifier'],
    'sim438-enemy-skill': ['enemy', 'skill'], 'sim438-enemy-en': ['enemy', 'endurance'], 'sim438-enemy-enmax': ['enemy', 'enduranceMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const allowNegative = id === 'sim438-atkmod';
      const parse = id === 'sim438-en' || id === 'sim438-enmax' ? parseFloat : parseInt;
      const val = allowNegative ? (parse(input.value, 10) || 0) : Math.max(0, parse(input.value, 10) || 0);
      if (path.length === 1) d[path[0]] = val;
      else d[path[0]][path[1]] = val;
      if (id === 'sim438-cs' || id === 'sim438-atkmod' || id === 'sim438-enemy-skill') d.ratio = _effectiveSkill(d) - d.enemy.skill;
      saveState();
      _renderInputs(true);
    });
  }
  overlay.querySelectorAll('.inv-qty-btn').forEach(btn2 => {
    btn2.addEventListener('click', () => {
      const input = document.getElementById(btn2.dataset.id);
      if (!input) return;
      const delta = parseInt(btn2.dataset.delta, 10);
      input.value = (parseFloat(input.value) || 0) + delta;
      input.dispatchEvent(new Event('change'));
    });
  });
}
