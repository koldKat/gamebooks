// Battle Simulator (Царствата на терора / Kingdoms of Terror, Bulgarian edition of Lone Wolf book
// 6, id 434)
// Combat Ratio is fixed on enemy selection; a 0-9 pick selects simultaneous table losses.
// 'K' means instant death. Skill bonuses and narrative effects are entered manually.

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
  if (!pt.sim434) {
    pt.sim434 = {
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
  const d = pt.sim434;
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
    captured: true, section,
    psychic: d.nextPsychic || 'none',
    animal: !!d.nextAnimal, tracking: !!d.nextTracking, nexus: !!d.nextNexus,
    sommerwerd: !!d.nextSommerwerd,
    bowMastery: !!d.nextBowMastery, jackan: !!d.nextJackan,
    bowModifier: Number(d.nextBowModifier) || 0,
    ...(section === 26 ? { targetPoints: 50 } : {}),
  };
  if (section === 26) d.enemy.endurance = d.enemy.enduranceMax = 50;
  d.ratio = _effectiveSkill(d) - d.enemy.skill;
}

function _health(d) { return d.combatEffects?.section === 26 ? d.combatEffects.targetPoints : d.endurance; }
function _battleOver(d) { return !d.rolled || _health(d) <= 0 || d.enemy.endurance <= 0 || !!d.combatEffects?.finished; }

function _effectiveSkill(d) {
  const effects = d.combatEffects;
  if (!effects?.captured) return d.combatSkill + (d.attackModifier || 0);
  const section = effects.section;
  if (section === 26) return d.combatSkill + effects.bowModifier + (effects.bowMastery ? 3 : 0) - (effects.jackan ? 2 : 0);
  let skill = d.combatSkill + (d.attackModifier || 0);
  if (effects.psychic === 'blast' && ![77,270,344].includes(section)) skill += 2;
  if (effects.psychic === 'surge' && d.endurance > 6 && ![270,344].includes(section)) skill += 4;
  if (section === 114 && d.roundsThisBattle === 0) skill += 2;
  if (section === 155 && d.roundsThisBattle === 0) skill -= 4;
  if (section === 254 && d.roundsThisBattle === 0 && !effects.tracking) skill -= 2;
  if (section === 270 && d.roundsThisBattle < 2 && !effects.tracking) skill -= 2;
  if (effects.animal && [71,194].includes(section)) skill += 2;
  if (effects.animal && [164,283].includes(section)) skill++;
  return skill;
}

function _setRoute(d, section) {
  d.combatEffects.finished = true;
  d.combatEffects.route = section;
  _appendLog(d, t('battlesim434.log.continue', { section }));
}

function _escapeRoute(d) {
  const section = d.combatEffects?.section;
  if ([12,343].includes(section)) return section === 12 || d.roundsThisBattle >= 3 ? 305 : 0;
  if (section === 155) return d.roundsThisBattle >= 4 ? 305 : 0;
  if ([37,71,208].includes(section)) return 279;
  if (section === 42) return 70;
  if (section === 92) return 286;
  if (section === 215) return d.roundsThisBattle >= 2 ? 286 : 0;
  if (section === 194) return 289;
  if (section === 116 && d.roundsThisBattle === 0) return 105;
  if (section === 337 && d.roundsThisBattle === 0) return 191;
  return 0;
}

function _escape() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  if (d.combatEffects?.section === 156) { _setRoute(d, 339); saveState(); _renderAll(); return; }
  const route = _escapeRoute(d);
  if (!route) return;
  _runRound(true);
  if (_health(d) > 0) _setRoute(d, route);
  saveState();
  _renderAll();
}

