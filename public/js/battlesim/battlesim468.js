// Battle Simulator (Леговището на снежната вещица / Caverns of the Snow Witch - the original 1984
// Ian Livingstone Fighting Fantasy book #4, Bulgarian edition, book 468)
// Fighting Fantasy: opposed 2d6 + SKILL; ties miss, normal wounds cost 2 STAMINA.
// Luck modifies a landed hit; narrative bonuses and unmodeled effects are entered manually.
// Narrative healing/items are applied manually.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../core/state.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim468) {
    pt.sim468 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        attackModifier: 0,
        enemyWoundDamage: 2,
        playerWoundDamage: 2,
        enemyAutoWinFirstRound: false,
        enemyDefeatThreshold: 0,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      combatRulesVersion: 2,
      encounter: { paired: false, breath: '', fear: false, goldRing: false },
      sideEnemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim468;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.playerWoundDamage === undefined) d.player.playerWoundDamage = 2;
  if (d.player.enemyAutoWinFirstRound === undefined) d.player.enemyAutoWinFirstRound = false;
  if (d.player.enemyDefeatThreshold === undefined) d.player.enemyDefeatThreshold = 0;
  return d;
}

function _notReady(d) { return !d.rolled; }

function _roll2d6() { return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }
function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _enemyDefeated(d) { return d.enemy.staminaMax > 0 && d.enemy.stamina <= (d.player.enemyDefeatThreshold || 0); }

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.playerWoundDamage = 2;
  d.player.enemyAutoWinFirstRound = false;
  d.player.enemyDefeatThreshold = 0;
  d.combatRulesVersion = 2;
  d.encounter = { paired: false, breath: '', fear: false, goldRing: d.encounter?.goldRing || false };
  d.sideEnemy = { name: '', skill: 0, stamina: 0, staminaMax: 0 };
  const section = Number(d.enemy.name.match(/§(\d+)\)?$/)?.[1]);
  if ([37, 357].includes(section)) d.player.attackModifier = -2;
  if ([188, 240, 332, 386].includes(section)) d.player.attackModifier = -3;
  if (section === 17) d.player.enemyDefeatThreshold = 2;
  if ([108, 143].includes(section)) d.encounter.breath = 'demon';
  if (section === 223) d.encounter.breath = 'dragon';
  d.encounter.fear = section === 185;
  if ([13, 262, 296].includes(section)) {
    const other = (_enemyList || []).find(enemy => enemy.name !== d.enemy.name && Number(enemy.name.match(/§(\d+)\)?$/)?.[1]) === section);
    if (other) {
      d.encounter.paired = true;
      d.sideEnemy = { name: other.name, skill: other.attack, stamina: other.hp, staminaMax: other.hp };
    }
  }
}

// Keep lifetime outcomes: admin totals require the full history.
function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerStamina: d.player.stamina, playerStaminaMax: d.player.staminaInitial,
    ts: Date.now(),
  });
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _runRound() {
  const d = _data();
  if (d?.combatRulesVersion === 2) return _runSourceRound(d);
  return _runLegacyRound();
}

