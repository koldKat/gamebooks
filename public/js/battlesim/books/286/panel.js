import { DREAM_ENCOUNTERS, MAX_LIFE_ROLLS, TECH_ATTEMPT_COST, WEAPONS, SHIELDS, TECH_ITEMS } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ DREAM_ENCOUNTERS, ALL_PANEL_OVERLAY_IDS, MAX_LIFE_ROLLS, SHIELDS, SVG_SKULL, SVG_TROPHY, TECH_ATTEMPT_COST, TECH_ITEMS, WEAPONS, _activateTech, _advanceTarget, _allEnemiesDefeated, _appendLog, _checkField, _data, _dream3Finish, _dream3Roll, _dream3Stop, _enemyAttackOnce, _enemyList, _enemyName, _enemyNameSafe, _enemyTurn, _heal, _loadEnemyList, _loadoutAE, _notReady, _numField, _playerAttackOnce, _recordOutcome, _renderAll, _renderEffectsBadges, _renderHistory, _renderInputs, _renderLog, _renderStatus, _resetBattle, _resolveDream, _resolveExtraAttackers, _roll1d6, _roll2d6, _runRound, _setupEnemyAutocomplete, _shieldDef, _sleepAttempt, _startGroup, _syncGroup, _techButtonsHtml, _techDesc, _techName, _totalPlayerDef, _weaponIsGlove, _weaponMinHit, apiFetch, closeSim286, currentBookId, currentPlaythrough, escapeHtml, getPlayBtnRow, initSim286, openSim286, registerPanelShortcut, renderSim286, saveState, setSim286Visible, shortcutLabel, showAlert, t });
const { _data, _notReady, _appendLog, _recordOutcome } = createState(simulatorContext);
const { _techName, _techDesc, _loadoutAE, _roll2d6, _roll1d6, _enemyName, _enemyNameSafe, _startGroup, _syncGroup, _allEnemiesDefeated, _advanceTarget, _enemyTurn, _weaponMinHit, _weaponIsGlove, _shieldDef, _totalPlayerDef, _playerAttackOnce, _enemyAttackOnce, _resolveExtraAttackers, _runRound, _heal, _resetBattle, _activateTech, _sleepAttempt, _resolveDream, _dream3Finish, _dream3Roll, _dream3Stop } = createCombat(simulatorContext);
// END SIMULATOR WIRING
// Battle Simulator (В лабиринта на времето, book 286)
// Weapon damage = max(0,2d6-minHit), with glove/tech bonuses; shields reduce incoming damage.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from "../../../core/state.js";
import { showAlert } from "../../../ui-helpers/confirm.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";

// Book rule: initial life roll (2d6×4) plus up to 2 rerolls, 3 throws total per run.

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Weapons: [key,label,minHit,energyCost]. Glove hits add +5 even at minHit and cost no AE.
// Custom weapon cost is entered manually.

// Shields: [key,negative defense reduction,energyCost]; labels come from translations.

// Tech attempts cost 3 HP and require 2d6>=6; failed attempts still consume a use.
// Revive instead costs 15 HP and rewinds the battle once.

// A troubled-sleep result (2-5 on 2d6) triggers a second roll selecting dreams 2-12.
// Dream 9 is instant death; dream 11 loses 5 life.

// Require both starting rolls before combat, healing, sleep, or tech use.

// Only weapon and shield count toward AE; glove and tech are separate gifts.

// Escape free-text names in HTML logs; store history names raw and escape once when rendered.

// Store extra defense as a positive stepper value; negate it when adding shield/armour protection.

// Damage is max(0, roll-minHit), plus glove bonus (+5; upgraded boss +10) and pending tech.
// Consume one-shot tech on the first successful hit.

// Extra identical attackers share enemy stats but roll independently; override their log labels.

// Each surviving extra attacker strikes independently; only the tracked enemy pool is woundable.

// Keep lifetime outcomes: admin totals require the full history.

// Player attacks first unless the encounter's enemyFirst flag reverses the order.

// Heal only outside combat, once per battle cycle as the simulator's episode proxy.

// ── Tech gadgets ─────────────────────────────────────────────────────────────

// ── Sleep / dream table ──────────────────────────────────────────────────────

// ── Render ────────────────────────────────────────────────────────────────

