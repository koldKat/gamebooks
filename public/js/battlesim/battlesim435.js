// Castle Death: captured encounter rules apply only to newly started fights.

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
  if (!pt.sim435) {
    pt.sim435 = {
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
  const d = pt.sim435;
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
  d.combatEffects = {
    captured: true,
    section: Number(d.enemy.name.match(/§(\d+)/)?.[1]) || 0,
    psychic: d.nextPsychic || 'none',
    tracking: !!d.nextTracking, nexus: !!d.nextNexus, curing: !!d.nextCuring,
    circleLight: !!d.nextCircleLight, mace: !!d.nextMace,
    cloth: !!d.nextCloth, invisibility: !!d.nextInvisibility,
    ...( /1\s*§212/.test(d.enemy.name) ? { secondJailer: true } : {}),
  };
  d.ratio = _effectiveSkill(d) - d.enemy.skill;
}

function _psychic(d) {
  const effects = d.combatEffects;
  if (!effects?.captured || [93,174].includes(effects.section)) return 'none';
  if (effects.psychic === 'blast' && ![8,78,118,126,198,202,235,245].includes(effects.section)) return 'blast';
  if (effects.psychic === 'surge' && d.endurance > 6) return 'surge';
  return 'none';
}

function _effectiveSkill(d) {
  let skill = d.combatSkill + (d.attackModifier || 0);
  const effects = d.combatEffects;
  if (!effects?.captured) return skill;
  const section = effects.section;
  const psychic = _psychic(d);
  skill += psychic === 'surge' ? 4 : psychic === 'blast' ? 2 : 0;
  if (section === 19 && d.roundsThisBattle < 2 && !effects.tracking) skill -= 3;
  if (section === 27 && d.roundsThisBattle < 3 && !effects.tracking) skill -= 3;
  if (section === 27 && effects.mace) skill += 5;
  if (section === 45 && effects.circleLight) skill += 2;
  if (section === 93 || section === 219 && d.roundsThisBattle < 2) skill -= 4;
  if (section === 118 && effects.tracking) skill += 2;
  if (section === 214 && !effects.nexus) skill -= 4;
  if (section === 257) skill += (effects.tracking ? 0 : -2) + (effects.cloth ? 1 : 0);
  return skill;
}

function _battleOver(d) {
  return !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0 || !!d.combatEffects?.finished;
}

function _setRoute(d, section) {
  d.combatEffects.finished = true;
  d.combatEffects.route = section;
  _appendLog(d, t('battlesim435.log.continue', { section }));
}

function _escapeRoute(d) {
  const effects = d.combatEffects;
  if (!effects?.captured) return 0;
  const section = effects.section;
  if ([19,249].includes(section) && d.roundsThisBattle >= 3) return 241;
  if (section === 45 && d.roundsThisBattle >= 3) return 336;
  if ([253,314,214].includes(section)) return 277;
  if (section === 221) return effects.invisibility ? 70 : d.roundsThisBattle >= 2 ? 229 : 0;
  if (section === 257 && d.roundsThisBattle >= 3) return 64;
  if (section === 301 && d.roundsThisBattle >= 4) return 91;
  return 0;
}

function _escape() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  const route = _escapeRoute(d);
  if (!route) return;
  if (d.combatEffects.section !== 214 && route !== 70) _runRound(true);
  if (d.endurance > 0) _setRoute(d, route);
  saveState();
  _renderAll();
}

