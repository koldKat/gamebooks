import { CREW, OFFICER_PENALTY, HELMET_SKILL_BONUS, NORMAL_DMG, STARSHIP_DAMAGE_RULES } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ STARSHIP_DAMAGE_RULES, ALL_PANEL_OVERLAY_IDS, CREW, HELMET_SKILL_BONUS, NORMAL_DMG, OFFICER_PENALTY, SVG_SKULL, SVG_TROPHY, _appendLog, _crewHtmlBuilt, _data, _effectiveSkill, _enemyList, _enemyName, _enemyNameSafe, _enemyPhaserShot, _enemyShipNameSafe, _enemyShipShot, _fighter, _fighterLabel, _freshCrewMember, _isOfficer, _loadEnemyList, _notReady, _numField, _playerPhaserShot, _playerShipShot, _recordOutcome, _renderAll, _renderCrewHtml, _renderCrewList, _renderCrewValues, _renderHistory, _renderInputs, _renderLog, _renderStatus, _replaceCrewMember, _resetBattle, _roll1d6, _roll2d6, _rollDamage, _runHandToHandRound, _runPhaserRound, _runRound, _runShipRound, _setupAutocomplete, _shipIsDestroyed, _startShipFight, apiFetch, closeSim186, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim186, openSim186, registerPanelShortcut, renderSim186, saveState, setSim186Visible, shortcutLabel, showAlert, t });
const { _data, _notReady, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _freshCrewMember, _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _enemyShipNameSafe, _fighterLabel, _fighter, _isOfficer, _effectiveSkill, _rollDamage, _runHandToHandRound, _playerPhaserShot, _enemyPhaserShot, _runPhaserRound, _shipIsDestroyed, _startShipFight, _playerShipShot, _enemyShipShot, _runShipRound, _runRound, _resetBattle, _replaceCrewMember } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (Starship Traveller, book 186)
// Separate hand-to-hand, phaser, and ship modes; LUCK is not a combat modifier.
// Phasers end on the first roll-under-SKILL hit; crew/ship pools stay independent.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// [key, label, isOfficer]. isOfficer = takes -3 SKILL when fighting.

// Nerve-stick and armour-deflect vary damage; normal uses flat NORMAL_DMG.

// Keep lifetime outcomes: admin totals require the full history.

// ── Hand-to-hand ─────────────────────────────────────────────────────────────

// Phaser combat alternates roll-under-SKILL shots; the first hit ends the fight.

// Respect encounter-specific enemy-first firing in both phaser and ship combat.

// ── Ship-to-ship ─────────────────────────────────────────────────────────────

// ── Crew roster ──────────────────────────────────────────────────────────────

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim186-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  let over, statusHtml = '';
  if (d.mode === 'ship') {
    const hasEnemy = d.enemyShip.shieldsMax > 0;
    if (notReady) statusHtml = t('battlesim186.status.not_ready');
    else if (_shipIsDestroyed(d, d.ship)) statusHtml = `${SVG_SKULL} ${t('battlesim186.status.ship_destroyed')}`;
    else if (hasEnemy && _shipIsDestroyed(d, d.enemyShip)) statusHtml = `${SVG_TROPHY} ${t('battlesim186.status.victory')}`;
    over = notReady || !hasEnemy || _shipIsDestroyed(d, d.ship) || _shipIsDestroyed(d, d.enemyShip);
  } else {
    const f = _fighter(d);
    const hasEnemy = d.enemy.staminaMax > 0;
    if (notReady) statusHtml = t('battlesim186.status.not_ready');
    else if (f.stamina <= 0) statusHtml = `${SVG_SKULL} ${t('battlesim186.status.fighter_fallen', { fighter: escapeHtml(_fighterLabel(d)) })}`;
    else if (hasEnemy && d.enemy.stamina <= 0) statusHtml = `${SVG_TROPHY} ${t('battlesim186.status.victory')}`;
    over = notReady || f.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  }
  el.innerHTML = statusHtml;
  document.getElementById('sim186-round').disabled = over;
}