function _renderHistory() {
  const d = _data();
  const summaryEl = document.getElementById('sim286-history-summary');
  const listEl    = document.getElementById('sim286-history-list');
  if (!d || !summaryEl || !listEl) return;
  const hist = d.history;
  summaryEl.textContent = t('battlesim286.history.summary', { n: hist.length });
  if (!hist.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim286.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = hist.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim286.history.won') : t('battlesim286.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">ТЖ ${h.playerLife}/${h.playerLifeMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim286-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim286-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  if (notReady)                el.innerHTML = t('battlesim286.status.not_ready');
  else if (d.player.life <= 0) el.innerHTML = `${SVG_SKULL} ${t('battlesim286.status.fallen')}`;
  else if (_allEnemiesDefeated(d)) el.innerHTML = `${SVG_TROPHY} ${t('battlesim286.status.victory')}`;
  else                         el.innerHTML = '';
  const over = notReady || d.player.life <= 0 || _allEnemiesDefeated(d);
  document.getElementById('sim286-round').disabled = over || !!d.dream3;
  // Recovery rules 1+3: no healing mid-fight, and only once per battle-cycle.
  const midFight = d.roundsThisBattle > 0 && !over;
  document.getElementById('sim286-heal').disabled = over || midFight || d.healUsedThisBattle || !!d.dream3;
  // "Не можеш да спиш, докато си нападнат" - same mid-fight block as healing.
  document.getElementById('sim286-sleep').disabled = notReady || d.player.life <= 0 || midFight || !!d.dream3;
  document.getElementById('sim286-reset').disabled = !!d.dream3;
  document.getElementById('sim286-dream3').style.display = d.dream3 ? '' : 'none';
  document.getElementById('sim286-dream3-total').textContent = t('battlesim286.dream3.total', { total: d.dream3?.total || 0 });
  document.getElementById('sim286-dream3-stop').disabled = !d.dream3?.total;
  _renderEffectsBadges(d);
}

function _renderEffectsBadges(d) {
  const el = document.getElementById('sim286-effects');
  if (!el) return;
  const badges = [];
  if (d.effects.tempShield)   badges.push(t('battlesim286.badge.temp_shield'));
  if (d.effects.doubleAttack) badges.push(t('battlesim286.badge.double_attack'));
  if (d.effects.pendingBonus > 0) badges.push(t('battlesim286.badge.pending_bonus', { n: d.effects.pendingBonus }));
  if (d.effects.enemyStun > 0) badges.push(t('battlesim286.badge.enemy_stun', { n: d.effects.enemyStun }));
  el.textContent = badges.join(' · ');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim286-player-life').value    = Math.min(d.player.life, d.player.lifeMax);
  document.getElementById('sim286-player-lifemax').value = d.player.lifeMax;
  document.getElementById('sim286-enemy-first').checked  = d.player.enemyFirst;
  const lifeRollBtn = document.getElementById('sim286-life-roll');
  lifeRollBtn.disabled   = d.lifeRollCount >= MAX_LIFE_ROLLS;
  lifeRollBtn.textContent = t('battlesim286.btn.life_roll', { count: d.lifeRollCount, max: MAX_LIFE_ROLLS });
  const aeRollBtn = document.getElementById('sim286-ae-roll');
  aeRollBtn.disabled   = d.aeRolled;
  aeRollBtn.textContent = d.aeRolled ? t('battlesim286.btn.ae_rolled') : t('battlesim286.btn.ae_roll');
  document.getElementById('sim286-weapon').value  = d.player.weaponKey;
  document.getElementById('sim286-shield').value  = d.player.shieldKey;
  const customRow = document.getElementById('sim286-custom-minhit-row');
  if (customRow) customRow.style.display = d.player.weaponKey === 'custom' ? 'flex' : 'none';
  document.getElementById('sim286-custom-minhit').value = d.player.customMinHit;
  const customAeRow = document.getElementById('sim286-custom-ae-row');
  if (customAeRow) customAeRow.style.display = d.player.weaponKey === 'custom' ? 'flex' : 'none';
  document.getElementById('sim286-custom-ae').value = d.player.customAeCost;
  const gloveBonusRow = document.getElementById('sim286-glove-bonus-row');
  if (gloveBonusRow) gloveBonusRow.style.display = _weaponIsGlove(d) ? 'flex' : 'none';
  document.getElementById('sim286-glove-bonus').value = d.player.gloveBonus;
  document.getElementById('sim286-extra-def').value = d.player.extraDef;
  const aeSpent = _loadoutAE(d);
  const aeEl = document.getElementById('sim286-ae-display');
  if (aeEl) {
    aeEl.textContent = t('battlesim286.ui.ae_display', { spent: aeSpent, max: d.player.aeMax });
    aeEl.classList.toggle('bsim-ae-over', aeSpent > d.player.aeMax);
  }

  document.getElementById('sim286-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim286-enemy-hp').value      = d.enemy.hp;
  document.getElementById('sim286-enemy-hpmax').value   = d.enemy.hpMax;
  document.getElementById('sim286-enemy-minhit').value  = d.enemy.minHit;
  document.getElementById('sim286-enemy-fixeddmg').value = d.enemy.fixedDamage;
  document.getElementById('sim286-enemy-extra').value    = d.enemy.extraAttackers;
  document.getElementById('sim286-enemy-extra').disabled = !!d.group && d.roundsThisBattle > 0;
  const target = document.getElementById('sim286-target');
  target.closest('.inv-edit-row').style.display = d.group?.hp.length > 1 ? '' : 'none';
  target.innerHTML = d.group ? d.group.hp.map((hp, i) => `<option value="${i}" ${hp <= 0 ? 'disabled' : ''}>${escapeHtml(t('battlesim286.ui.group_member', { n: i + 1 }))}: ${i === d.group.target ? d.enemy.hp : hp}/${d.enemy.hpMax}</option>`).join('') : '';
  target.value = String(d.group?.target || 0);
  target.disabled = !!d.dream3 || d.player.life <= 0;

  document.getElementById('sim286-tech-list').innerHTML = _techButtonsHtml(d);
  _renderStatus(); // also renders the effects badges, as its last step
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim286() {
  const overlay = document.getElementById('sim286-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim286(); return; }
  _renderAll();
}

function openSim286() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim286-overlay').classList.add('active');
}

function closeSim286() {
  document.getElementById('sim286-overlay')?.classList.remove('active');
}

export function setSim286Visible(visible) {
  const btn = document.getElementById('sim286-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim286();
}

// Enemy autocomplete stores minimum-hit thresholds in attack.

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
  const input    = document.getElementById('sim286-enemy-pick');
  const dropdown = document.getElementById('sim286-enemy-pick-dropdown');
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
      `<li role="option" id="sim286-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim286.ui.ac_life')}:${e.hp ?? '?'} ${t('battlesim286.ui.ac_minhit')}:${e.attack ?? '?'}</span></li>`
    ).join('');
    activeIdx = -1;
    dropdown.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
  }

  function select(enemy) {
    const d = _data();
    if (!d || !enemy || d.dream3) return;
    input.value = enemy.name;
    d.enemy.name = enemy.name;
    if (enemy.hp != null)     { d.enemy.hp = enemy.hp; d.enemy.hpMax = enemy.hp; }
    if (enemy.attack != null) d.enemy.minHit = enemy.attack;
    // Reset manual fixed-damage/multi-attacker settings on enemy selection; roster labels indicate exceptions.
    d.enemy.fixedDamage = 0;
    d.enemy.extraAttackers = 0;
    d.battleStart = { playerLife: d.player.life, enemyHp: d.enemy.hp };
    d.roundsThisBattle = 0;
    _startGroup(d);
    d.healUsedThisBattle = false;
    closeDropdown();
    saveState();
    _renderAll();
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

export function initSim286() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim286-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim286.ui.title')}</span>
        <button id="sim286-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim286.ui.you')}</div>
            ${_numField(t('battlesim286.ui.life'), 'sim286-player-life')}
            ${_numField(t('battlesim286.ui.life_max'), 'sim286-player-lifemax')}
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim286-life-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim286.btn.life_roll_static')}</button>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim286.ui.weapon')}</span>
              <select id="sim286-weapon" class="inv-edit-input bsim-select">
                ${WEAPONS.map(w => `<option value="${w[0]}">${escapeHtml(t(`battlesim286.weapon.${w[0]}`))}${w[2] != null ? ` (${w[2]} АЕ)` : ''}</option>`).join('')}
              </select>
            </div>
            <div id="sim286-custom-minhit-row" class="inv-edit-row" style="display:none">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim286.ui.custom_minhit')}</span>
              <div class="inv-qty-wrap">
                <button class="inv-qty-btn" data-id="sim286-custom-minhit" data-delta="-1">−</button>
                <input id="sim286-custom-minhit" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
                <button class="inv-qty-btn" data-id="sim286-custom-minhit" data-delta="1">+</button>
              </div>
            </div>
            <div id="sim286-custom-ae-row" class="inv-edit-row" style="display:none">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim286.ui.custom_ae')}</span>
              <div class="inv-qty-wrap">
                <button class="inv-qty-btn" data-id="sim286-custom-ae" data-delta="-1">−</button>
                <input id="sim286-custom-ae" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
                <button class="inv-qty-btn" data-id="sim286-custom-ae" data-delta="1">+</button>
              </div>
            </div>
            <div id="sim286-glove-bonus-row" class="inv-edit-row" style="display:none">
              <span class="inv-edit-label bsim-stat-label" data-tooltip="${t('battlesim286.ui.glove_bonus_tooltip')}">${t('battlesim286.ui.glove_bonus')}</span>
              <div class="inv-qty-wrap">
                <button class="inv-qty-btn" data-id="sim286-glove-bonus" data-delta="-1">−</button>
                <input id="sim286-glove-bonus" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
                <button class="inv-qty-btn" data-id="sim286-glove-bonus" data-delta="1">+</button>
              </div>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label" data-tooltip="${t('battlesim286.ui.extra_def_tooltip')}">${t('battlesim286.ui.extra_def')}</span>
              <div class="inv-qty-wrap">
                <button class="inv-qty-btn" data-id="sim286-extra-def" data-delta="-1">−</button>
                <input id="sim286-extra-def" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
                <button class="inv-qty-btn" data-id="sim286-extra-def" data-delta="1">+</button>
              </div>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim286.ui.shield')}</span>
              <select id="sim286-shield" class="inv-edit-input bsim-select">
                ${SHIELDS.map(s => `<option value="${s[0]}">${escapeHtml(t(`battlesim286.shield.${s[0]}`))}${s[2] ? ` (${s[2]} АЕ)` : ''}</option>`).join('')}
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim286.ui.charge')}</span>
              <span id="sim286-ae-display" class="bsim-ae-display"></span>
              <button id="sim286-ae-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim286.btn.ae_roll')}</button>
            </div>
            ${_checkField(t('battlesim286.ui.enemy_first'), 'sim286-enemy-first', t('battlesim286.ui.enemy_first_note'))}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim286.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim286.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim286-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim286-enemy-pick-dropdown">
                <ul id="sim286-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim286.ui.life'), 'sim286-enemy-hp')}
            ${_numField(t('battlesim286.ui.life_max'), 'sim286-enemy-hpmax')}
            ${_numField(t('battlesim286.ui.enemy_minhit'), 'sim286-enemy-minhit')}
            ${_numField(t('battlesim286.ui.enemy_fixeddmg'), 'sim286-enemy-fixeddmg')}
            ${_numField(t('battlesim286.ui.enemy_extra'), 'sim286-enemy-extra')}
            <label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${t('battlesim286.ui.target')}</span><select id="sim286-target" class="inv-edit-input"></select></label>
          </div>
          <details class="bsim-history" open>
            <summary>${t('battlesim286.ui.tech_arsenal')}</summary>
            <div id="sim286-tech-list" class="bsim-tech-list"></div>
          </details>
          <div id="sim286-effects" class="bsim-effects"></div>
          <div id="sim286-status" class="bsim-status"></div>
          <div id="sim286-dream3" class="inv-edit-row" style="display:none">
            <span id="sim286-dream3-total" class="inv-edit-label"></span>
            <button id="sim286-dream3-roll" class="inv-edit-done" type="button">${t('battlesim286.dream3.continue')}</button>
            <button id="sim286-dream3-stop" class="inv-edit-done" type="button">${t('battlesim286.dream3.stop')}</button>
          </div>
          <div class="inv-edit-row bsim-heal-row">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim286.ui.heal')}</span>
            <div class="inv-qty-wrap">
              <button class="inv-qty-btn" data-id="sim286-heal-amount" data-delta="-1" data-min="1">−</button>
              <input id="sim286-heal-amount" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric" value="10">
              <button class="inv-qty-btn" data-id="sim286-heal-amount" data-delta="1" data-min="1">+</button>
            </div>
            <button id="sim286-heal-roll" class="inv-edit-done bsim-heal-btn" type="button" data-tooltip="${t('battlesim286.ui.heal_roll_tooltip')}">${t('battlesim286.btn.heal_roll')}</button>
            <button id="sim286-heal" class="inv-edit-done bsim-heal-btn">${t('battlesim286.btn.heal')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim286-round" class="inv-add-btn bsim-action-primary">${t('battlesim286.btn.round')}</button>
            <button id="sim286-sleep" class="inv-add-btn">${t('battlesim286.btn.sleep')}</button>
            <button id="sim286-reset" class="inv-add-btn">${t('battlesim286.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim286-history-summary">${t('battlesim286.history.summary', { n: 0 })}</summary>
            <div id="sim286-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim286-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim286-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim286);
  document.getElementById('sim286-close').addEventListener('click', closeSim286);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim286(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim286-overlay'),
    open:  openSim286,
    close: closeSim286,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim286();
  });

  document.getElementById('sim286-round').addEventListener('click', _runRound);
  document.getElementById('sim286-sleep').addEventListener('click', _sleepAttempt);
  document.getElementById('sim286-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim286-dream3-roll').addEventListener('click', _dream3Roll);
  document.getElementById('sim286-dream3-stop').addEventListener('click', _dream3Stop);
  document.getElementById('sim286-target').addEventListener('change', e => {
    const d = _data(), index = Number(e.target.value);
    if (!d?.group || d.dream3 || !Number.isInteger(index) || !(d.group.hp[index] > 0)) return;
    _syncGroup(d);
    d.group.target = index;
    d.enemy.hp = d.group.hp[index];
    saveState();
    _renderAll();
  });
  document.getElementById('sim286-heal').addEventListener('click', () => {
    const amount = Number(document.getElementById('sim286-heal-amount').value) || 0;
    _heal(amount);
  });
  // Roll 2d6 into the healing amount field.
  document.getElementById('sim286-heal-roll').addEventListener('click', () => {
    document.getElementById('sim286-heal-amount').value = _roll2d6();
  });

  document.getElementById('sim286-tech-list').addEventListener('click', e => {
    const btnEl = e.target.closest('.bsim-tech-btn');
    if (btnEl) _activateTech(btnEl.dataset.tech);
  });

  // Plain numeric steppers (life/lifeMax/customMinHit/enemy fields/heal amount)
  const FIELD_MAP = {
    'sim286-player-life':     ['player', 'life'],
    'sim286-player-lifemax':  ['player', 'lifeMax'],
    'sim286-custom-minhit':   ['player', 'customMinHit'],
    'sim286-custom-ae':       ['player', 'customAeCost'],
    'sim286-glove-bonus':     ['player', 'gloveBonus'],
    'sim286-extra-def':       ['player', 'extraDef'],
    'sim286-enemy-hp':        ['enemy', 'hp'],
    'sim286-enemy-hpmax':     ['enemy', 'hpMax'],
    'sim286-enemy-minhit':    ['enemy', 'minHit'],
    'sim286-enemy-fixeddmg':  ['enemy', 'fixedDamage'],
    'sim286-enemy-extra':     ['enemy', 'extraAttackers'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    if (d.dream3 || (id === 'sim286-enemy-extra' && d.group && d.roundsThisBattle > 0)) return;
    val = Math.max(0, val);
    if (id === 'sim286-enemy-extra' && d.groupRules) val = Math.min(20, val);
    if (id === 'sim286-player-life') val = Math.min(val, d.player.lifeMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim286-player-lifemax') d.player.life = Math.min(d.player.life, val);
    // Manual HP correction updates the starting snapshot used by revive.
    if (id === 'sim286-enemy-hp' || id === 'sim286-enemy-hpmax') d.battleStart.enemyHp = d.enemy.hp;
    if (d.groupRules && d.roundsThisBattle === 0 && ['sim286-enemy-extra', 'sim286-enemy-hpmax'].includes(id)) _startGroup(d);
    if (id === 'sim286-enemy-hp') _syncGroup(d);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim286-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim286-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input) return;
      const min = Number(btnEl.dataset.min) || 0;
      if (FIELD_MAP[btnEl.dataset.id]) {
        const next = Math.max(min, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
        _applyField(btnEl.dataset.id, next);
      } else {
        const next = Math.max(min, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
        input.value = next;
      }
    });
  });
  document.getElementById('sim286-heal-amount').addEventListener('input', e => {
    const raw = String(e.target.value).replace(/[^0-9]/g, '');
    if (raw !== e.target.value) e.target.value = raw;
  });

  document.getElementById('sim286-weapon').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    const prevKey = d.player.weaponKey;
    d.player.weaponKey = e.target.value;
    const needed = _loadoutAE(d);
    if (needed > d.player.aeMax) {
      d.player.weaponKey = prevKey;
      e.target.value = prevKey;
      showAlert(t('battlesim286.alert.insufficient_ae', { needed, have: d.player.aeMax }));
      return;
    }
    saveState();
    _renderInputs();
  });
  document.getElementById('sim286-shield').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    const prevKey = d.player.shieldKey;
    d.player.shieldKey = e.target.value;
    const needed = _loadoutAE(d);
    if (needed > d.player.aeMax) {
      d.player.shieldKey = prevKey;
      e.target.value = prevKey;
      showAlert(t('battlesim286.alert.insufficient_ae', { needed, have: d.player.aeMax }));
      return;
    }
    saveState();
    _renderInputs();
  });
  // Starting AE is a one-shot roll; only life permits rerolls.
  document.getElementById('sim286-ae-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.aeRolled) return;
    d.player.aeMax = _roll2d6() * 10;
    d.aeRolled = true;
    saveState();
    _renderInputs();
  });
  // "Можеш да опиташ още два пъти и да избереш най-добрия резултат. Но не
  // повече." - starting life allows the initial roll plus 2 rerolls, 3 total.
  document.getElementById('sim286-life-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.lifeRollCount >= MAX_LIFE_ROLLS) return;
    const rolled = _roll2d6() * 4;
    d.player.lifeMax = rolled;
    d.player.life = rolled;
    d.lifeRollCount++;
    saveState();
    _renderInputs();
  });
  document.getElementById('sim286-enemy-first').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.enemyFirst = e.target.checked;
    saveState();
  });
  document.getElementById('sim286-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  _setupEnemyAutocomplete();
}