function _runRound(escaping = false) {
  const d = _data();
  if (!d || _battleOver(d)) return;
  const effects = d.combatEffects || {};
  // Click handlers pass an Event, not the explicit escape flag.
  escaping = escaping === true;
  const ratio = effects.captured ? _effectiveSkill(d) - d.enemy.skill : d.ratio;
  d.roundsThisBattle++;

  const pick = _pick10();
  if (effects.section === 26 && effects.jackan && pick === 0) {
    _setRoute(d, 335); saveState(); _renderAll(); return;
  }
  const col = _ratioCol(ratio);
  let [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  if (escaping) enemyLoss = 0;
  if (effects.section === 12 && d.roundsThisBattle <= 2) lwLoss = 0;
  if (effects.section === 270 && effects.sommerwerd && enemyLoss !== 'K') enemyLoss *= 2;
  _appendLog(d, t('battlesim434.log.round', { round: d.roundsThisBattle, ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (effects.section === 26) effects.targetPoints = lwLoss === 'K' ? 0 : Math.max(0, effects.targetPoints - lwLoss);
  else {
    if (lwLoss === 'K') d.endurance = 0;
    else d.endurance = Math.max(0, d.endurance - lwLoss);
    const extra = (effects.section === 270 && !effects.nexus ? 2 : 0) +
      (effects.captured && effects.psychic === 'surge' && ![270,344].includes(effects.section) && d.endurance + (lwLoss === 'K' ? 0 : lwLoss) > 6 ? 2 : 0);
    if (extra && d.endurance > 0) {
      d.endurance = Math.max(0, d.endurance - extra);
      _appendLog(d, t('battlesim434.log.extra_loss', { n: extra }));
    }
  }

  _appendLog(d, t('battlesim434.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'K' ? t('battlesim434.log.k_word') : enemyLoss,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? t('battlesim434.log.k_word') : lwLoss,
    endurance: _health(d), enduranceMax: effects.section === 26 ? 50 : d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const effects = d.combatEffects || {};
  if (d.printedRules && _health(d) <= 0) {
    _appendLog(d, t('battlesim434.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    if (effects.section === 26) _setRoute(d, 183);
  } else if (effects.section === 78 && d.enemy.endurance <= 11) {
    _setRoute(d, 180);
  } else if (effects.section === 344 && d.enemy.endurance <= 25) {
    _setRoute(d, 310);
  } else if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim434.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    if (effects.captured) {
      const timed = { 92: [77,215], 201: [15,87] }[effects.section];
      const route = timed ? timed[d.roundsThisBattle <= 3 ? 0 : 1] : {26:252,78:180,156:200,344:310}[effects.section];
      if (route) _setRoute(d, route);
    }
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim434.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.endurance = d.enemy.enduranceMax;
  d.endurance = d.enduranceInitial;
  _captureFightEffects(d);
  if (d.log.length) _appendLog(d, t('battlesim434.log.reset_sep'));
  _appendLog(d, t('battlesim434.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

function _usePotion() {
  const d = _data();
  if (!d || !d.rolled || !d.hasHealingPotion || d.healingPotionUsed) return;
  if (d.printedRules && d.endurance <= 0) return;
  if (d.roundsThisBattle > 0 && !_battleOver(d)) {
    showAlert(t('battlesim434.alert.potion_midfight'));
    return;
  }
  d.healingPotionUsed = true;
  const before = d.endurance;
  d.endurance = Math.min(d.enduranceInitial, d.endurance + HEALING_POTION_HEAL);
  _appendLog(d, t('battlesim434.log.potion', { before, endurance: d.endurance, enduranceMax: d.enduranceInitial }));
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
  _setVal('sim434-cs', d.combatSkill);
  _setVal('sim434-csmax', d.combatSkillInitial);
  _setVal('sim434-en', d.endurance);
  _setVal('sim434-enmax', d.enduranceInitial);
  _setVal('sim434-atkmod', d.attackModifier);
  _setVal('sim434-enemy-skill', d.enemy.skill);
  _setVal('sim434-enemy-en', d.enemy.endurance);
  _setVal('sim434-enemy-enmax', d.enemy.enduranceMax);
  _setVal('sim434-ratio', d.ratio);
  if (d.combatEffects?.captured) _setVal('sim434-ratio', _effectiveSkill(d) - d.enemy.skill);
  for (const [id, field] of [['animal', 'nextAnimal'], ['tracking', 'nextTracking'], ['nexus', 'nextNexus'], ['sommerwerd', 'nextSommerwerd'], ['bow-mastery', 'nextBowMastery'], ['jackan', 'nextJackan']]) {
    const input = document.getElementById('sim434-' + id);
    if (input) input.checked = !!d[field];
  }
  _setVal('sim434-psychic', d.nextPsychic || 'none');
  _setVal('sim434-bow-modifier', d.nextBowModifier || 0);
  if (!skipEnemyPick) _setVal('sim434-enemy-pick', d.enemy.name);

  const potionBtn = document.getElementById('sim434-use-potion');
  potionBtn.disabled = !d.rolled || !d.hasHealingPotion || d.healingPotionUsed ||
    (d.printedRules && (d.endurance <= 0 || d.endurance >= d.enduranceInitial)) ||
    (d.roundsThisBattle > 0 && !_battleOver(d));
  potionBtn.textContent = d.healingPotionUsed ? t('battlesim434.btn.used') : t('battlesim434.btn.drink');

  const rollBtn = document.getElementById('sim434-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim434.btn.rolled') : t('battlesim434.btn.roll');

  const status = document.getElementById('sim434-status');
  if (!d.rolled) {
    status.textContent = t('battlesim434.status.not_ready');
  } else if (d.combatEffects?.route) {
    status.textContent = t('battlesim434.log.continue', { section: d.combatEffects.route });
  } else if (_health(d) <= 0) {
    status.textContent = t('battlesim434.status.fallen');
  } else if (d.enemy.endurance <= 0 && d.enemy.enduranceMax > 0) {
    status.textContent = t('battlesim434.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = d.combatEffects?.section === 26 ? t('battlesim434.status.targets', { n: d.combatEffects.targetPoints }) : '';
  }
  document.getElementById('sim434-round').disabled = _battleOver(d);
  const escapeBtn = document.getElementById('sim434-escape');
  if (escapeBtn) escapeBtn.disabled = _battleOver(d) || (!(_escapeRoute(d)) && d.combatEffects?.section !== 156);
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim434-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim434-history-summary');
  const listEl = document.getElementById('sim434-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim434.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim434.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim434.history.won') : t('battlesim434.history.lost');
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

export function renderSim434() {
  const overlay = document.getElementById('sim434-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim434(); return; }
  _renderAll();
}

function openSim434() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim434-overlay').classList.add('active');
}

function closeSim434() {
  document.getElementById('sim434-overlay')?.classList.remove('active');
}

export function setSim434Visible(visible) {
  const btn = document.getElementById('sim434-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim434();
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

export function initSim434() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim434-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim434.ui.title')}</span>
        <button id="sim434-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim434-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim434.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim434.ui.cs'), 'sim434-cs')}
            ${_numField(t('battlesim434.ui.cs_initial'), 'sim434-csmax')}
            ${_numField(t('battlesim434.ui.en'), 'sim434-en')}
            ${_numField(t('battlesim434.ui.en_initial'), 'sim434-enmax')}
            ${_numField(t('battlesim434.ui.atkmod'), 'sim434-atkmod')}
            <details class="bsim-history">
              <summary>${t('battlesim434.ui.next_fight')}</summary>
              <p class="bsim-history-empty">${t('battlesim434.ui.effects_hint')}</p>
              <div class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim434.ui.psychic')}</span><select id="sim434-psychic" class="inv-edit-input"><option value="none">${t('battlesim434.ui.none')}</option><option value="blast">${t('battlesim434.ui.blast')}</option><option value="surge">${t('battlesim434.ui.surge')}</option></select></div>
              ${['animal', 'tracking', 'nexus', 'sommerwerd', 'bow-mastery', 'jackan'].map(id => `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim434.ui.' + id)}</span><input type="checkbox" id="sim434-${id}"></label>`).join('')}
              ${_numField(t('battlesim434.ui.bow_modifier'), 'sim434-bow-modifier')}
            </details>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim434.ui.potion')}</span>
              <button id="sim434-use-potion" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim434.btn.drink')}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim434.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim434-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim434-enemy-pick-dropdown">
                <ul id="sim434-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim434.ui.enemy_cs'), 'sim434-enemy-skill')}
            ${_numField(t('battlesim434.ui.enemy_en'), 'sim434-enemy-en')}
            ${_numField(t('battlesim434.ui.enemy_en_max'), 'sim434-enemy-enmax')}
            ${_numField(t('battlesim434.ui.ratio'), 'sim434-ratio', null, true)}
          </div>
          <div id="sim434-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim434-round" class="inv-add-btn bsim-action-primary">${t('battlesim434.btn.round')}</button>
            <button id="sim434-escape" class="inv-add-btn">${t('battlesim434.btn.escape')}</button>
            <button id="sim434-reset" class="inv-add-btn">${t('battlesim434.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim434-history-summary">${t('battlesim434.history.summary', { n: 0 })}</summary>
            <div id="sim434-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim434-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim434-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim434);
  document.getElementById('sim434-close').addEventListener('click', closeSim434);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim434(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim434-overlay'),
    open:  openSim434,
    close: closeSim434,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim434();
  });

  document.getElementById('sim434-round').addEventListener('click', _runRound);
  document.getElementById('sim434-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim434-use-potion').addEventListener('click', _usePotion);
  document.getElementById('sim434-escape').addEventListener('click', _escape);
  for (const [id, field] of [['animal', 'nextAnimal'], ['tracking', 'nextTracking'], ['nexus', 'nextNexus'], ['sommerwerd', 'nextSommerwerd'], ['bow-mastery', 'nextBowMastery'], ['jackan', 'nextJackan']]) {
    document.getElementById('sim434-' + id).addEventListener('change', e => {
      const d = _data();
      if (!d) return;
      d[field] = e.target.checked;
      saveState();
    });
  }
  document.getElementById('sim434-psychic').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.nextPsychic = ['none', 'blast', 'surge'].includes(e.target.value) ? e.target.value : 'none';
    saveState();
  });
  document.getElementById('sim434-bow-modifier').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.nextBowModifier = parseInt(e.target.value, 10) || 0;
    saveState();
  });

  document.getElementById('sim434-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.combatSkillInitial = _pick10() + 10;
    d.enduranceInitial   = _pick10() + 20;
    d.combatSkill = d.combatSkillInitial;
    d.endurance   = d.enduranceInitial;
    d.rolled = true;
    if (d.combatEffects?.captured) _captureFightEffects(d);
    d.ratio  = _effectiveSkill(d) - d.enemy.skill;
    _appendLog(d, t('battlesim434.log.rolled', { cs: d.combatSkillInitial, en: d.enduranceInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim434-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim434-enemy-pick', 'sim434-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name          = enemy.name;
    d.enemy.skill          = enemy.attack ?? 0;
    d.enemy.endurance      = enemy.hp ?? 0;
    d.enemy.enduranceMax   = enemy.hp ?? 0;
    d.roundsThisBattle     = 0;
    _captureFightEffects(d);
    d.ratio                = _effectiveSkill(d) - d.enemy.skill;
    saveState();
    _renderInputs(true);
  });

  const fieldMap = {
    'sim434-cs': ['combatSkill'], 'sim434-csmax': ['combatSkillInitial'],
    'sim434-en': ['endurance'], 'sim434-enmax': ['enduranceInitial'],
    'sim434-atkmod': ['attackModifier'],
    'sim434-enemy-skill': ['enemy', 'skill'], 'sim434-enemy-en': ['enemy', 'endurance'], 'sim434-enemy-enmax': ['enemy', 'enduranceMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const allowNegative = id === 'sim434-atkmod';
      const val = allowNegative ? (parseInt(input.value, 10) || 0) : Math.max(0, parseInt(input.value, 10) || 0);
      if (path.length === 1) d[path[0]] = val;
      else d[path[0]][path[1]] = val;
      if (id === 'sim434-cs' || id === 'sim434-atkmod' || id === 'sim434-enemy-skill') d.ratio = _effectiveSkill(d) - d.enemy.skill;
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