// Give each crew stat a full-width row so badges cannot squeeze out the inputs.
function _renderCrewHtml(d) {
  return CREW.map(([key, , isOfficer]) => {
    const c = d.crew[key];
    const badges = [
      isOfficer ? t('battlesim186.badge.officer_penalty') : '',
      !c.alive ? t('battlesim186.badge.down') : '',
      c.replaced ? t('battlesim186.badge.replacement') : '',
    ].filter(Boolean);
    const badgeHtml = badges.length ? `<div class="bsim-tech-desc">${escapeHtml(badges.join(' · '))}</div>` : '';
    const replaceBtn = key !== 'captain'
      ? `<div class="bsim-tech-footer"><button class="inv-edit-done bsim-tech-btn" data-replace="${key}" ${_notReady(d) ? 'disabled' : ''}>${t('battlesim186.btn.replace')}</button></div>`
      : '';
    return `
    <div class="bsim-tech-row">
      <div class="bsim-tech-name">${escapeHtml(t(`battlesim186.crew.${key}`))}</div>
      ${badgeHtml}
      <div class="inv-edit-row">
        <span class="inv-edit-label bsim-stat-label">${t('battlesim186.ui.skill')}</span>
        <div class="inv-qty-wrap">
          <button class="inv-qty-btn" data-id="sim186-${key}-skill" data-delta="-1">−</button>
          <input id="sim186-${key}-skill" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
          <button class="inv-qty-btn" data-id="sim186-${key}-skill" data-delta="1">+</button>
        </div>
      </div>
      <div class="inv-edit-row">
        <span class="inv-edit-label bsim-stat-label">${t('battlesim186.ui.stamina')}</span>
        <div class="inv-qty-wrap">
          <button class="inv-qty-btn" data-id="sim186-${key}-stamina" data-delta="-1">−</button>
          <input id="sim186-${key}-stamina" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
          <button class="inv-qty-btn" data-id="sim186-${key}-stamina" data-delta="1">+</button>
        </div>
      </div>
      ${replaceBtn}
    </div>`;
  }).join('');
}

// Rebuild crew markup only for structural changes; update values in place to preserve typing focus.
let _crewHtmlBuilt = false;
function _renderCrewList(d, force) {
  const el = document.getElementById('sim186-crew-list');
  if (!el) return;
  if (force || !_crewHtmlBuilt) {
    el.innerHTML = _renderCrewHtml(d);
    _crewHtmlBuilt = true;
  }
}