function _runLegacyRound() {
  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || _enemyDefeated(d) || d.pendingLuckQueue.length) return;
  const isFirstRound = d.roundsThisBattle === 0;
  d.roundsThisBattle++;

  const enemyWoundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const playerWoundDmg = Math.max(1, d.player.playerWoundDamage || 2);

  let playerWins = false, tie = false;
  if (isFirstRound && d.player.enemyAutoWinFirstRound) {
    playerWins = false;
    _appendLog(d, t('battlesim468.log.enemy_firststrike', { enemy: _enemyNameSafe(d) }));
  } else {
    const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
    const enemyAS  = _roll2d6() + d.enemy.skill;
    _appendLog(d, t('battlesim468.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
    if (playerAS === enemyAS) tie = true;
    else playerWins = playerAS > enemyAS;
  }

  if (tie) {
    _appendLog(d, t('battlesim468.log.both_avoided'));
  } else if (playerWins) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - playerWoundDmg);
    _appendLog(d, t('battlesim468.log.you_wound', { enemy: _enemyNameSafe(d), n: playerWoundDmg, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (!_enemyDefeated(d)) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - enemyWoundDmg);
    _appendLog(d, t('battlesim468.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: enemyWoundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  if (_enemyDefeated(d)) {
    _appendLog(d, t('battlesim468.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim468.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

function _sideAlive(d) {
  return d.encounter.paired && d.sideEnemy.staminaMax > 0 && d.sideEnemy.stamina > 0;
}

function _sourceFightOver(d) {
  return _enemyDefeated(d) && !_sideAlive(d);
}

function _finishSourceRound(d) {
  if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim468.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  } else if (!d.pendingLuckQueue.length && _sourceFightOver(d)) {
    _appendLog(d, t('battlesim468.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (!d.pendingLuckQueue.length && _enemyDefeated(d) && _sideAlive(d)) {
    d.enemy.stamina = 0;
    [d.enemy, d.sideEnemy] = [d.sideEnemy, d.enemy];
    d.player.enemyDefeatThreshold = 0;
  }
}

function _receiveSourceHit(d, source) {
  const damage = Math.max(1, d.player.enemyWoundDamage || 2);
  d.player.stamina = Math.max(0, d.player.stamina - damage);
  _appendLog(d, t('battlesim468.log.enemy_wounds', { enemy: source, n: damage, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit', source });
}

function _runSourceRound(d) {
  if (_notReady(d) || d.player.stamina <= 0 || _sourceFightOver(d) || d.enemy.staminaMax <= 0 || d.pendingLuckQueue.length) return;
  let forced = d.roundsThisBattle++ === 0 && d.player.enemyAutoWinFirstRound;
  if (d.encounter.fear) {
    const roll = _roll2d6();
    _appendLog(d, t('battlesim468.log.fear', { roll, skill: d.player.skill }));
    forced ||= roll > d.player.skill;
  }
  const playerAS = forced ? 0 : _roll2d6() + d.player.skill + d.player.attackModifier;
  const enemyAS = forced ? 1 : _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim468.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
  if (playerAS > enemyAS) {
    const damage = Math.max(1, d.player.playerWoundDamage || 2);
    d.enemy.stamina = Math.max(0, d.enemy.stamina - damage);
    _appendLog(d, t('battlesim468.log.you_wound', { enemy: _enemyNameSafe(d), n: damage, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (!_enemyDefeated(d)) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else if (enemyAS > playerAS) _receiveSourceHit(d, _enemyNameSafe(d));
  else _appendLog(d, t('battlesim468.log.both_avoided'));
  if (_sideAlive(d) && d.player.stamina > 0) {
    const playerSideAS = _roll2d6() + d.player.skill + d.player.attackModifier;
    const sideAS = _roll2d6() + d.sideEnemy.skill;
    const sideName = escapeHtml(d.sideEnemy.name);
    _appendLog(d, t('battlesim468.log.round', { round: d.roundsThisBattle, playerAS: playerSideAS, enemy: sideName, enemyAS: sideAS }));
    if (sideAS > playerSideAS) _receiveSourceHit(d, sideName);
    else _appendLog(d, t('battlesim468.log.both_avoided'));
  }
  if (d.encounter.breath && d.player.stamina > 0) {
    const roll = _roll1d6();
    const demon = d.encounter.breath === 'demon';
    const damage = roll <= (demon ? 3 : 2) && (demon || !d.encounter.goldRing) ? (demon ? 1 : 2) : 0;
    d.player.stamina = Math.max(0, d.player.stamina - damage);
    _appendLog(d, t('battlesim468.log.breath', { roll, damage }));
  }
  _finishSourceRound(d);
  saveState();
  _renderAll();
}

function _switchSourceTarget() {
  const d = _data();
  if (d?.combatRulesVersion !== 2 || !_sideAlive(d) || d.pendingLuckQueue.length || d.player.stamina <= 0) return;
  [d.enemy, d.sideEnemy] = [d.sideEnemy, d.enemy];
  d.player.enemyDefeatThreshold = 0;
  saveState();
  _renderAll();
}

// Luck modifies wounds, not the breath's fixed additional loss.
function _testLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    const extra = d.combatRulesVersion === 2 ? 2 : Math.max(1, d.player.playerWoundDamage || 2);
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - extra);
      _appendLog(d, t('battlesim468.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim468.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.combatRulesVersion !== 2 && _enemyDefeated(d)) { _appendLog(d, t('battlesim468.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = event.source || _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim468.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim468.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.combatRulesVersion !== 2 && d.player.stamina <= 0) {
      _appendLog(d, t('battlesim468.log.fallen', { skull: SVG_SKULL }));
      _recordOutcome(d, 'loss');
      d.pendingLuckQueue = [];
    }
  }
  if (d.combatRulesVersion === 2) _finishSourceRound(d);
  saveState();
  _renderAll();
}

function _skipLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length) return;
  d.pendingLuckQueue.shift();
  if (d.combatRulesVersion === 2) _finishSourceRound(d);
  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.stamina = d.enemy.staminaMax;
  if (d.combatRulesVersion === 2) d.sideEnemy.stamina = d.sideEnemy.staminaMax;
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim468.log.reset_sep'));
  _appendLog(d, t('battlesim468.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim468-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim468.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim468.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && (d.combatRulesVersion === 2 ? _sourceFightOver(d) && !d.pendingLuckQueue.length : _enemyDefeated(d))) el.innerHTML = t('battlesim468.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || !hasEnemy || (d.combatRulesVersion === 2 ? _sourceFightOver(d) : _enemyDefeated(d));
  document.getElementById('sim468-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim468-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim468-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim468-history-summary');
  const listEl = document.getElementById('sim468-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim468.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim468.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim468.history.won') : t('battlesim468.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim468-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim468-player-skill').value      = d.player.skill;
  document.getElementById('sim468-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim468-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim468-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim468-player-luck').value       = d.player.luck;
  document.getElementById('sim468-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim468-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim468-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim468.btn.rolled') : t('battlesim468.btn.roll');

  document.getElementById('sim468-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim468-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim468-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim468-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim468-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim468-player-wounddmg').value  = d.player.playerWoundDamage;
  document.getElementById('sim468-enemy-threshold').value  = d.player.enemyDefeatThreshold;
  document.getElementById('sim468-enemy-firstwin').checked = d.player.enemyAutoWinFirstRound;
  const sourceRules = d.combatRulesVersion === 2;
  document.getElementById('sim468-source-controls').hidden = !sourceRules;
  document.getElementById('sim468-gold-ring').checked = sourceRules && d.encounter.goldRing;
  document.getElementById('sim468-gold-ring').disabled = !!d.pendingLuckQueue.length || d.player.stamina <= 0;
  const side = document.getElementById('sim468-side-enemy');
  side.hidden = !sourceRules || !d.encounter.paired;
  side.textContent = sourceRules && d.encounter.paired ? t('battlesim468.ui.side_enemy', { enemy: d.sideEnemy.name, stamina: d.sideEnemy.stamina, staminaMax: d.sideEnemy.staminaMax }) : '';
  document.getElementById('sim468-switch-target').hidden = !sourceRules || !_sideAlive(d);
  document.getElementById('sim468-switch-target').disabled = !!d.pendingLuckQueue.length || d.player.stamina <= 0;

  const pendingEl = document.getElementById('sim468-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim468() {
  const overlay = document.getElementById('sim468-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim468(); return; }
  _renderAll();
}

function openSim468() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim468-overlay').classList.add('active');
}

function closeSim468() {
  document.getElementById('sim468-overlay')?.classList.remove('active');
}

export function setSim468Visible(visible) {
  const btn = document.getElementById('sim468-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim468();
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

export function initSim468() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim468-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim468-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim468.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim468-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim468.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim468.ui.skill'), 'sim468-player-skill')}
            ${_numField(t('battlesim468.ui.skill_initial'), 'sim468-player-skillmax')}
            ${_numField(t('battlesim468.ui.stamina'), 'sim468-player-stamina')}
            ${_numField(t('battlesim468.ui.stamina_initial'), 'sim468-player-staminamax')}
            ${_numField(t('battlesim468.ui.luck'), 'sim468-player-luck')}
            ${_numField(t('battlesim468.ui.luck_initial'), 'sim468-player-luckmax')}
            ${_numField(t('battlesim468.ui.atkmod'), 'sim468-player-atkmod')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim468.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim468.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim468-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim468-enemy-pick-dropdown">
                <ul id="sim468-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim468.ui.skill'), 'sim468-enemy-skill')}
            ${_numField(t('battlesim468.ui.stamina'), 'sim468-enemy-stamina')}
            ${_numField(t('battlesim468.ui.stamina_max'), 'sim468-enemy-staminamax')}
            ${_numField(t('battlesim468.ui.wound_dmg'), 'sim468-enemy-wounddmg')}
            ${_numField(t('battlesim468.ui.player_wound_dmg'), 'sim468-player-wounddmg')}
            ${_numField(t('battlesim468.ui.defeat_threshold'), 'sim468-enemy-threshold')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim468-enemy-firstwin" class="inv-edit-check"> ${t('battlesim468.ui.enemy_firstwin_toggle')}</label>
            </div>
            <div id="sim468-source-controls" hidden>
              <div class="inv-edit-row">
                <label class="inv-edit-check-label"><input type="checkbox" id="sim468-gold-ring" class="inv-edit-check"> ${t('battlesim468.ui.gold_ring')}</label>
              </div>
              <div id="sim468-side-enemy" class="bsim-status" hidden></div>
              <button id="sim468-switch-target" class="inv-edit-done" type="button" hidden>${t('battlesim468.ui.switch_target')}</button>
            </div>
          </div>
          <div id="sim468-status" class="bsim-status"></div>
          <div id="sim468-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim468.btn.luck_prompt')}</span>
            <button id="sim468-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim468.btn.luck_yes')}</button>
            <button id="sim468-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim468.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim468-round" class="inv-add-btn bsim-action-primary">${t('battlesim468.btn.round')}</button>
            <button id="sim468-reset" class="inv-add-btn">${t('battlesim468.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim468-history-summary">${t('battlesim468.history.summary', { n: 0 })}</summary>
            <div id="sim468-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim468-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim468-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim468);
  document.getElementById('sim468-close').addEventListener('click', closeSim468);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim468(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim468-overlay'),
    open:  openSim468,
    close: closeSim468,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim468();
  });

  document.getElementById('sim468-round').addEventListener('click', _runRound);
  document.getElementById('sim468-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim468-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim468-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim468-switch-target').addEventListener('click', _switchSourceTarget);
  document.getElementById('sim468-gold-ring').addEventListener('change', e => {
    const d = _data();
    if (d?.combatRulesVersion !== 2 || d.pendingLuckQueue.length || d.player.stamina <= 0) return;
    d.encounter.goldRing = e.target.checked;
    saveState();
  });

  document.getElementById('sim468-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim468.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim468-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  document.getElementById('sim468-enemy-firstwin').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.enemyAutoWinFirstRound = e.target.checked;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim468-player-skill':      ['player', 'skill'],
    'sim468-player-skillmax':   ['player', 'skillInitial'],
    'sim468-player-stamina':    ['player', 'stamina'],
    'sim468-player-staminamax': ['player', 'staminaInitial'],
    'sim468-player-luck':       ['player', 'luck'],
    'sim468-player-luckmax':    ['player', 'luckInitial'],
    'sim468-player-atkmod':     ['player', 'attackModifier'],
    'sim468-enemy-skill':       ['enemy', 'skill'],
    'sim468-enemy-stamina':        ['enemy', 'stamina'],
    'sim468-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim468-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim468-player-wounddmg':      ['player', 'playerWoundDamage'],
    'sim468-enemy-threshold':      ['player', 'enemyDefeatThreshold'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Allow negative attack modifiers; other fields stay non-negative.
    val = id === 'sim468-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim468-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim468-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim468-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim468-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    if (id === 'sim468-enemy-threshold') val = Math.min(val, Math.max(0, d.enemy.staminaMax - 1));
    d[map[0]][map[1]] = val;
    if (id === 'sim468-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim468-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim468-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim468-enemy-staminamax') {
      d.enemy.stamina = Math.min(d.enemy.stamina, val);
      d.player.enemyDefeatThreshold = Math.min(d.player.enemyDefeatThreshold, Math.max(0, val - 1));
    }
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim468-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim468-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim468-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim468-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim468-enemy-pick', 'sim468-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.skill = enemy.attack;
    if (enemy.hp != null)     { d.enemy.stamina = enemy.hp; d.enemy.staminaMax = enemy.hp; }
    d.roundsThisBattle = 0;
    d.pendingLuckQueue = [];
    _resetEncounterKnobs(d);
    saveState();
    _renderAll();
  });
}