function _techButtonsHtml(d) {

  // Block gadgets after resolution except the revive, which has its own alive/unused guard.
  // Require starting life/AE rolls for both.
  const notReady = _notReady(d);
  const battleOver = notReady || d.player.life <= 0 || _allEnemiesDefeated(d) || !!d.dream3;
  return TECH_ITEMS.map(item => {
    const s = d.tech[item.key];
    const depleted = item.kind === 'revive'
      ? (s.usesLeft <= 0 || notReady || d.player.life <= 0 || !!d.dream3)
      : (s.usesLeft <= 0 || battleOver);
    const label = item.kind === 'revive'
      ? t('battlesim286.ui.tech_revive_label', { name: _techName(item.key), cost: item.cost })
      : (item.charged && s.activated ? t('battlesim286.ui.tech_fire_label', { name: _techName(item.key) }) : t('battlesim286.ui.tech_activate_label', { name: _techName(item.key) }));
    return `<div class="bsim-tech-row${depleted ? ' bsim-tech-row--depleted' : ''}">
      <div class="bsim-tech-name">${escapeHtml(_techName(item.key))}</div>
      <div class="bsim-tech-desc">${escapeHtml(_techDesc(item.key))}</div>
      <div class="bsim-tech-footer">
        <button class="inv-edit-done bsim-tech-btn" data-tech="${item.key}" ${depleted ? 'disabled' : ''}>${escapeHtml(label)}</button>
        <span class="bsim-tech-uses">${s.usesLeft}/${item.maxUses}</span>
      </div>
    </div>`;
  }).join('');
}

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

function _checkField(label, id, note) {

  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <input id="${id}" type="checkbox" class="inv-edit-check">
      <label for="${id}" class="inv-edit-check-label">${escapeHtml(note)}</label>
    </div>`;
}

export { initSim286 as init, renderSim286 as render, setSim286Visible as setVisible };
