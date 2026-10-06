// Battle Simulator (Сянка върху пясъка, book 433, Lone Wolf #5)
// Combat Ratio is fixed on enemy selection; a 0-9 pick selects simultaneous table losses.
// 'K' means instant death. Printed effects are captured for newly started fights.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../core/state.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const LAUMSPUR_HEAL = 4;

// Rows use random 0-9; columns use ratio buckets <=-11 through >=11.
// Cells are [enemyLoss,selfLoss]; K means instant death.
const CRT = [
  /* 0 */ [[6,0],[7,0],[8,0],[9,0],[10,0],[11,0],[12,0],[14,0],[16,0],[18,0],['K',0],['K',0],['K',0]],
  /* 1 */ [[0,'K'],[0,'K'],[0,8],[0,6],[1,6],[2,5],[3,5],[4,5],[5,4],[6,4],[7,4],[8,3],[9,3]],
  /* 2 */ [[0,'K'],[0,8],[0,7],[1,6],[2,5],[3,5],[4,4],[5,4],[6,3],[7,3],[8,3],[9,3],[10,2]],
  /* 3 */ [[0,8],[0,7],[1,6],[2,5],[3,5],[4,4],[5,4],[6,3],[7,3],[8,3],[9,2],[10,2],[11,2]],
  /* 4 */ [[0,8],[1,7],[2,6],[3,5],[4,4],[5,4],[6,3],[7,3],[8,2],[9,2],[10,2],[11,2],[12,2]],
  /* 5 */ [[1,7],[2,6],[3,5],[4,4],[5,4],[6,3],[7,2],[8,2],[9,2],[10,2],[11,2],[12,2],[14,1]],
  /* 6 */ [[2,6],[3,6],[4,5],[5,4],[6,3],[7,2],[8,2],[9,2],[10,2],[11,1],[12,1],[14,1],[16,1]],
  /* 7 */ [[3,5],[4,5],[5,4],[6,3],[7,2],[8,2],[9,1],[10,1],[11,1],[12,0],[14,0],[16,0],[18,0]],
  /* 8 */ [[4,4],[5,4],[6,3],[7,2],[8,1],[9,1],[10,0],[11,0],[12,0],[14,0],[16,0],[18,0],['K',0]],
  /* 9 */ [[5,3],[6,3],[7,2],[8,0],[9,0],[10,0],[11,0],[12,0],[14,0],[16,0],[18,0],['K',0],['K',0]],
];

function _crCol(ratio) {
  if (ratio <= -11) return 0;
  if (ratio <= -9)  return 1;
  if (ratio <= -7)  return 2;
  if (ratio <= -5)  return 3;
  if (ratio <= -3)  return 4;
  if (ratio <= -1)  return 5;
  if (ratio === 0)  return 6;
  if (ratio <= 2)   return 7;
  if (ratio <= 4)   return 8;
  if (ratio <= 6)   return 9;
  if (ratio <= 8)   return 10;
  if (ratio <= 10)  return 11;
  return 12;
}

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim433) {
    pt.sim433 = {
      player: {
        csBase: 0, epInitial: 0, ep: 0,
        weaponBonus: false, mindBlast: false,
        laumspurUsed: false,
      },
      enemy: { name: '', cs: 0, ep: 0, epMax: 0 },
      rolled: false,
      roundsThisBattle: 0,
      log: [],
      history: [],
      printedRules: 1,
      combatEffects: {},
    };
  }
  const d = pt.sim433;
  if (d.rolled === undefined) d.rolled = false;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  if (d.player.weaponBonus === undefined) d.player.weaponBonus = false;
  if (d.player.mindBlast === undefined) d.player.mindBlast = false;
  if (d.player.laumspurUsed === undefined) d.player.laumspurUsed = false;
  return d;
}

function _notReady(d) { return !d.rolled; }

function _rollRandomNumber() { return Math.floor(Math.random() * 10); }

function _playerCS(d) {
  const effects = d.combatEffects;
  if (effects?.captured) {
    let cs = effects.baseCS;
    const section = effects.section;
    if (effects.mindBlast && ![12, 162, 299, 355, 375].includes(section)) cs += [64, 110].includes(section) ? 4 : 2;
    if ([12, 135, 190, 357].includes(section)) cs -= 2;
    if (section === 91) cs -= 4;
    if ([106, 159, 316].includes(section) && d.roundsThisBattle <= 3) cs -= 2;
    if (section === 393 && d.roundsThisBattle <= 1) cs -= 2;
    if (section === 194 && !effects.mindshield) cs -= 3;
    if ([299, 353, 355].includes(section) && !effects.mindshield) cs -= 2;
    if (section === 57 && effects.previousElix) cs += 2;
    if (section === 253 && effects.magicMace) cs += 5;
    return cs;
  }
  let cs = d.player.csBase;
  if (d.player.weaponBonus) cs += 2;
  if (d.player.mindBlast) cs += 2;
  return cs;
}

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _playerLost(d) { return d.rolled && d.player.ep <= 0; }
function _playerWon(d)  { return d.enemy.epMax > 0 && d.enemy.ep <= 0; }
function _battleOver(d) { return _notReady(d) || _playerLost(d) || _playerWon(d) || !!d.combatEffects?.finished; }

