import { BASE_HP_MAX, ENDURANCE_HP_BONUS, THROWING_ACCURACY_BONUS, RE_STAT_A, RE_STAT_D, RE_STAT_T } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, BASE_HP_MAX, ENDURANCE_HP_BONUS, QUAIL_SPELLS, RE_STAT_A, RE_STAT_D, RE_STAT_T, SVG_SKULL, SVG_TROPHY, THROWING_ACCURACY_BONUS, _appendLog, _checkField, _data, _enemyAttack, _enemyList, _enemyName, _enemyNameField, _enemyNameSafe, _enemyStatLabel, _entryLabel, _entryNote, _entryQty, _equipmentBaseStats, _flee, _getGroupObj, _heal, _loadEnemyList, _rangedAccuracy, _rangedAttack, _rangedDamage, _rangedDamageDisplay, _rangedTypeLabel, _rangedWeaponOptions, _recordOutcome, _renderHistory, _renderInputs, _renderLog, _renderRangedPanel, _renderRules, _resetBattle, _resolveFuture, _roll, _runRound, _selectField, _setupEnemyAutocomplete, _statField, _statFromNote, _syncStatFromEquipment, _updateStatus, apiFetch, closeBattleSim, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initBattleSim, openBattleSim, quailCanCast, quailEnemies, quailFlee, quailHeal, quailOver, quailRanged, quailRound, quailSpell, quailSpendAction, quailStart, registerPanelShortcut, renderBattleSim, saveState, setBattleSimVisible, shortcutLabel, showAlert, t });
const { _data, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _rangedTypeLabel, _roll, _enemyName, _enemyNameSafe, _entryNote, _entryLabel, _entryQty, _statFromNote, _equipmentBaseStats, _syncStatFromEquipment, _rangedWeaponOptions, _rangedAccuracy, _rangedDamage, _rangedDamageDisplay, _getGroupObj, _resolveFuture, _enemyAttack, _runRound, _rangedAttack, _flee, _resetBattle, _enemyStatLabel } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Пътят на пъдпъдъка, book 829)
// Equipment/inventory are read-only inputs; simulator state belongs to the current run.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { quailStart, quailOver, quailEnemies, quailRound, quailHeal, quailFlee, quailRanged, quailSpell, quailCanCast, quailSpendAction, QUAIL_SPELLS } from "../.././engines/quail.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;


// Labels live in i18n.js under battlesim829.type.<key>.













// Escape free-text names in HTML logs; store history names raw and escape once when rendered.


// Derive attack from the primary weapon and sum defense across equipped slots' note stats.











// Recalculate from equipment when skills change or on explicit refresh, replacing manual overrides.


// Items with a ranged-stat marker in their note are ranged weapon options.


// Accuracy (Т) and damage formulas per book 829 rules.




// Map a stepper's data-group to its target object - 'ranged' lives nested
// under player.ranged, everything else is a top-level sim829 group.




function _renderRules(d) {
  const panel = document.getElementById('bsim-rules');
  if (!panel) return;
  const enabled = d.rulesVersion === 1;
  panel.querySelectorAll('input,select,button').forEach(el => { el.disabled = !enabled; });
  document.getElementById('bsim-rules-note').textContent = t(enabled ? 'battlesim829.rules.note' : 'battlesim829.rules.legacy');
  if (!enabled) return;
  for (const input of panel.querySelectorAll('[data-group]')) {
    const value = _getGroupObj(d, input.dataset.group)[input.dataset.key];
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else if (input.tagName !== 'BUTTON') input.value = value ?? 0;
  }
  document.getElementById('bsim-enemy-rule').value = d.enemy.rule || 'standard';
  document.getElementById('bsim-spell').value = d.magic.spell;
  document.getElementById('bsim-spell-learned').checked = Boolean(d.magic.learned[d.magic.spell]);
  document.getElementById('bsim-spell-formulas').value = d.magic.formulas[d.magic.spell] || 0;
  document.getElementById('bsim-ammo').value = d.ammo[d.player.ranged.type] || 0;
  document.getElementById('bsim-spell-cast').disabled = !quailCanCast(d);
  document.getElementById('bsim-group').innerHTML = (d.extraEnemies || []).map((e, i) => `<div class="inv-edit-row"><button class="bsim-sync-btn" type="button" data-target="${i}">${escapeHtml(e.name)} · ${e.hp}/${e.hpMax}</button><button class="inv-close-btn" type="button" data-remove="${i}" aria-label="${t('btn.delete')}">×</button></div>`).join('');
}