function _runRound(escaping = false) {
  const d = _data();
  if (!d || _battleOver(d)) return;
  escaping = escaping === true;
  const effects = d.combatEffects || {};
  const psychic = _psychic(d);
  const ratio = effects.captured ? _effectiveSkill(d) - d.enemy.skill : d.ratio;
  d.ratio = ratio;
  d.roundsThisBattle++;

  const pick = _pick10();
  const col = _ratioCol(ratio);
  let [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  if (escaping) enemyLoss = 0;
  if (effects.section === 290 || effects.section === 233 && psychic !== 'none') {
    if (enemyLoss !== 'K') enemyLoss *= 2;
  }
  if (lwLoss !== 'K') {
    if (effects.section === 76) lwLoss *= 3;
    if (effects.section === 126 && !effects.nexus || [178,219,285,301].includes(effects.section) && !effects.curing) lwLoss *= 2;
  }
  _appendLog(d, t('battlesim435.log.round', { round: d.roundsThisBattle, ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (lwLoss === 'K') d.endurance = 0;
  else d.endurance = Math.max(0, d.endurance - lwLoss);
  const extra = (psychic === 'surge' ? 2 : 0) + (effects.section === 325 ? 2 : 0);
  if (extra && d.endurance > 0) {
    d.endurance = Math.max(0, d.endurance - extra);
    _appendLog(d, t('battlesim435.log.extra_loss', { n: extra }));
  }

  _appendLog(d, t('battlesim435.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'K' ? t('battlesim435.log.k_word') : enemyLoss,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? t('battlesim435.log.k_word') : lwLoss,
    endurance: d.endurance, enduranceMax: d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const effects = d.combatEffects || {};
  if (d.printedRules && d.endurance <= 0) {
    _appendLog(d, t('battlesim435.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  } else if (d.enemy.endurance <= 0 && effects.secondJailer) {
    effects.secondJailer = false;
    d.enemy = { name: t('battlesim435.ui.second_jailer'), skill: 16, endurance: 21, enduranceMax: 21 };
    _appendLog(d, t('battlesim435.log.second_jailer'));
  } else if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim435.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    if (effects.captured) {
      const timed = { 40: [248,160], 50: [248,160], 75: [248,160], 142: [238,212], 206: [17,160], 280: [291,156], 316: [248,160] }[effects.section];
      const route = timed ? timed[d.roundsThisBattle <= 3 ? 0 : 1] : {
        8:194,19:141,27:5,45:283,62:282,76:296,78:341,81:105,93:131,
        118:200,126:147,174:149,178:346,198:22,202:149,212:80,214:114,
        219:21,221:271,233:209,235:22,245:259,249:141,253:141,257:186,
        285:161,290:220,299:339,301:21,314:141,319:56,325:158,
      }[effects.section];
      if (route) _setRoute(d, route);
    }
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim435.log.fallen', { skull: SVG_SKULL }));
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
  if (d.log.length) _appendLog(d, t('battlesim435.log.reset_sep'));
  _appendLog(d, t('battlesim435.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

function _usePotion() {
  const d = _data();
  if (!d || !d.rolled || !d.hasHealingPotion || d.healingPotionUsed) return;
  if (d.printedRules && d.endurance <= 0) return;
  if (d.roundsThisBattle > 0 && !_battleOver(d)) {
    showAlert(t('battlesim435.alert.potion_midfight'));
    return;
  }
  d.healingPotionUsed = true;
  const before = d.endurance;
  d.endurance = Math.min(d.enduranceInitial, d.endurance + HEALING_POTION_HEAL);
  _appendLog(d, t('battlesim435.log.potion', { before, endurance: d.endurance, enduranceMax: d.enduranceInitial }));
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
  _setVal('sim435-cs', d.combatSkill);
  _setVal('sim435-csmax', d.combatSkillInitial);
  _setVal('sim435-en', d.endurance);
  _setVal('sim435-enmax', d.enduranceInitial);
  _setVal('sim435-atkmod', d.attackModifier);
  _setVal('sim435-psychic', d.nextPsychic || 'none');
  for (const [id, key] of [['tracking','nextTracking'],['nexus','nextNexus'],['curing','nextCuring'],['circle-light','nextCircleLight'],['mace','nextMace'],['cloth','nextCloth'],['invisibility','nextInvisibility']]) {
    const input = document.getElementById('sim435-' + id);
    if (input) input.checked = !!d[key];
  }
  _setVal('sim435-enemy-skill', d.enemy.skill);
  _setVal('sim435-enemy-en', d.enemy.endurance);
  _setVal('sim435-enemy-enmax', d.enemy.enduranceMax);
  _setVal('sim435-ratio', d.combatEffects?.captured ? _effectiveSkill(d) - d.enemy.skill : d.ratio);
  if (!skipEnemyPick || d.combatEffects?.section === 212) _setVal('sim435-enemy-pick', d.enemy.name);

  const potionBtn = document.getElementById('sim435-use-potion');
  potionBtn.disabled = !d.rolled || !d.hasHealingPotion || d.healingPotionUsed;
  if (d.printedRules) potionBtn.disabled ||= d.endurance <= 0 || d.roundsThisBattle > 0 && !_battleOver(d);
  potionBtn.textContent = d.healingPotionUsed ? t('battlesim435.btn.used') : t('battlesim435.btn.drink');

  const rollBtn = document.getElementById('sim435-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim435.btn.rolled') : t('battlesim435.btn.roll');

  const status = document.getElementById('sim435-status');
  if (!d.rolled) {
    status.textContent = t('battlesim435.status.not_ready');
  } else if (d.endurance <= 0) {
    status.textContent = t('battlesim435.status.fallen');
  } else if (d.combatEffects?.finished) {
    status.textContent = t('battlesim435.log.continue', { section: d.combatEffects.route });
  } else if (d.enemy.endurance <= 0 && d.enemy.enduranceMax > 0) {
    status.textContent = t('battlesim435.status.defeated', { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById('sim435-round').disabled = _battleOver(d);
  const escapeBtn = document.getElementById('sim435-escape');
  if (escapeBtn) escapeBtn.disabled = _battleOver(d) || !_escapeRoute(d);
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim435-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim435-history-summary');
  const listEl = document.getElementById('sim435-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim435.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim435.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim435.history.won') : t('battlesim435.history.lost');
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

export function renderSim435() {
  const overlay = document.getElementById('sim435-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim435(); return; }
  _renderAll();
}

function openSim435() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim435-overlay').classList.add('active');
}

function closeSim435() {
  document.getElementById('sim435-overlay')?.classList.remove('active');
}

export function setSim435Visible(visible) {
  const btn = document.getElementById('sim435-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim435();
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

export function initSim435() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim435-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim435.ui.title')}</span>
        <button id="sim435-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim435-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim435.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim435.ui.cs'), 'sim435-cs')}
            ${_numField(t('battlesim435.ui.cs_initial'), 'sim435-csmax')}
            ${_numField(t('battlesim435.ui.en'), 'sim435-en')}
            ${_numField(t('battlesim435.ui.en_initial'), 'sim435-enmax')}
            ${_numField(t('battlesim435.ui.atkmod'), 'sim435-atkmod')}
            <details class="bsim-history">
              <summary>${t('battlesim435.ui.next_fight')}</summary>
              <p class="bsim-history-empty">${t('battlesim435.ui.effects_hint')}</p>
              <div class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim435.ui.psychic')}</span><select id="sim435-psychic" class="inv-edit-input"><option value="none">${t('battlesim435.ui.none')}</option><option value="blast">${t('battlesim435.ui.blast')}</option><option value="surge">${t('battlesim435.ui.surge')}</option></select></div>
              ${['tracking','nexus','curing','circle-light','mace','cloth','invisibility'].map(id => `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim435.ui.' + id)}</span><input type="checkbox" id="sim435-${id}"></label>`).join('')}
            </details>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim435.ui.potion')}</span>
              <button id="sim435-use-potion" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim435.btn.drink')}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim435.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim435-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim435-enemy-pick-dropdown">
                <ul id="sim435-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim435.ui.enemy_cs'), 'sim435-enemy-skill')}
            ${_numField(t('battlesim435.ui.enemy_en'), 'sim435-enemy-en')}
            ${_numField(t('battlesim435.ui.enemy_en_max'), 'sim435-enemy-enmax')}
            ${_numField(t('battlesim435.ui.ratio'), 'sim435-ratio', null, true)}
          </div>
          <div id="sim435-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim435-round" class="inv-add-btn bsim-action-primary">${t('battlesim435.btn.round')}</button>
            <button id="sim435-escape" class="inv-add-btn">${t('battlesim435.btn.escape')}</button>
            <button id="sim435-reset" class="inv-add-btn">${t('battlesim435.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim435-history-summary">${t('battlesim435.history.summary', { n: 0 })}</summary>
            <div id="sim435-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim435-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim435-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim435);
  document.getElementById('sim435-close').addEventListener('click', closeSim435);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim435(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim435-overlay'),
    open:  openSim435,
    close: closeSim435,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim435();
  });

  document.getElementById('sim435-round').addEventListener('click', _runRound);
  document.getElementById('sim435-escape').addEventListener('click', _escape);
  document.getElementById('sim435-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim435-use-potion').addEventListener('click', _usePotion);
  document.getElementById('sim435-psychic').addEventListener('change', event => {
    const d = _data();
    if (!d) return;
    d.nextPsychic = ['none','blast','surge'].includes(event.target.value) ? event.target.value : 'none';
    saveState();
  });
  for (const [id, key] of [['tracking','nextTracking'],['nexus','nextNexus'],['curing','nextCuring'],['circle-light','nextCircleLight'],['mace','nextMace'],['cloth','nextCloth'],['invisibility','nextInvisibility']]) {
    document.getElementById('sim435-' + id).addEventListener('change', event => {
      const d = _data();
      if (!d) return;
      d[key] = event.target.checked;
      saveState();
    });
  }

  document.getElementById('sim435-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.combatSkillInitial = _pick10() + 10;
    d.enduranceInitial   = _pick10() + 20;
    d.combatSkill = d.combatSkillInitial;
    d.endurance   = d.enduranceInitial;
    d.rolled = true;
    if (d.combatEffects?.captured) _captureFightEffects(d);
    d.ratio  = _effectiveSkill(d) - d.enemy.skill;
    _appendLog(d, t('battlesim435.log.rolled', { cs: d.combatSkillInitial, en: d.enduranceInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim435-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim435-enemy-pick', 'sim435-enemy-pick-dropdown', enemy => {
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
    'sim435-cs': ['combatSkill'], 'sim435-csmax': ['combatSkillInitial'],
    'sim435-en': ['endurance'], 'sim435-enmax': ['enduranceInitial'],
    'sim435-atkmod': ['attackModifier'],
    'sim435-enemy-skill': ['enemy', 'skill'], 'sim435-enemy-en': ['enemy', 'endurance'], 'sim435-enemy-enmax': ['enemy', 'enduranceMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const allowNegative = id === 'sim435-atkmod';
      const val = allowNegative ? (parseInt(input.value, 10) || 0) : Math.max(0, parseInt(input.value, 10) || 0);
      if (path.length === 1) d[path[0]] = val;
      else d[path[0]][path[1]] = val;
      if (id === 'sim435-cs' || id === 'sim435-atkmod' || id === 'sim435-enemy-skill') d.ratio = _effectiveSkill(d) - d.enemy.skill;
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
