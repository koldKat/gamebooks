// Shared Grey Star combat panel; book identity and source data are supplied by its wrapper.
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';
import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

export function createGreyStarPanel({ definition, getRules, potionHeal = 4 }) {
const prefix = `sim${definition.id}`;
const field = suffix => prefix + suffix;

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ definition, ...getRules(), HEALING_POTION_HEAL: potionHeal, ALL_PANEL_OVERLAY_IDS, _rulesFor, SVG_SKULL, SVG_TROPHY, _appendLog, _captureFightEffects, _checkBattleEnd, _data, _effectiveSkill, _enemyList, _enemyName, _enemyNameSafe, _escapeRoute, _loadEnemyList, _numField, _pick10, _pickRow, _ratioCol, _recordOutcome, _renderAll, _renderHistory, _renderInputs, _renderLog, _resetBattle, _runRound, _setVal, _setupAutocomplete, _stopFight, _usePotion, apiFetch, close, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, init, open, registerPanelShortcut, render, saveState, setVisible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _rulesFor, _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _captureFightEffects, _effectiveSkill, _stopFight, _escapeRoute, _ceaseRoute, _ceaseFight, _runRound, _checkBattleEnd, _resetBattle } = createCombat(simulatorContext);
const { _usePotion } = createEffects(simulatorContext);
// END SIMULATOR WIRING
// Saved fights retain their rules; source effects are captured for future fights.


const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Rows: 1-9, then 0. Columns: Combat Ratio buckets -11..11, clamped at the extremes.
// Cells are [enemyLoss, playerLoss]; K means instant death.

 // 0-9, "0 counts as zero"

// ── Enemy autocomplete (fed by book_enemies, seeded per book_id) ───────────