// Keep lifetime battle outcomes separate from the current fight's rolling log; never truncate totals.


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
  const over = d.rulesVersion === 1 ? quailOver(d) : d.player.hp <= 0 || d.enemy.hp <= 0;
  if (d.rulesVersion === 1) {
    el.textContent = d.finished ? t('battlesim829.event.' + d.finished) : quailEnemies(d).every(e => e.hp <= 0) ? t('battlesim829.status.victory') : '';
  }
  document.getElementById('bsim-flee').disabled = over || d.rulesVersion === 1 && !d.options.escapeMin;
  document.getElementById('bsim-round').disabled = over;
  document.getElementById('bsim-heal').disabled  = over;

  const r        = d.player.ranged;
  const weapons  = _rangedWeaponOptions(pt);
  const weapon   = weapons.find(w => w.key === r.weaponKey);
  const noWeapon = r.type !== 'magic' && !weapon;
  document.getElementById('bsim-ranged-attack').disabled = over || r.attempts <= 0 || noWeapon || d.rulesVersion === 1 && (r.type === 'magic' || !(d.ammo[r.type] > 0));
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
  _renderRules(d);
  _updateStatus();
}





function _heal() {
  const d = _data();
  if (d?.rulesVersion === 1) return _resolveFuture(quailHeal(d, Number(document.getElementById('bsim-heal-amount').value) || 0, _roll));
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

// Bind shared stat-row controls to the run's simulator group; ranged stats live under player.ranged.








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
    d.enemy = { name: enemy.name, a: enemy.attack ?? d.enemy.a, d: enemy.defense ?? d.enemy.d,
      hp: enemy.hp ?? d.enemy.hp, hpMax: enemy.hp ?? d.enemy.hpMax, pb: enemy.pb ?? d.enemy.pb };
    if (d.rulesVersion !== 1 || d.finished) quailStart(d);
    d.enemy.rule = /^Огнен бръмбар/.test(enemy.name) ? 'plus3six'
      : /^(Огромен плъх|Скелет магьосник)$/.test(enemy.name) ? 'sum2'
      : /^Върховен жрец на огъня$/.test(enemy.name) ? 'max2'
      : /^Върховен жрец на водата$/.test(enemy.name) ? 'water'
      : /^Скална усойница$/.test(enemy.name) ? 'extra6'
      : /^Демон-пъдпъдък$/.test(enemy.name) ? 'explode56'
      : /^Огнен гущер$/.test(enemy.name) ? 'explode12'
      : /^Дървеница$/.test(enemy.name) ? 'bedbug' : 'standard';
    if (/^Инсумо$/.test(enemy.name)) d.enemy.rule = 'extra12';
    d.enemy.aura = /^(Изгубена душа|Планински призрак)/.test(enemy.name) ? 1 : 0;
    d.options.lowRoll = /^(Боен тритон|Гигантски плъх)$/.test(enemy.name);
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
          <details id="bsim-rules" class="bsim-side">
            <summary class="bsim-side-title">${t('battlesim829.rules.title')}</summary>
            <p id="bsim-rules-note" class="bsim-ranged-info"></p>
            ${_statField(t('battlesim829.rules.escape_min'), 'bsim-escape-min', 'options', 'escapeMin')}
            ${_statField(t('battlesim829.rules.companion_a'), 'bsim-companion-a', 'options', 'companionA')}
            <label class="inv-edit-row"><input type="checkbox" data-group="options" data-key="companion">${t('battlesim829.rules.companion')}</label>
            <label class="inv-edit-row"><input type="checkbox" data-group="options" data-key="lowRoll">${t('battlesim829.rules.low_roll')}</label>
            <label class="inv-edit-row"><input type="checkbox" data-group="options" data-key="nonlethal">${t('battlesim829.rules.nonlethal')}</label>
            ${_selectField(t('battlesim829.rules.enemy_dice'), 'bsim-enemy-rule', ['standard','sum2','max2','plus3six','explode12','explode56','extra6','extra12','bedbug','water'].map(key => [key, t('battlesim829.rule.' + key)]))}
            ${_statField(t('battlesim829.rules.aura'), 'bsim-enemy-aura', 'enemy', 'aura')}
            ${_statField(t('battlesim829.rules.free_attacks'), 'bsim-free-attacks', 'sim', 'freeAttacks')}
            <button id="bsim-group-add" class="bsim-sync-btn" type="button">${t('battlesim829.rules.group_add')}</button>
            <div id="bsim-group"></div>
            <label class="inv-edit-row"><span class="inv-edit-label">${t('battlesim829.rules.ammo')}</span><input id="bsim-ammo" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric"></label>
            <div class="bsim-side-title">${t('battlesim829.rules.magic')}</div>
            ${_statField(t('battlesim829.rules.magic_value'), 'bsim-magic-value', 'magic', 'value')}
            ${_selectField(t('battlesim829.rules.spell'), 'bsim-spell', QUAIL_SPELLS.map(key => [key, t('battlesim829.spell.' + key)]))}
            <label class="inv-edit-row"><input id="bsim-spell-learned" type="checkbox">${t('battlesim829.rules.learned')}</label>
            <label class="inv-edit-row"><span class="inv-edit-label">${t('battlesim829.rules.formulas')}</span><input id="bsim-spell-formulas" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric"></label>
            ${_statField(t('battlesim829.rules.summon_a'), 'bsim-summon-a', 'magic', 'summonA')}
            <label class="inv-edit-row"><input type="checkbox" data-group="magic" data-key="empower">${t('battlesim829.rules.empower')}</label>
            <label class="inv-edit-row"><input type="checkbox" data-group="magic" data-key="weakenDefense">${t('battlesim829.rules.weaken_defense')}</label>
            <button id="bsim-spell-cast" class="inv-edit-done" type="button">${t('battlesim829.rules.cast')}</button>
          </details>
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
  const updateFuture = fn => {
    const d = _data();
    if (d?.rulesVersion !== 1) return;
    fn(d);
    saveState();
    _renderInputs();
  };
  document.getElementById('bsim-rules').querySelectorAll('input[type="checkbox"][data-group]').forEach(input => {
    input.addEventListener('change', () => updateFuture(d => { _getGroupObj(d, input.dataset.group)[input.dataset.key] = input.checked; }));
  });
  document.getElementById('bsim-enemy-rule').addEventListener('change', e => updateFuture(d => { d.enemy.rule = e.target.value; }));
  document.getElementById('bsim-spell').addEventListener('change', e => updateFuture(d => { d.magic.spell = e.target.value; }));
  document.getElementById('bsim-spell-learned').addEventListener('change', e => updateFuture(d => {
    const others = Object.entries(d.magic.learned).filter(([key, learned]) => key !== d.magic.spell && learned).length;
    d.magic.learned[d.magic.spell] = e.target.checked && others < d.magic.value;
  }));
  for (const id of ['bsim-ammo', 'bsim-spell-formulas']) {
    document.getElementById(id).addEventListener('input', e => updateFuture(d => {
      const value = Math.max(0, Math.floor(Number(e.target.value.replace(/[^0-9]/g, '')) || 0));
      if (id === 'bsim-ammo') d.ammo[d.player.ranged.type] = value;
      else d.magic.formulas[d.magic.spell] = value;
    }));
  }
  document.getElementById('bsim-spell-cast').addEventListener('click', () => {
    const d = _data();
    if (d?.rulesVersion === 1) _resolveFuture(quailSpell(d, _roll));
  });
  document.getElementById('bsim-group-add').addEventListener('click', () => updateFuture(d => {
    if (!d.enemy.name || d.enemy.hp <= 0 || d.extraEnemies.length >= 8) return;
    d.extraEnemies.push({ ...d.enemy });
    d.enemy = { name: '', a: 0, d: 0, hp: 0, hpMax: 0, pb: 0 };
  }));
  document.getElementById('bsim-group').addEventListener('click', e => updateFuture(d => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.dataset.remove != null) d.extraEnemies.splice(Number(button.dataset.remove), 1);
    else if (button.dataset.target != null) {
      const index = Number(button.dataset.target);
      [d.enemy, d.extraEnemies[index]] = [d.extraEnemies[index], d.enemy];
    }
  }));

  // Stat steppers - read group/key off the input itself. player.hp is
  // clamped to player.hpMax; raising/lowering player.hpMax re-clamps hp.
  overlay.querySelectorAll('.inv-qty-input[data-group]').forEach(input => {
    input.addEventListener('input', () => {
      // Filter numeric text inputs; avoid native spinner/wheel behavior.
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      const d = _data();
      if (!d) return;
      let val = Math.max(0, Number(raw) || 0);
      if (input.dataset.group === 'magic' && input.dataset.key === 'value') val = Math.min(5, val);
      if (input.dataset.group === 'options' && input.dataset.key === 'escapeMin') val = Math.min(6, val);
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
      if (btnEl.dataset.group === 'magic' && btnEl.dataset.key === 'value') next = Math.min(5, next);
      if (btnEl.dataset.group === 'options' && btnEl.dataset.key === 'escapeMin') next = Math.min(6, next);
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
    const attack = d.player.a, defense = d.player.d;
    _syncStatFromEquipment(d, pt, 'a');
    _syncStatFromEquipment(d, pt, 'd');
    _syncStatFromEquipment(d, pt, 'hpMax');
    if (d.rulesVersion === 1 && d.started && !quailOver(d) && (attack !== d.player.a || defense !== d.player.d)) return _resolveFuture(quailSpendAction(d, _roll));
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

export { initBattleSim as init, renderBattleSim as render, setBattleSimVisible as setVisible };