function _captureFightEffects(d) {
  d.printedRules = 1;
  d.combatEffects = {
    captured: true,
    section: Number(d.enemy.name.match(/§(\d+)/)?.[1]) || 0,
    baseCS: d.player.csBase + (d.player.weaponBonus ? 2 : 0),
    mindBlast: !!d.player.mindBlast,
    mindshield: !!d.nextMindshield,
    previousElix: !!d.nextPreviousElix,
    magicMace: !!d.nextMagicMace,
    protectedEntry: !!d.nextProtectedEntry,
    lostEP: 0,
  };
}

function _setRoute(d, section) {
  d.combatEffects.finished = true;
  d.combatEffects.route = section;
  _appendLog(d, t('battlesim433.log.continue', { section }));
}

function _recoverCombatLoss(d) {
  const effects = d.combatEffects;
  if (!effects || ![20, 135].includes(effects.section)) return;
  const recovered = Math.min(Math.floor(effects.lostEP / 2), d.player.epInitial - d.player.ep);
  if (recovered > 0) {
    d.player.ep += recovered;
    _appendLog(d, t('battlesim433.log.recovered', { n: recovered }));
  }
}

function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerEp: d.player.ep, playerEpMax: d.player.epInitial,
    ts: Date.now(),
  });
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _runRound() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  const effects = d.combatEffects || {};
  const stop = { 20: [3, 82], 330: [2, 394], 361: [3, 382] }[effects.section];
  if (stop && d.roundsThisBattle >= stop[0]) {
    _setRoute(d, stop[1]);
    saveState();
    _renderAll();
    return;
  }
  d.roundsThisBattle++;

  const ratio = _playerCS(d) - d.enemy.cs;
  const rn = _rollRandomNumber();
  let [enemyLoss, selfLoss] = CRT[rn][_crCol(ratio)];
  if (effects.section === 4 && d.roundsThisBattle === 1) enemyLoss = 0;
  if ((effects.section === 119 && d.roundsThisBattle <= 3) ||
      (effects.section === 280 && d.roundsThisBattle === 1) ||
      (effects.section === 334 && effects.protectedEntry && d.roundsThisBattle <= 2)) selfLoss = 0;
  if ([240, 370].includes(effects.section) && selfLoss !== 'K') selfLoss *= 2;
  if (effects.section === 357 && rn === 1) {
    d.player.ep = 0;
    _appendLog(d, t('battlesim433.log.fallen'));
    _recordOutcome(d, 'loss');
    _setRoute(d, 293);
    saveState();
    _renderAll();
    return;
  }

  const enemyDied  = enemyLoss === 'K';
  const playerDied = selfLoss === 'K';
  if (!enemyDied) d.enemy.ep = Math.max(0, d.enemy.ep - enemyLoss);
  else d.enemy.ep = 0;
  if (!playerDied) d.player.ep = Math.max(0, d.player.ep - selfLoss);
  else d.player.ep = 0;
  if (effects.captured) effects.lostEP += playerDied ? 0 : selfLoss;

  _appendLog(d, t('battlesim433.log.round', {
    round: d.roundsThisBattle, ratio, rn,
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyDied ? t('battlesim433.log.killed') : enemyLoss,
    selfLoss: playerDied ? t('battlesim433.log.killed') : selfLoss,
    ep: d.player.ep, epMax: d.player.epInitial,
    enemyEp: d.enemy.ep, enemyEpMax: d.enemy.epMax,
  }));

  if (d.printedRules && _playerLost(d)) {
    const nonfatal = [20, 135].includes(effects.section);
    _appendLog(d, `${SVG_SKULL} ${t(nonfatal ? 'battlesim433.log.knocked_out' : 'battlesim433.log.fallen')}`);
    _recordOutcome(d, 'loss');
    if (nonfatal) _setRoute(d, 161);
  } else if (_playerWon(d)) {
    _recoverCombatLoss(d);
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim433.log.defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
    const routes = { 4: [4, 165, 180], 91: [4, 65, 180], 168: [3, 101, 46], 355: [4, 249, 304] }[effects.section];
    if (routes) _setRoute(d, routes[d.roundsThisBattle <= routes[0] ? 1 : 2]);
  } else if (_playerLost(d)) {
    _appendLog(d, `${SVG_SKULL} ${t('battlesim433.log.fallen')}`);
    _recordOutcome(d, 'loss');
  }
  if (effects.section === 244 && !_playerLost(d)) {
    _setRoute(d, selfLoss > enemyLoss ? 347 : enemyLoss > selfLoss || enemyDied ? 327 : 271);
  }
  if (stop && d.roundsThisBattle >= stop[0] && !_playerLost(d) && !_playerWon(d)) _setRoute(d, stop[1]);

  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.ep = d.enemy.epMax;
  d.player.ep = d.player.epInitial;
  d.roundsThisBattle = 0;
  _captureFightEffects(d);
  if (d.log.length) _appendLog(d, t('battlesim433.log.reset_sep'));
  _appendLog(d, t('battlesim433.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Laumspur Potion ──────────────────────────────────────────────────────────

function _useLaumspur() {
  const d = _data();
  if (!d || _notReady(d)) return;
  if (d.printedRules && _playerLost(d)) return;
  if (d.player.laumspurUsed) return;
  if (d.roundsThisBattle > 0 && d.player.ep > 0 && d.enemy.ep > 0 && !d.combatEffects?.finished) {
    showAlert(t('battlesim433.alert.laumspur_midfight'));
    return;
  }
  if (d.player.ep >= d.player.epInitial) {
    showAlert(t('battlesim433.alert.ep_full'));
    return;
  }
  d.player.laumspurUsed = true;
  const before = d.player.ep;
  d.player.ep = Math.min(d.player.epInitial, d.player.ep + LAUMSPUR_HEAL);
  _appendLog(d, t('battlesim433.log.laumspur', { before, ep: d.player.ep, epMax: d.player.epInitial }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim433-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.epMax > 0;
  if (notReady)                            el.innerHTML = t('battlesim433.status.not_ready');
  else if (d.combatEffects?.route)          el.innerHTML = t('battlesim433.log.continue', { section: d.combatEffects.route });
  else if (_playerLost(d))                 el.innerHTML = `${SVG_SKULL} ${t('battlesim433.status.fallen')}`;
  else if (hasEnemy && _playerWon(d))      el.innerHTML = `${SVG_TROPHY} ${t('battlesim433.status.victory')}`;
  else                                      el.innerHTML = '';
  const over = _battleOver(d);
  document.getElementById('sim433-round').disabled = over;
  document.getElementById('sim433-laumspur').disabled =
    notReady || (d.printedRules && _playerLost(d)) || d.player.laumspurUsed || d.player.ep >= d.player.epInitial ||
    (d.roundsThisBattle > 0 && d.player.ep > 0 && d.enemy.ep > 0 && !d.combatEffects?.finished);
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim433-history-summary');
  const listEl = document.getElementById('sim433-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim433.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim433.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim433.history.won') : t('battlesim433.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">ИЗДРЪЖЛИВОСТ ${h.playerEp}/${h.playerEpMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim433-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim433-player-cs').value      = _playerCS(d);
  document.getElementById('sim433-player-csbase').value  = d.player.csBase;
  document.getElementById('sim433-player-ep').value      = Math.min(d.player.ep, d.player.epInitial);
  document.getElementById('sim433-player-epmax').value   = d.player.epInitial;
  document.getElementById('sim433-weapon').checked       = d.player.weaponBonus;
  document.getElementById('sim433-mindblast').checked    = d.player.mindBlast;
  for (const [id, field] of [['mindshield', 'nextMindshield'], ['previous-elix', 'nextPreviousElix'], ['magic-mace', 'nextMagicMace'], ['protected-entry', 'nextProtectedEntry']]) {
    document.getElementById('sim433-' + id).checked = !!d[field];
  }

  const rollBtn = document.getElementById('sim433-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim433.btn.rolled') : t('battlesim433.btn.roll');

  document.getElementById('sim433-laumspur-used').textContent =
    d.player.laumspurUsed ? t('battlesim433.ui.laumspur_used') : t('battlesim433.ui.laumspur_available');

  document.getElementById('sim433-enemy-pick').value  = d.enemy.name;
  document.getElementById('sim433-enemy-cs').value    = d.enemy.cs;
  document.getElementById('sim433-enemy-ep').value    = Math.min(d.enemy.ep, d.enemy.epMax);
  document.getElementById('sim433-enemy-epmax').value = d.enemy.epMax;

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim433() {
  const overlay = document.getElementById('sim433-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim433(); return; }
  _renderAll();
}

function openSim433() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim433-overlay').classList.add('active');
}

function closeSim433() {
  document.getElementById('sim433-overlay')?.classList.remove('active');
}

export function setSim433Visible(visible) {
  const btn = document.getElementById('sim433-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim433();
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

function _setupEnemyAutocomplete() {
  const input    = document.getElementById('sim433-enemy-pick');
  const dropdown = document.getElementById('sim433-enemy-pick-dropdown');
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
      `<li role="option" id="sim433-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">БУ:${e.attack ?? '?'} ИЗД:${e.hp ?? '?'}</span></li>`
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
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.cs = enemy.attack;
    if (enemy.hp != null)     { d.enemy.ep = enemy.hp; d.enemy.epMax = enemy.hp; }
    d.roundsThisBattle = 0;
    _captureFightEffects(d);
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

export function initSim433() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim433-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim433.ui.title')}</span>
        <button id="sim433-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim433.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim433-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim433.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim433.ui.cs_base'), 'sim433-player-csbase')}
            ${_numField(t('battlesim433.ui.cs_effective'), 'sim433-player-cs')}
            ${_numField(t('battlesim433.ui.ep'), 'sim433-player-ep')}
            ${_numField(t('battlesim433.ui.ep_initial'), 'sim433-player-epmax')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim433.ui.weapon_bonus')}</span>
              <input id="sim433-weapon" type="checkbox">
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim433.ui.mind_blast')}</span>
              <input id="sim433-mindblast" type="checkbox">
            </div>
            <div class="bsim-side-title">${t('battlesim433.ui.next_fight')}</div>
            ${[['mindshield', 'mindshield'], ['previous-elix', 'previous_elix'], ['magic-mace', 'magic_mace'], ['protected-entry', 'protected_entry']].map(([id, key]) => `
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${t('battlesim433.ui.' + key)}</span>
                <input id="sim433-${id}" type="checkbox">
              </div>`).join('')}
            <p class="bsim-history-meta">${t('battlesim433.ui.manual_effects')}</p>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim433.ui.laumspur')}</span>
              <span id="sim433-laumspur-used" class="bsim-ae-display"></span>
              <button id="sim433-laumspur" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim433.btn.laumspur_use', { n: LAUMSPUR_HEAL })}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim433.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim433.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim433-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim433-enemy-pick-dropdown">
                <ul id="sim433-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim433.ui.cs'), 'sim433-enemy-cs')}
            ${_numField(t('battlesim433.ui.ep'), 'sim433-enemy-ep')}
            ${_numField(t('battlesim433.ui.ep_max'), 'sim433-enemy-epmax')}
          </div>
          <div id="sim433-status" class="bsim-status"></div>
          <div class="inv-modal-ftr">
            <button id="sim433-round" class="inv-add-btn bsim-action-primary">${t('battlesim433.btn.round')}</button>
            <button id="sim433-reset" class="inv-add-btn">${t('battlesim433.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim433-history-summary">${t('battlesim433.history.summary', { n: 0 })}</summary>
            <div id="sim433-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim433-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim433-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim433);
  document.getElementById('sim433-close').addEventListener('click', closeSim433);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim433(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim433-overlay'),
    open:  openSim433,
    close: closeSim433,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim433();
  });

  document.getElementById('sim433-round').addEventListener('click', _runRound);
  document.getElementById('sim433-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim433-laumspur').addEventListener('click', _useLaumspur);
  for (const [id, field] of [['mindshield', 'nextMindshield'], ['previous-elix', 'nextPreviousElix'], ['magic-mace', 'nextMagicMace'], ['protected-entry', 'nextProtectedEntry']]) {
    document.getElementById('sim433-' + id).addEventListener('change', e => {
      const d = _data();
      if (!d) return;
      d[field] = e.target.checked;
      saveState();
    });
  }

  document.getElementById('sim433-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.csBase   = _rollRandomNumber() + 10;
    d.player.epInitial = _rollRandomNumber() + 20;
    d.player.ep = d.player.epInitial;
    d.rolled = true;
    if (d.combatEffects?.captured) _captureFightEffects(d);
    _appendLog(d, t('battlesim433.log.rolled', { cs: d.player.csBase, ep: d.player.epInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim433-weapon').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.weaponBonus = e.target.checked;
    saveState();
    _renderInputs();
  });
  document.getElementById('sim433-mindblast').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.mindBlast = e.target.checked;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim433-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim433-player-csbase': ['player', 'csBase'],
    'sim433-player-ep':     ['player', 'ep'],
    'sim433-player-epmax':  ['player', 'epInitial'],
    'sim433-enemy-cs':      ['enemy', 'cs'],
    'sim433-enemy-ep':      ['enemy', 'ep'],
    'sim433-enemy-epmax':   ['enemy', 'epMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = Math.max(0, val);
    if (id === 'sim433-player-ep') val = Math.min(val, d.player.epInitial);
    if (id === 'sim433-enemy-ep') val = Math.min(val, d.enemy.epMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim433-player-epmax') d.player.ep = Math.min(d.player.ep, val);
    if (id === 'sim433-enemy-epmax') d.enemy.ep = Math.min(d.enemy.ep, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim433-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim433-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete();
}
