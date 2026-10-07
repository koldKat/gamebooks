// Jungle of Horrors: encounter rules are captured only for newly started fights.

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
  if (!pt.sim436) {
    pt.sim436 = {
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
  const d = pt.sim436;
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

function _captureFightEffects(d) {
  d.printedRules = 1;
  const section = Number(d.enemy.name.match(/§(\d+)/)?.[1]) || 0;
  d.combatEffects = {
    captured: true, section, initialEnemy: { ...d.enemy },
    psychic: d.nextPsychic || 'none',
    tracking: !!d.nextTracking, animal: !!d.nextAnimal,
    shield: !!d.nextShield, spirit: !!d.nextSpirit,
    curing: !!d.nextCuring, nexus: !!d.nextNexus,
    primate: !!d.nextPrimate, tutelary: !!d.nextTutelary,
    secondVordak: [13,287].includes(section) && /1\s*§/.test(d.enemy.name),
  };
  d.ratio = _effectiveSkill(d) - d.enemy.skill;
}

function _psychic(d) {
  const e = d.combatEffects;
  if (!e?.captured || [74,159,199,339].includes(e.section)) return 'none';
  if (e.psychic === 'blast' && ![8,13,30,47,101,110,169,183,257,287,308,323,333].includes(e.section)) return 'blast';
  if (e.psychic === 'surge' && d.endurance > 6) return 'surge';
  return 'none';
}

function _effectiveSkill(d) {
  let skill = d.combatSkill + (d.attackModifier || 0);
  const e = d.combatEffects;
  if (!e?.captured) return skill;
  if (e.section === 74) return 15;
  const psychic = _psychic(d);
  skill += (psychic === 'surge' ? 4 : psychic === 'blast' ? 2 : 0) * (e.section === 52 ? 3 : 1);
  if ([8,101].includes(e.section) && !e.animal) skill -= 3;
  if ([13,169,287,333].includes(e.section) && !e.shield) skill -= 2;
  if ([30,47,183,308].includes(e.section) && e.spirit) skill += 2;
  if (e.section === 41) skill += 5;
  if ([88,106,162].includes(e.section) && e.animal) skill += 2;
  if (e.section === 169 || [252,323].includes(e.section) && d.roundsThisBattle < 2) skill -= e.tutelary ? 2 : 4;
  if (e.section === 298 && d.roundsThisBattle < 2 && !e.tracking) skill -= 3;
  if (e.section === 313 && !e.tracking) skill -= 4;
  if (e.section === 339 && !(e.nexus && e.primate)) skill -= 8;
  return skill;
}

function _battleOver(d) {
  return !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0 || !!d.combatEffects?.finished;
}

function _setRoute(d, section) {
  d.combatEffects.finished = true;
  d.combatEffects.route = section;
  _appendLog(d, t('battlesim436.log.continue', { section }));
}

function _escapeRoute(d) {
  const e = d.combatEffects;
  if (!e?.captured || d.roundsThisBattle < 3) return 0;
  if ([38,205,346].includes(e.section)) return 309;
  if ([110,323].includes(e.section)) return 191;
  if (e.section === 339) return 48;
  return 0;
}

function _escape() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  const route = _escapeRoute(d);
  if (!route) return;
  _runRound(true);
  if (d.endurance > 0) _setRoute(d, route);
  saveState();
  _renderAll();
}

function _runRound(escaping = false) {
  const d = _data();
  if (!d || _battleOver(d)) return;
  escaping = escaping === true;
  const e = d.combatEffects || {};
  if (e.captured && e.section === 13 && d.roundsThisBattle >= 6) {
    _setRoute(d, 158);
    saveState();
    _renderAll();
    return;
  }
  if (e.captured && [30,47,183,308].includes(e.section) && !e.shield) {
    d.endurance = Math.max(0, d.endurance - 2);
    _appendLog(d, t('battlesim436.log.extra_loss', { n: 2 }));
    if (d.endurance <= 0) {
      _checkBattleEnd(d);
      saveState();
      _renderAll();
      return;
    }
  }
  const psychic = _psychic(d);
  d.ratio = e.captured ? _effectiveSkill(d) - d.enemy.skill : d.ratio;
  d.roundsThisBattle++;

  const pick = _pick10();
  const col = _ratioCol(d.ratio);
  let [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  if (escaping || e.captured && e.section === 183 && d.roundsThisBattle === 1) enemyLoss = 0;
  if (e.captured) {
    if ([8,13,30,287,308].includes(e.section) && enemyLoss !== 'K') enemyLoss *= 2;
    if (e.section === 251 && d.roundsThisBattle === 1) lwLoss = 0;
    if (lwLoss !== 'K') {
      if (e.section === 52 || e.section === 155 && !(e.curing && e.primate)) lwLoss *= 2;
      if ([159,199].includes(e.section)) lwLoss /= 2;
    }
  }
  _appendLog(d, t('battlesim436.log.round', { round: d.roundsThisBattle, ratio: d.ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (lwLoss === 'K') d.endurance = 0;
  else d.endurance = Math.max(0, d.endurance - lwLoss);
  if (psychic === 'surge' && d.endurance > 0) {
    d.endurance = Math.max(0, d.endurance - 2);
    _appendLog(d, t('battlesim436.log.extra_loss', { n: 2 }));
  }

  _appendLog(d, t('battlesim436.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'K' ? t('battlesim436.log.k_word') : enemyLoss,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? t('battlesim436.log.k_word') : lwLoss,
    endurance: d.endurance, enduranceMax: d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  if (e.captured && !_battleOver(d) && e.section === 257 && d.roundsThisBattle >= 2) _setRoute(d, 163);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const e = d.combatEffects || {};
  if (d.printedRules && d.endurance <= 0) {
    _appendLog(d, t('battlesim436.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  } else if (d.enemy.endurance <= 0 && e.secondVordak) {
    e.secondVordak = false;
    d.enemy = { name: t('battlesim436.ui.second_vordak', { section: e.section }), skill: 21, endurance: 26, enduranceMax: 26 };
    _appendLog(d, t('battlesim436.log.second_vordak'));
  } else if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim436.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    if (e.captured) {
      const route = { 8:202,13:79,30:268,38:9,40:87,41:106,47:195,52:129,74:254,
        88:144,101:202,106:247,110:293,155:62,159:46,162:144,164:328,169:337,
        183:268,199:46,205:9,231:328,233:321,241:231,251:87,252:313,257:12,
        265:313,287:79,298:321,305:231,308:195,313:160,323:293,333:197,339:344,346:9 }[e.section];
      if (route) _setRoute(d, route);
    }
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim436.log.fallen', { skull: SVG_SKULL }));
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
  if (d.log.length) _appendLog(d, t('battlesim436.log.reset_sep'));
  _appendLog(d, t('battlesim436.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

function _usePotion() {
  const d = _data();
  if (!d || !d.rolled || !d.hasHealingPotion || d.healingPotionUsed) return;
  if (d.printedRules && d.endurance <= 0) return;
  if (d.roundsThisBattle > 0 && !_battleOver(d)) {
    showAlert(t('battlesim436.alert.potion_midfight'));
    return;
  }
  d.healingPotionUsed = true;
  const before = d.endurance;
  d.endurance = Math.min(d.enduranceInitial, d.endurance + HEALING_POTION_HEAL);
  _appendLog(d, t('battlesim436.log.potion', { before, endurance: d.endurance, enduranceMax: d.enduranceInitial }));
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
  _setVal('sim436-cs', d.combatSkill);
  _setVal('sim436-csmax', d.combatSkillInitial);
  _setVal('sim436-en', d.endurance);
  _setVal('sim436-enmax', d.enduranceInitial);
  _setVal('sim436-atkmod', d.attackModifier);
  _setVal('sim436-psychic', d.nextPsychic || 'none');
  for (const [id, key] of [['tracking','nextTracking'],['animal','nextAnimal'],['shield','nextShield'],['spirit','nextSpirit'],['curing','nextCuring'],['nexus','nextNexus'],['primate','nextPrimate'],['tutelary','nextTutelary']]) {
    const input = document.getElementById('sim436-' + id);
    if (input) input.checked = !!d[key];
  }
  _setVal('sim436-enemy-skill', d.enemy.skill);
  _setVal('sim436-enemy-en', d.enemy.endurance);
  _setVal('sim436-enemy-enmax', d.enemy.enduranceMax);
  _setVal('sim436-ratio', d.combatEffects?.captured ? _effectiveSkill(d) - d.enemy.skill : d.ratio);
  if (!skipEnemyPick || [13,287].includes(d.combatEffects?.section)) _setVal('sim436-enemy-pick', d.enemy.name);

  const potionBtn = document.getElementById('sim436-use-potion');
  potionBtn.disabled = !d.rolled || !d.hasHealingPotion || d.healingPotionUsed;
  if (d.printedRules) potionBtn.disabled ||= d.endurance <= 0 || d.roundsThisBattle > 0 && !_battleOver(d);
  potionBtn.textContent = d.healingPotionUsed ? t('battlesim436.btn.used') : t('battlesim436.btn.drink');

  const rollBtn = document.getElementById('sim436-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim436.btn.rolled') : t('battlesim436.btn.roll');

  const status = document.getElementById('sim436-status');
  if (!d.rolled) {
    status.textContent = t('battlesim436.status.not_ready');
  } else if (d.endurance <= 0) {
    status.textContent = t('battlesim436.status.fallen');
  } else if (d.combatEffects?.finished) {
    status.textContent = t('battlesim436.log.continue', { section: d.combatEffects.route });
  } else if (d.enemy.endurance <= 0 && d.enemy.enduranceMax > 0) {
    status.textContent = t('battlesim436.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim436-round').disabled = _battleOver(d);
  const escapeBtn = document.getElementById('sim436-escape');
  if (escapeBtn) escapeBtn.disabled = _battleOver(d) || !_escapeRoute(d);
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim436-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim436-history-summary');
  const listEl = document.getElementById('sim436-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim436.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim436.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim436.history.won') : t('battlesim436.history.lost');
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

export function renderSim436() {
  const overlay = document.getElementById('sim436-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim436(); return; }
  _renderAll();
}

function openSim436() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim436-overlay').classList.add('active');
}

function closeSim436() {
  document.getElementById('sim436-overlay')?.classList.remove('active');
}

export function setSim436Visible(visible) {
  const btn = document.getElementById('sim436-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim436();
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

export function initSim436() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim436-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim436.ui.title')}</span>
        <button id="sim436-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim436-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim436.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim436.ui.cs'), 'sim436-cs')}
            ${_numField(t('battlesim436.ui.cs_initial'), 'sim436-csmax')}
            ${_numField(t('battlesim436.ui.en'), 'sim436-en')}
            ${_numField(t('battlesim436.ui.en_initial'), 'sim436-enmax')}
            ${_numField(t('battlesim436.ui.atkmod'), 'sim436-atkmod')}
            <details class="bsim-history">
              <summary>${t('battlesim436.ui.next_fight')}</summary>
              <p class="bsim-history-empty">${t('battlesim436.ui.effects_hint')}</p>
              <div class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim436.ui.psychic')}</span><select id="sim436-psychic" class="inv-edit-input"><option value="none">${t('battlesim436.ui.none')}</option><option value="blast">${t('battlesim436.ui.blast')}</option><option value="surge">${t('battlesim436.ui.surge')}</option></select></div>
              ${['tracking','animal','shield','spirit','curing','nexus','primate','tutelary'].map(id => `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim436.ui.' + id)}</span><input type="checkbox" id="sim436-${id}"></label>`).join('')}
            </details>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim436.ui.potion')}</span>
              <button id="sim436-use-potion" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim436.btn.drink')}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim436.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim436-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim436-enemy-pick-dropdown">
                <ul id="sim436-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim436.ui.enemy_cs'), 'sim436-enemy-skill')}
            ${_numField(t('battlesim436.ui.enemy_en'), 'sim436-enemy-en')}
            ${_numField(t('battlesim436.ui.enemy_en_max'), 'sim436-enemy-enmax')}
            ${_numField(t('battlesim436.ui.ratio'), 'sim436-ratio', null, true)}
          </div>
          <div id="sim436-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim436-round" class="inv-add-btn bsim-action-primary">${t('battlesim436.btn.round')}</button>
            <button id="sim436-escape" class="inv-add-btn">${t('battlesim436.btn.escape')}</button>
            <button id="sim436-reset" class="inv-add-btn">${t('battlesim436.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim436-history-summary">${t('battlesim436.history.summary', { n: 0 })}</summary>
            <div id="sim436-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim436-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim436-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim436);
  document.getElementById('sim436-close').addEventListener('click', closeSim436);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim436(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim436-overlay'),
    open:  openSim436,
    close: closeSim436,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim436();
  });

  document.getElementById('sim436-round').addEventListener('click', _runRound);
  document.getElementById('sim436-escape').addEventListener('click', _escape);
  document.getElementById('sim436-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim436-use-potion').addEventListener('click', _usePotion);
  document.getElementById('sim436-psychic').addEventListener('change', event => {
    const d = _data();
    if (!d) return;
    d.nextPsychic = ['none','blast','surge'].includes(event.target.value) ? event.target.value : 'none';
    saveState();
  });
  for (const [id, key] of [['tracking','nextTracking'],['animal','nextAnimal'],['shield','nextShield'],['spirit','nextSpirit'],['curing','nextCuring'],['nexus','nextNexus'],['primate','nextPrimate'],['tutelary','nextTutelary']]) {
    document.getElementById('sim436-' + id).addEventListener('change', event => {
      const d = _data();
      if (!d) return;
      d[key] = event.target.checked;
      saveState();
    });
  }

  document.getElementById('sim436-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.combatSkillInitial = _pick10() + 10;
    d.enduranceInitial   = _pick10() + 20;
    d.combatSkill = d.combatSkillInitial;
    d.endurance   = d.enduranceInitial;
    d.rolled = true;
    d.ratio  = _effectiveSkill(d) - d.enemy.skill;
    _appendLog(d, t('battlesim436.log.rolled', { cs: d.combatSkillInitial, en: d.enduranceInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim436-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim436-enemy-pick', 'sim436-enemy-pick-dropdown', enemy => {
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
    'sim436-cs': ['combatSkill'], 'sim436-csmax': ['combatSkillInitial'],
    'sim436-en': ['endurance'], 'sim436-enmax': ['enduranceInitial'],
    'sim436-atkmod': ['attackModifier'],
    'sim436-enemy-skill': ['enemy', 'skill'], 'sim436-enemy-en': ['enemy', 'endurance'], 'sim436-enemy-enmax': ['enemy', 'enduranceMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const allowNegative = id === 'sim436-atkmod';
      const parse = d.printedRules && id === 'sim436-en' ? parseFloat : value => parseInt(value, 10);
      const val = allowNegative ? (parse(input.value) || 0) : Math.max(0, parse(input.value) || 0);
      if (path.length === 1) d[path[0]] = val;
      else d[path[0]][path[1]] = val;
      if (id === 'sim436-cs' || id === 'sim436-atkmod' || id === 'sim436-enemy-skill') d.ratio = _effectiveSkill(d) - d.enemy.skill;
      saveState();
      _renderInputs(true);
    });
  }
  overlay.querySelectorAll('.inv-qty-btn').forEach(btn2 => {
    btn2.addEventListener('click', () => {
      const input = document.getElementById(btn2.dataset.id);
      if (!input) return;
      const delta = parseInt(btn2.dataset.delta, 10);
      const d = _data();
      const value = d?.printedRules && btn2.dataset.id === 'sim436-en' ? parseFloat(input.value) : parseInt(input.value, 10);
      input.value = (value || 0) + delta;
      input.dispatchEvent(new Event('change'));
    });
  });
}