function _renderCrewValues(d) {
  for (const [key] of CREW) {
    const c = d.crew[key];
    const skillEl = document.getElementById(`sim186-${key}-skill`);
    const stamEl  = document.getElementById(`sim186-${key}-stamina`);
    if (skillEl) skillEl.value = c.skill;
    if (stamEl)  stamEl.value  = Math.min(c.stamina, c.staminaInitial);
  }
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim186-history-summary');
  const listEl = document.getElementById('sim186-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim186.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim186.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim186.history.won') : t('battlesim186.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.fighter)} vs ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${escapeHtml(h.mode)} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim186-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs(forceCrewRebuild = false) {
  const d = _data();
  if (!d) return;

  _renderCrewList(d, forceCrewRebuild);
  _renderCrewValues(d);

  document.getElementById('sim186-luck').value    = d.luck;
  document.getElementById('sim186-luckmax').value = d.luckInitial;
  document.getElementById('sim186-ship-weapons').value    = d.ship.weapons;
  document.getElementById('sim186-ship-weaponsmax').value = d.ship.weaponsInitial;
  document.getElementById('sim186-ship-shields').value    = Math.min(d.ship.shields, d.ship.shieldsInitial);
  document.getElementById('sim186-ship-shieldsmax').value = d.ship.shieldsInitial;

  const rollBtn = document.getElementById('sim186-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim186.btn.rolled') : t('battlesim186.btn.roll');

  document.getElementById('sim186-item-helmet').checked = d.hasHelmet;
  document.getElementById('sim186-mode').value = d.mode;
  document.getElementById('sim186-fighter').value = d.fighterKey;
  document.getElementById('sim186-atkmod').value = d.attackModifier;
  document.getElementById('sim186-waive-officer').checked = d.waiveOfficerPenalty;
  document.getElementById('sim186-enemy-dmg').value = d.enemyDamageVariant;
  document.getElementById('sim186-player-dmg').value = d.playerDamageVariant;
  document.getElementById('sim186-enemy-extra').checked = d.enemyExtraAttack;
  document.getElementById('sim186-phaser-setting').value = d.phaserSetting;
  document.getElementById('sim186-phaser-enemy-first').checked = d.enemyFiresFirst;
  document.getElementById('sim186-ship-enemy-first').checked = d.enemyFiresFirst;
  document.getElementById('sim186-extra-toggle').checked = d.extraAttacker;
  document.getElementById('sim186-extra-target').value = d.extraTarget;
  document.getElementById('sim186-extra-skill').value = d.extraSkill;

  document.getElementById('sim186-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim186-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim186-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim186-enemy-staminamax').value = d.enemy.staminaMax;

  document.getElementById('sim186-enemyship-pick').value = d.enemyShip.name;
  document.getElementById('sim186-enemyship-weapons').value = d.enemyShip.weapons;
  document.getElementById('sim186-enemyship-shields').value    = Math.min(d.enemyShip.shields, d.enemyShip.shieldsMax);
  document.getElementById('sim186-enemyship-shieldsmax').value = d.enemyShip.shieldsMax;

  const handtohandFields = document.getElementById('sim186-handtohand-fields');
  const phaserFields     = document.getElementById('sim186-phaser-fields');
  const shipFields       = document.getElementById('sim186-ship-fields');
  const crewCombatFields = document.getElementById('sim186-crew-combat-fields');
  const enemyStaminaFields = document.getElementById('sim186-enemy-stamina-fields');
  handtohandFields.style.display = d.mode === 'handtohand' ? '' : 'none';
  phaserFields.style.display     = d.mode === 'phaser' ? '' : 'none';
  shipFields.style.display       = d.mode === 'ship' ? '' : 'none';
  crewCombatFields.style.display = d.mode === 'ship' ? 'none' : '';
  // Phaser combat ends on a hit; STAMINA is not used.
  enemyStaminaFields.style.display = d.mode === 'phaser' ? 'none' : '';

  _renderStatus();
}

// Combat actions may change crew status, so force a structural refresh here.
function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim186() {
  const overlay = document.getElementById('sim186-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim186(); return; }
  _renderAll();
}

function openSim186() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim186-overlay').classList.add('active');
}

function closeSim186() {
  document.getElementById('sim186-overlay')?.classList.remove('active');
}

export function setSim186Visible(visible) {
  const btn = document.getElementById('sim186-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim186();
}

// Both enemy pickers share book_enemies; ship rows use attack/hp for weapons/shields.

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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${e.attack ?? '?'}/${e.hp ?? '?'}</span></li>`
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

export function initSim186() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim186-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim186-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim186-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim186.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim186.ui.luck'), 'sim186-luck')}
            ${_numField(t('battlesim186.ui.luck_initial'), 'sim186-luckmax')}
            <details class="bsim-history" open>
              <summary>${t('battlesim186.ui.crew')}</summary>
              <div id="sim186-crew-list" class="bsim-tech-list"></div>
            </details>
            <details class="bsim-history">
              <summary>${t('battlesim186.ui.items')}</summary>
              <div class="bsim-tech-list">
                <div class="bsim-tech-row">
                  <div class="bsim-tech-name">${t('battlesim186.ui.item_helmet_name')} <span class="bsim-tech-uses">(sec. 269)</span></div>
                  <div class="bsim-tech-desc">${t('battlesim186.ui.item_helmet_desc', { n: HELMET_SKILL_BONUS })}</div>
                  <div class="bsim-tech-footer"><label class="inv-edit-check-label"><input type="checkbox" id="sim186-item-helmet" class="inv-edit-check"> ${t('battlesim186.ui.have_it')}</label></div>
                </div>
              </div>
            </details>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim186.ui.combat_type')}</span>
              <select id="sim186-mode" class="inv-edit-input bsim-select">
                <option value="handtohand">${t('battlesim186.ui.mode_handtohand')}</option>
                <option value="phaser">${t('battlesim186.ui.mode_phaser')}</option>
                <option value="ship">${t('battlesim186.ui.mode_ship')}</option>
              </select>
            </div>
          </div>
          <div id="sim186-crew-combat-fields" class="bsim-side">
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim186.ui.fighter')}</span>
              <select id="sim186-fighter" class="inv-edit-input bsim-select">
                ${CREW.map(([key]) => `<option value="${key}">${escapeHtml(t(`battlesim186.crew.${key}`))}</option>`).join('')}
              </select>
            </div>
            ${_numField(t('battlesim186.ui.atk_mod'), 'sim186-atkmod')}
            <div class="inv-edit-row bsim-ae-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim186-waive-officer" class="inv-edit-check"> ${t('battlesim186.ui.waive_officer', { n: OFFICER_PENALTY })}</label>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim186.ui.enemy_hit_dmg')}</span>
              <select id="sim186-enemy-dmg" class="inv-edit-input bsim-select">
                <option value="normal">${t('battlesim186.ui.dmg_normal', { n: NORMAL_DMG })}</option>
                <option value="nerve">${t('battlesim186.ui.dmg_nerve')}</option>
              </select>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim186.ui.your_hit_dmg')}</span>
              <select id="sim186-player-dmg" class="inv-edit-input bsim-select">
                <option value="normal">${t('battlesim186.ui.dmg_normal', { n: NORMAL_DMG })}</option>
                <option value="armor">${t('battlesim186.ui.dmg_armor')}</option>
              </select>
            </div>
            <div id="sim186-handtohand-fields">
              <div class="inv-edit-row bsim-ae-row">
                <label class="inv-edit-check-label"><input type="checkbox" id="sim186-enemy-extra" class="inv-edit-check"> ${t('battlesim186.ui.enemy_extra')}</label>
              </div>
              <div class="inv-edit-row bsim-ae-row">
                <label class="inv-edit-check-label"><input type="checkbox" id="sim186-extra-toggle" class="inv-edit-check"> ${t('battlesim186.ui.extra_toggle')}</label>
              </div>
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim186.ui.extra_targets')}</span>
                <select id="sim186-extra-target" class="inv-edit-input bsim-select">
                  <option value="enemy">${t('battlesim186.ui.extra_target_enemy')}</option>
                  <option value="you">${t('battlesim186.ui.extra_target_you')}</option>
                </select>
              </div>
              ${_numField(t('battlesim186.ui.extra_skill'), 'sim186-extra-skill')}
            </div>
            <div id="sim186-phaser-fields" style="display:none">
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim186.ui.phaser_setting')}</span>
                <select id="sim186-phaser-setting" class="inv-edit-input bsim-select">
                  <option value="kill">${t('battlesim186.ui.phaser_kill')}</option>
                  <option value="stun">${t('battlesim186.ui.phaser_stun')}</option>
                </select>
              </div>
              <div class="inv-edit-row bsim-ae-row">
                <label class="inv-edit-check-label"><input type="checkbox" id="sim186-phaser-enemy-first" class="inv-edit-check"> ${t('battlesim186.ui.phaser_enemy_first')}</label>
              </div>
              <div class="bsim-tech-desc">${t('battlesim186.ui.phaser_note')}</div>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim186.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim186-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim186-enemy-pick-dropdown">
                <ul id="sim186-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim186.ui.enemy_skill'), 'sim186-enemy-skill')}
            <div id="sim186-enemy-stamina-fields">
              ${_numField(t('battlesim186.ui.enemy_stamina'), 'sim186-enemy-stamina')}
              ${_numField(t('battlesim186.ui.enemy_stamina_max'), 'sim186-enemy-staminamax')}
            </div>
          </div>
          <div id="sim186-ship-fields" class="bsim-side" style="display:none">
            <div class="bsim-side-title">${t('battlesim186.ui.your_ship')}</div>
            ${_numField(t('battlesim186.ui.weapons'), 'sim186-ship-weapons')}
            ${_numField(t('battlesim186.ui.weapons_initial'), 'sim186-ship-weaponsmax')}
            ${_numField(t('battlesim186.ui.shields'), 'sim186-ship-shields')}
            ${_numField(t('battlesim186.ui.shields_initial'), 'sim186-ship-shieldsmax')}
            <div class="bsim-side-title">${t('battlesim186.ui.alien_ship')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim186.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim186-enemyship-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim186-enemyship-pick-dropdown">
                <ul id="sim186-enemyship-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim186.ui.alien_weapons'), 'sim186-enemyship-weapons')}
            ${_numField(t('battlesim186.ui.alien_shields'), 'sim186-enemyship-shields')}
            ${_numField(t('battlesim186.ui.alien_shields_max'), 'sim186-enemyship-shieldsmax')}
            <div class="inv-edit-row bsim-ae-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim186-ship-enemy-first" class="inv-edit-check"> ${t('battlesim186.ui.alien_fires_first')}</label>
            </div>
          </div>
          <div id="sim186-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim186-round" class="inv-add-btn bsim-action-primary">${t('battlesim186.btn.round')}</button>
            <button id="sim186-reset" class="inv-add-btn">${t('battlesim186.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim186-history-summary">${t('battlesim186.history.summary', { n: 0 })}</summary>
            <div id="sim186-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim186-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim186-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim186);
  document.getElementById('sim186-close').addEventListener('click', closeSim186);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim186(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim186-overlay'),
    open:  openSim186,
    close: closeSim186,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim186();
  });

  document.getElementById('sim186-round').addEventListener('click', _runRound);
  document.getElementById('sim186-reset').addEventListener('click', _resetBattle);

  document.getElementById('sim186-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    for (const [key] of CREW) {
      const c = d.crew[key];
      c.skillInitial   = _roll1d6() + 6;
      c.staminaInitial = _roll2d6() + 12;
      c.skill   = c.skillInitial;
      c.stamina = c.staminaInitial;
      c.alive = true;
      c.replaced = false;
    }
    d.luckInitial = _roll1d6() + 6;
    d.luck = d.luckInitial;
    d.ship.weaponsInitial = _roll1d6() + 6;
    d.ship.shieldsInitial = _roll1d6() + 12;
    d.ship.weapons = d.ship.weaponsInitial;
    d.ship.shields = d.ship.shieldsInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim186.log.rolled'));
    saveState();
    _renderAll();
  });

  document.getElementById('sim186-item-helmet').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.hasHelmet = e.target.checked;
    saveState();
    _renderInputs();
  });
  document.getElementById('sim186-waive-officer').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.waiveOfficerPenalty = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim186-mode').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.mode = e.target.value;
    d.roundsThisBattle = 0;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim186-fighter').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.fighterKey = e.target.value;
    d.roundsThisBattle = 0;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim186-enemy-dmg').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.enemyDamageVariant = e.target.value;
    saveState();
  });
  document.getElementById('sim186-player-dmg').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.playerDamageVariant = e.target.value;
    saveState();
  });
  document.getElementById('sim186-enemy-extra').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.enemyExtraAttack = e.target.checked;
    saveState();
  });
  document.getElementById('sim186-phaser-setting').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.phaserSetting = e.target.value;
    saveState();
  });
  // Keep Phaser/Ship checkboxes synchronized with the shared enemyFiresFirst flag.
  document.getElementById('sim186-phaser-enemy-first').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.enemyFiresFirst = e.target.checked;
    saveState();
    _renderInputs();
  });
  document.getElementById('sim186-ship-enemy-first').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.enemyFiresFirst = e.target.checked;
    saveState();
    _renderInputs();
  });
  document.getElementById('sim186-extra-toggle').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.extraAttacker = e.target.checked;
    saveState();
  });
  document.getElementById('sim186-extra-target').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.extraTarget = e.target.value;
    saveState();
  });

  document.getElementById('sim186-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  document.getElementById('sim186-enemyship-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemyShip.name = e.target.value;
    saveState();
  });

  document.getElementById('sim186-crew-list').addEventListener('click', e => {
    const btnEl = e.target.closest('[data-replace]');
    if (!btnEl) return;
    _replaceCrewMember(btnEl.dataset.replace);
  });

  // Plain numeric steppers. Attack modifier and extra-attacker SKILL can go
  // negative/zero freely; everything else clamps at 0.
  const FIELD_MAP = {
    'sim186-luck':    ['top', 'luck', 0],
    'sim186-luckmax': ['top', 'luckInitial', 0],
    'sim186-atkmod':  ['top', 'attackModifier', -9],
    'sim186-extra-skill': ['top', 'extraSkill', 0],
    'sim186-ship-weapons':    ['ship', 'weapons', 0],
    'sim186-ship-weaponsmax': ['ship', 'weaponsInitial', 0],
    'sim186-ship-shields':    ['ship', 'shields', 0],
    'sim186-ship-shieldsmax': ['ship', 'shieldsInitial', 0],
    'sim186-enemy-skill':       ['enemy', 'skill', 0],
    'sim186-enemy-stamina':        ['enemy', 'stamina', 0],
    'sim186-enemy-staminamax':     ['enemy', 'staminaMax', 0],
    'sim186-enemyship-weapons':    ['enemyShip', 'weapons', 0],
    'sim186-enemyship-shields':    ['enemyShip', 'shields', 0],
    'sim186-enemyship-shieldsmax': ['enemyShip', 'shieldsMax', 0],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    if (id.match(/^sim186-(captain|science|medical|engineering|security|guard1|guard2)-(skill|stamina)$/)) {
      const [, key, stat] = id.match(/^sim186-([a-z0-9]+)-(skill|stamina)$/);
      const c = d.crew[key];
      if (!c) return;
      val = Math.max(0, val);
      if (stat === 'skill') val = Math.min(val, c.skillInitial);
      if (stat === 'stamina') val = Math.min(val, c.staminaInitial);
      c[stat] = val;
      saveState();
      _renderInputs();
      return;
    }
    const map = FIELD_MAP[id];
    if (!map) return;
    const [group, key, min] = map;
    val = Math.max(min, val);
    if (id === 'sim186-luck') val = Math.min(val, d.luckInitial);
    if (id === 'sim186-ship-shields') val = Math.min(val, d.ship.shieldsInitial);
    if (id === 'sim186-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim186-enemyship-shields') val = Math.min(val, d.enemyShip.shieldsMax);
    if (group === 'top') d[key] = val;
    else d[group][key] = val;
    if (id === 'sim186-luckmax') d.luck = Math.min(d.luck, val);
    if (id === 'sim186-ship-shieldsmax') d.ship.shields = Math.min(d.ship.shields, val);
    if (id === 'sim186-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    if (id === 'sim186-enemyship-shieldsmax') d.enemyShip.shields = Math.min(d.enemyShip.shields, val);
    saveState();
    _renderInputs();
  }
  overlay.addEventListener('input', e => {
    const input = e.target;
    if (!input.classList?.contains('inv-qty-input') || !input.id.startsWith('sim186-')) return;
    const map = FIELD_MAP[input.id];
    const allowNeg = map ? map[2] < 0 : false;
    const raw = String(input.value).replace(allowNeg ? /[^0-9-]/g : /[^0-9]/g, '');
    if (raw !== input.value) input.value = raw;
    _applyField(input.id, Number(raw) || 0);
  });
  overlay.addEventListener('click', e => {
    const btnEl = e.target.closest('.inv-qty-btn');
    if (!btnEl || !btnEl.dataset.id?.startsWith('sim186-')) return;
    const input = document.getElementById(btnEl.dataset.id);
    if (!input) return;
    const map = FIELD_MAP[btnEl.dataset.id];
    const min = map ? map[2] : 0;
    const next = Math.max(min, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
    _applyField(btnEl.dataset.id, next);
  });

  // Reset encounter-specific settings when selecting another enemy.
  function _resetEncounterKnobs(d) {
    d.attackModifier = 0;
    d.waiveOfficerPenalty = false;
    d.enemyDamageVariant = 'normal';
    d.playerDamageVariant = 'normal';
    d.enemyExtraAttack = false;
    d.phaserSetting = 'kill';
    d.enemyFiresFirst = false;
    d.extraAttacker = false;
    d.extraTarget = 'enemy';
    d.extraSkill = 0;
  }
  _setupAutocomplete('sim186-enemy-pick', 'sim186-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.skill = enemy.attack;
    if (enemy.hp != null)     { d.enemy.stamina = enemy.hp; d.enemy.staminaMax = enemy.hp; }
    d.roundsThisBattle = 0;
    _resetEncounterKnobs(d);
    saveState();
    _renderAll();
  });
  _setupAutocomplete('sim186-enemyship-pick', 'sim186-enemyship-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    _startShipFight(d, enemy);
    _resetEncounterKnobs(d);
    saveState();
    _renderAll();
  });
}

function _numField(label, id, width) {

  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <div class="inv-qty-wrap">
        <button class="inv-qty-btn" data-id="${id}" data-delta="-1">−</button>
        <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric"${width ? ` style="width:${width}"` : ''}>
        <button class="inv-qty-btn" data-id="${id}" data-delta="1">+</button>
      </div>
    </div>`;
}

export { initSim186 as init, renderSim186 as render, setSim186Visible as setVisible };