let _enemyList = null;
async function _loadEnemyList() {
  if (_enemyList) return _enemyList;
  try {
    const res = await apiFetch(`/api/books/${definition.id}/enemies`);
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${definition.shortSkillLabel || 'CS'}:${e.attack ?? '?'} ${definition.shortEnduranceLabel || 'END'}:${e.hp ?? '?'}</span></li>`
    ).join('');
    activeIdx = -1;
    dropdown.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
  }

  function select(enemy) {
    if (!enemy || input.disabled) return;
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
  _setVal(field('-cs'), d.combatSkill);
  _setVal(field('-csmax'), d.combatSkillInitial);
  _setVal(field('-en'), d.endurance);
  _setVal(field('-enmax'), d.enduranceInitial);
  _setVal(field('-atkmod'), d.attackModifier);
  _setVal(field('-will'), d.willpower ?? 0);
  _setVal(field('-willmax'), d.willpowerInitial ?? 0);
  _setVal(field('-will-spend'), d.nextWillSpend ?? 1);
  _setVal(field('-weapon'), _rulesFor(d.combatEffects?.section).forceWeapon ?? d.nextWeapon ?? 'staff');
  for (const [id, key] of [['dagger','nextDagger'], ['spare-weapon','nextSpareWeapon'], ['shield','nextShield'], ['has-potion','hasHealingPotion']]) document.getElementById(field('-') + id).checked = d[key] === true;
  document.getElementById(field('-companion')).checked = d.nextCompanion === true;
  _setVal(field('-enemy-skill'), d.enemy.skill);
  _setVal(field('-enemy-en'), d.enemy.endurance);
  _setVal(field('-enemy-enmax'), d.enemy.enduranceMax);
  _setVal(field('-ratio'), d.ratio);
  if (!skipEnemyPick) _setVal(field('-enemy-pick'), d.enemy.name);

  const potionBtn = document.getElementById(field('-use-potion'));
  potionBtn.disabled = !d.rolled || !d.hasHealingPotion || d.healingPotionUsed || (d.printedRules === 1 && d.endurance <= 0);
  potionBtn.textContent = d.healingPotionUsed ? t((definition.i18nPrefix + '.btn.used')) : t((definition.i18nPrefix + '.btn.drink'));

  const rollBtn = document.getElementById(field('-roll'));
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t((definition.i18nPrefix + '.btn.rolled')) : t((definition.i18nPrefix + '.btn.roll'));

  const status = document.getElementById(field('-status'));
  if (!d.rolled) {
    status.textContent = t((definition.i18nPrefix + '.status.not_ready'));
  } else if (d.endurance <= 0) {
    status.textContent = t((definition.i18nPrefix + '.status.fallen'));
  } else if (d.combatEffects?.finished) {
    status.textContent = t((definition.i18nPrefix + '.log.continue'), { sections: d.combatEffects.routes?.join(' / ') || '' });
  } else if (d.enemy.endurance <= 0 && d.enemy.enduranceMax > 0) {
    status.textContent = t((definition.i18nPrefix + '.status.defeated'), { enemy: _enemyName(d) });
  } else {
    status.textContent = '';
  }
  document.getElementById(field('-round')).disabled = !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0 || d.combatEffects?.finished === true;
  const escape = document.getElementById(field('-escape'));
  escape.hidden = !d.combatEffects;
  escape.disabled = !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0 || !_escapeRoute(d);
  const cease = document.getElementById(field('-cease'));
  cease.hidden = !_ceaseRoute(d);
  cease.disabled = cease.hidden;
  if (definition.lockCombatSetup) {
    const locked = d.roundsThisBattle > 0 && d.endurance > 0 && d.enemy.endurance > 0 && !d.combatEffects?.finished;
    for (const name of ['cs','csmax','en','enmax','atkmod','will','willmax','weapon','dagger','spare-weapon','shield','companion','has-potion','enemy-pick','enemy-skill','enemy-en','enemy-enmax']) {
      const input = document.getElementById(field('-' + name));
      input.disabled = locked || (name === 'weapon' && !!_rulesFor(d.combatEffects?.section).forceWeapon);
      for (const button of input.closest('.inv-edit-row')?.querySelectorAll('.inv-qty-btn') || []) button.disabled = locked;
    }
  }
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById(field('-log'));
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById(field('-history-summary'));
  const listEl = document.getElementById(field('-history-list'));
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t((definition.i18nPrefix + '.history.summary'), { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t((definition.i18nPrefix + '.history.empty'))}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t((definition.i18nPrefix + '.history.won')) : t((definition.i18nPrefix + '.history.lost'));
    const date   = new Date(h.ts).toLocaleDateString(definition.dateLocale || 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

function render() {
  const overlay = document.getElementById(field('-overlay'));
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { close(); return; }
  _renderAll();
}

function open() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById(field('-overlay')).classList.add('active');
}

function close() {
  document.getElementById(field('-overlay'))?.classList.remove('active');
}

function setVisible(visible) {
  const btn = document.getElementById(field('-btn'));
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) close();
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  if (document.getElementById(field('-overlay'))) return;
  const overlay = document.createElement('div');
  overlay.id        = field('-overlay');
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t((definition.i18nPrefix + '.ui.title'))}</span>
        <button id="${prefix}-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="${prefix}-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t((definition.i18nPrefix + '.btn.roll'))}</button>
            </div>
            ${_numField(t((definition.i18nPrefix + '.ui.cs')), field('-cs'))}
            ${_numField(t((definition.i18nPrefix + '.ui.cs_initial')), field('-csmax'))}
            ${_numField(t((definition.i18nPrefix + '.ui.en')), field('-en'))}
            ${_numField(t((definition.i18nPrefix + '.ui.en_initial')), field('-enmax'))}
            ${_numField(t((definition.i18nPrefix + '.ui.will')), field('-will'))}
            ${_numField(t((definition.i18nPrefix + '.ui.will_initial')), field('-willmax'))}
            ${_numField(t((definition.i18nPrefix + '.ui.atkmod')), field('-atkmod'))}
            <details class="bsim-history">
              <summary>${t((definition.i18nPrefix + '.ui.next_fight'))}</summary>
              <div class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t((definition.i18nPrefix + '.ui.weapon'))}</span><select id="${prefix}-weapon" class="inv-edit-input">${['staff','other','none'].map(value => `<option value="${value}">${t((definition.i18nPrefix + '.ui.') + value)}</option>`).join('')}</select></div>
              ${_numField(t((definition.i18nPrefix + '.ui.will_spend')), field('-will-spend'))}
              ${['dagger','spare-weapon','shield'].map(id => `<label class="inv-edit-row"${definition.itemModifiers && !definition.itemModifiers.includes(id) ? ' hidden' : ''}><span class="inv-edit-label bsim-stat-label">${t((definition.i18nPrefix + '.ui.') + id)}</span><input type="checkbox" id="${prefix}-${id}"></label>`).join('')}
              <label class="inv-edit-row"${definition.companionOption ? '' : ' hidden'}><span class="inv-edit-label bsim-stat-label">${definition.companionOption ? t(definition.i18nPrefix + '.ui.companion') : ''}</span><input type="checkbox" id="${prefix}-companion"></label>
              <p class="bsim-history-empty">${t((definition.i18nPrefix + '.ui.effects_note'))}</p>
              <p class="bsim-history-empty">${t((definition.i18nPrefix + '.ui.mental_note'))}</p>
            </details>
            <label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t((definition.i18nPrefix + '.ui.has_potion'))}</span><input type="checkbox" id="${prefix}-has-potion"></label>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t((definition.i18nPrefix + '.ui.potion'))}</span>
              <button id="${prefix}-use-potion" class="inv-edit-done bsim-ae-roll-btn" type="button">${t((definition.i18nPrefix + '.btn.drink'))}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t((definition.i18nPrefix + '.ui.pick'))}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="${prefix}-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="${prefix}-enemy-pick-dropdown">
                <ul id="${prefix}-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t((definition.i18nPrefix + '.ui.enemy_cs')), field('-enemy-skill'))}
            ${_numField(t((definition.i18nPrefix + '.ui.enemy_en')), field('-enemy-en'))}
            ${_numField(t((definition.i18nPrefix + '.ui.enemy_en_max')), field('-enemy-enmax'))}
            ${_numField(t((definition.i18nPrefix + '.ui.ratio')), field('-ratio'), null, true)}
          </div>
          <div id="${prefix}-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="${prefix}-round" class="inv-add-btn bsim-action-primary">${t((definition.i18nPrefix + '.btn.round'))}</button>
            <button id="${prefix}-escape" class="inv-add-btn" hidden>${t((definition.i18nPrefix + '.btn.escape'))}</button>
            <button id="${prefix}-cease" class="inv-add-btn" hidden>${definition.ceaseOption ? t(definition.i18nPrefix + '.btn.cease') : ''}</button>
            <button id="${prefix}-reset" class="inv-add-btn">${t((definition.i18nPrefix + '.btn.reset'))}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="${prefix}-history-summary">${t((definition.i18nPrefix + '.history.summary'), { n: 0 })}</summary>
            <div id="${prefix}-history-list" class="bsim-history-list"></div>
          </details>
          <div id="${prefix}-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = field('-btn');
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', open);
  document.getElementById(field('-close')).addEventListener('click', close);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) close(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== field('-overlay')),
    open:  open,
    close: close,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) close();
  });

  document.getElementById(field('-round')).addEventListener('click', _runRound);
  document.getElementById(field('-reset')).addEventListener('click', _resetBattle);
  document.getElementById(field('-use-potion')).addEventListener('click', _usePotion);
  document.getElementById(field('-escape')).addEventListener('click', () => _runRound(true));
  document.getElementById(field('-cease')).addEventListener('click', _ceaseFight);
  document.getElementById(field('-companion')).addEventListener('change', e => {
    if (e.target.disabled) return;
    const d = _data(); if (!d) return;
    d.nextCompanion = e.target.checked;
    if (d.roundsThisBattle === 0) _captureFightEffects(d);
    saveState(); _renderInputs(true);
  });
  document.getElementById(field('-weapon')).addEventListener('change', e => {
    if (e.target.disabled) return;
    const d = _data(); if (!d) return;
    d.nextWeapon = e.target.value;
    if (definition.lockCombatSetup && d.roundsThisBattle === 0) _captureFightEffects(d);
    saveState(); _renderInputs(true);
  });
  for (const [id, key] of [['dagger','nextDagger'], ['spare-weapon','nextSpareWeapon'], ['shield','nextShield'], ['has-potion','hasHealingPotion']]) document.getElementById(field('-') + id).addEventListener('change', e => {
    if (e.target.disabled) return;
    const d = _data(); if (!d) return;
    d[key] = e.target.checked;
    if (definition.lockCombatSetup && d.roundsThisBattle === 0) _captureFightEffects(d);
    saveState(); _renderInputs(true);
  });

  document.getElementById(field('-roll')).addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.combatSkillInitial = _pick10() + 10;
    if (d.printedRules === 1) {
      d.willpowerInitial = _pick10() + 20;
      d.willpower = d.willpowerInitial;
    }
    d.enduranceInitial   = _pick10() + 20;
    d.combatSkill = d.combatSkillInitial;
    d.endurance   = d.enduranceInitial;
    d.rolled = true;
    if (d.printedRules === 1 && d.combatEffects) _captureFightEffects(d);
    d.ratio  = _effectiveSkill(d) - d.enemy.skill;
    _appendLog(d, t(d.printedRules === 1 ? (definition.i18nPrefix + '.log.rolled_future') : (definition.i18nPrefix + '.log.rolled'), { cs: d.combatSkillInitial, en: d.enduranceInitial, will: d.willpowerInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById(field('-enemy-pick')).addEventListener('input', e => {
    if (e.target.disabled) return;
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    if (definition.lockCombatSetup && d.roundsThisBattle === 0) _captureFightEffects(d);
    saveState();
    if (definition.lockCombatSetup) _renderInputs(true);
  });
  _setupAutocomplete(field('-enemy-pick'), field('-enemy-pick-dropdown'), enemy => {
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
    [field('-cs')]: ['combatSkill'], [field('-csmax')]: ['combatSkillInitial'],
    [field('-en')]: ['endurance'], [field('-enmax')]: ['enduranceInitial'],
    [field('-atkmod')]: ['attackModifier'],
    [field('-will')]: ['willpower'], [field('-willmax')]: ['willpowerInitial'],
    [field('-will-spend')]: ['nextWillSpend'],
    [field('-enemy-skill')]: ['enemy', 'skill'], [field('-enemy-en')]: ['enemy', 'endurance'], [field('-enemy-enmax')]: ['enemy', 'enduranceMax'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      if (input.disabled) return;
      const d = _data();
      if (!d) return;
      const allowNegative = id === field('-atkmod') || id === field('-will');
      const number = id === field('-en') ? parseFloat(input.value) : parseInt(input.value, 10);
      const val = id === field('-will-spend') ? Math.max(1, number || 1) : allowNegative ? (number || 0) : Math.max(0, number || 0);
      if (path.length === 1) d[path[0]] = val;
      else d[path[0]][path[1]] = val;
      if (definition.lockCombatSetup && d.roundsThisBattle === 0) _captureFightEffects(d);
      if (id === field('-cs') || id === field('-atkmod') || id === field('-enemy-skill') || id === field('-will')) d.ratio = _effectiveSkill(d) - d.enemy.skill;
      saveState();
      _renderInputs(true);
    });
  }
  overlay.querySelectorAll('.inv-qty-btn').forEach(btn2 => {
    btn2.addEventListener('click', () => {
      const input = document.getElementById(btn2.dataset.id);
      if (!input || input.disabled) return;
      const delta = parseInt(btn2.dataset.delta, 10);
      input.value = (parseFloat(input.value) || 0) + delta;
      input.dispatchEvent(new Event('change'));
    });
  });
}

function _numField(label, id, width, readonly) {

  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <div class="inv-qty-wrap">
        ${readonly ? '' : `<button class="inv-qty-btn" data-id="${id}" data-delta="-1">−</button>`}
        <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric" autocomplete="off"${readonly ? ' readonly' : ''}${width ? ` style="width:${width}"` : ''}>
        ${readonly ? '' : `<button class="inv-qty-btn" data-id="${id}" data-delta="1">+</button>`}
      </div>
    </div>`;
}


return { init, render, setVisible };
}
