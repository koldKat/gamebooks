// Battle Simulator (Дракон в мазето, book 881)
// Compare player strength + 1d6 with fixed enemy strength; normal damage is 2, ties cost both 1.
// Multiple enemies exchange blows in turn; encounter damage/tie overrides are explicit.

import { currentPlaythrough, saveState } from '../core/state.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { resolveCellarDragon } from './engines/cellar-dragon.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

const SWORDS = [
  { id: 'firfeld', nameKey: 'battlesim881.sword.firfeld' },
  { id: 'laim',    nameKey: 'battlesim881.sword.laim' },
  { id: 'istrin',  nameKey: 'battlesim881.sword.istrin' },
];

const ROSTER = [
  { id: 'guard_unarmed', nameKey: 'battlesim881.name.guard_unarmed', hitAmount: 1, tiePlayer: 0, tieEnemy: 0, stopAfterLoss: 10,
    enemies: [{ nameKey: 'battlesim881.enemy.guard', sila: 9, izd: 5 }],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'guard_club', nameKey: 'battlesim881.name.guard_club', hitAmount: 1, tiePlayer: 0, tieEnemy: 0, stopAfterLoss: 10,
    enemies: [{ nameKey: 'battlesim881.enemy.guard', sila: 8, izd: 5 }],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'orgfelt_gang', nameKey: 'battlesim881.name.orgfelt_gang',
    enemies: [
      { nameKey: 'battlesim881.enemy.orgfelt', sila: 10, izd: 6 },
      { nameKey: 'battlesim881.enemy.companion', sila: 10, izd: 9 },
      { nameKey: 'battlesim881.enemy.robber1', sila: 8, izd: 6 },
      { nameKey: 'battlesim881.enemy.robber2', sila: 7, izd: 6 },
      { nameKey: 'battlesim881.enemy.robber3', sila: 6, izd: 8 },
    ],
    swordBonus: { firfeld: 2, laim: 1, istrin: 0 } },
  { id: 'clent_thieves2', nameKey: 'battlesim881.name.clent_thieves2',
    enemies: [
      { nameKey: 'battlesim881.enemy.thief1', sila: 10, izd: 4 },
      { nameKey: 'battlesim881.enemy.thief2', sila: 8, izd: 12 },
    ],
    swordBonus: { firfeld: 1, laim: 0, istrin: 0 } },
  { id: 'clent_thief1', nameKey: 'battlesim881.name.clent_thief1',
    enemies: [{ nameKey: 'battlesim881.enemy.thief', sila: 10, izd: 4 }],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'clent_thieves_istrin', nameKey: 'battlesim881.name.clent_thieves_istrin',
    enemies: [
      { nameKey: 'battlesim881.enemy.thief1', sila: 10, izd: 6 },
      { nameKey: 'battlesim881.enemy.thief2', sila: 8, izd: 6 },
    ],
    swordBonus: { firfeld: 0, laim: 0, istrin: 2 } },
  { id: 'night_thief1', nameKey: 'battlesim881.name.night_thief1', stopAt: 10,
    enemies: [{ nameKey: 'battlesim881.enemy.night_thief', sila: 8, izd: 6 }],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'night_thieves5', nameKey: 'battlesim881.name.night_thieves5',
    enemies: [
      { nameKey: 'battlesim881.enemy.night_thief_n', sila: 6, izd: 4 },
      { nameKey: 'battlesim881.enemy.night_thief_n', sila: 8, izd: 12 },
      { nameKey: 'battlesim881.enemy.night_thief_n', sila: 10, izd: 6 },
      { nameKey: 'battlesim881.enemy.night_thief_n', sila: 6, izd: 6 },
      { nameKey: 'battlesim881.enemy.night_thief_n', sila: 9, izd: 8 },
    ],
    swordBonus: { firfeld: 0, laim: 2, istrin: 1 } },
  { id: 'creature_unarmed', nameKey: 'battlesim881.name.creature_unarmed', hitAmount: 1, tiePlayer: 1, tieEnemy: 0, stopAt: 8,
    enemies: [{ nameKey: 'battlesim881.enemy.creature', sila: 10, izd: 8 }],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'dwarf_unarmed', nameKey: 'battlesim881.name.dwarf_unarmed', hitAmount: 1, tiePlayer: 0, tieEnemy: 0,
    enemies: [{ nameKey: 'battlesim881.enemy.dwarf_leader', sila: 10, izd: 10 }],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'dwarf_weapon', nameKey: 'battlesim881.name.dwarf_weapon',
    enemies: [{ nameKey: 'battlesim881.enemy.dwarf_leader', sila: 8, izd: 10 }],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'urik_guards', nameKey: 'battlesim881.name.urik_guards',
    enemies: [
      { nameKey: 'battlesim881.enemy.urik_guard1', sila: 9, izd: 4 },
      { nameKey: 'battlesim881.enemy.urik_guard2', sila: 8, izd: 6 },
    ],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'mercenary_unarmed', nameKey: 'battlesim881.name.mercenary_unarmed', hitAmount: 1, tiePlayer: 0, tieEnemy: 0, stopAfterLoss: 10,
    enemies: [{ nameKey: 'battlesim881.enemy.mercenary_boss', sila: 10, izd: 10 }],
    swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
  { id: 'mercenary_armed', nameKey: 'battlesim881.name.mercenary_armed',
    enemies: [{ nameKey: 'battlesim881.enemy.mercenary_boss', sila: 10, izd: 10 }],
    swordBonus: { firfeld: 2, laim: 1, istrin: 1 } },
  { id: 'alkein_thugs', nameKey: 'battlesim881.name.alkein_thugs', chooseTarget: true,
    enemies: [
      { nameKey: 'battlesim881.enemy.thug1', sila: 8, izd: 4 },
      { nameKey: 'battlesim881.enemy.thug2', sila: 9, izd: 6 },
      { nameKey: 'battlesim881.enemy.thug3', sila: 7, izd: 8 },
    ],
    swordBonus: { firfeld: 0, laim: 1, istrin: 2 } },
  { id: 'wolfspiders', nameKey: 'battlesim881.name.wolfspiders', tieBoth2: true,
    enemies: [
      { nameKey: 'battlesim881.enemy.wolfspider', sila: 10, izd: 8 },
      { nameKey: 'battlesim881.enemy.wolfspider', sila: 10, izd: 9 },
      { nameKey: 'battlesim881.enemy.wolfspider', sila: 12, izd: 10 },
    ],
    swordBonus: { firfeld: 3, laim: 1, istrin: 2 } },
  { id: 'wolfpack', nameKey: 'battlesim881.name.wolfpack', special: 'wolfpack',
    swordBonus: { firfeld: -1, laim: 1, istrin: 2 } },
  { id: 'dwarf_knife', nameKey: 'battlesim881.name.dwarf_knife', special: 'knifeThrow',
    enemySila: 6, swordBonus: { firfeld: 0, laim: 0, istrin: 0 } },
];

function _encounter(id) { return ROSTER.find(e => e.id === id) || ROSTER[0]; }
function _sword(id) { return SWORDS.find(s => s.id === id) || SWORDS[0]; }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim881) {
    pt.sim881 = {
      encounterId: 'guard_unarmed',
      swordId: 'firfeld',
      player: { sila: 5, izd: 30 },
      log: [],
      history: [],
    };
  }
  return pt.sim881;
}

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 300) d.log.shift();
}

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: t(_encounter(d.encounterId).nameKey), outcome, ts: Date.now() });
}

function _fight() {
  const d = _data();
  if (!d) return;
  const enc = _encounter(d.encounterId);
  if (!d.pendingFight && d.player.izd <= 0) return;
  const aids = ['orgfelt_gang', 'night_thieves5', 'alkein_thugs', 'wolfspiders'].includes(enc.id);
  const removed = [];
  for (const kind of ['dagger', 'poison']) {
    const selected = Number(document.getElementById(`sim881-${kind}`).value);
    if ((kind === 'dagger' && aids || kind === 'poison' && enc.id === 'wolfspiders') && selected >= 0) removed.push(selected);
  }
  if (new Set(removed).size !== removed.length) {
    showAlert(t('battlesim881.ui.distinct')); return;
  }
  const options = {
    swordId: d.swordId, removed,
    potion: document.getElementById('sim881-potion').checked,
    magicKnife: enc.special === 'knifeThrow' && document.getElementById('sim881-knife-magic').checked,
    target: Number(document.getElementById('sim881-target').value),
  };
  const result = resolveCellarDragon(enc, d.player, options, d.pendingFight, _roll1d6);
  if (!d.pendingFight) _appendLog(d, t('battlesim881.log.header', { name: t(enc.nameKey) }));
  for (const event of result.events) {
    const args = event.args;
    _appendLog(d, t(`battlesim881.log.${event.key}`, { ...args, name: args.nameKey ? t(args.nameKey) : '' }));
  }
  d.player.izd = result.finalPlayerIzd;
  if (result.outcome === 'pending') {
    d.pendingFight = result.state;
    _appendLog(d, t('battlesim881.log.paused'));
  } else if (result.outcome === 'win') {
    delete d.pendingFight;
    _appendLog(d, t('battlesim881.log.win_footer', { trophy: SVG_TROPHY }));
    _recordOutcome(d, 'win');
  } else {
    delete d.pendingFight;
    _appendLog(d, t('battlesim881.log.loss_footer', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
  if (result.outcome !== 'pending') {
    document.getElementById('sim881-potion').checked = false;
    document.getElementById('sim881-knife-magic').checked = false;
    document.getElementById('sim881-dagger').value = '-1';
    document.getElementById('sim881-poison').value = '-1';
  }
  saveState();
  _renderAll();
}

function _pickEncounter(id) {
  const d = _data();
  if (!d || d.pendingFight) return;
  d.encounterId = id;
  document.getElementById('sim881-potion').checked = false;
  document.getElementById('sim881-knife-magic').checked = false;
  document.getElementById('sim881-dagger').value = '-1';
  document.getElementById('sim881-poison').value = '-1';
  saveState();
  _renderAll();
}

function _pickSword(id) {
  const d = _data();
  if (!d || d.pendingFight) return;
  d.swordId = id;
  saveState();
  _renderAll();
}

// ── Render ───────────────────────────────────────────────────────────────

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim881-history-summary');
  const listEl = document.getElementById('sim881-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim881.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim881.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim881.history.won') : t('battlesim881.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim881-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _encounterOptions(selectedId) {
  return ROSTER.map(e => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(t(e.nameKey))}</option>`).join('');
}

function _swordOptions(selectedId) {
  return SWORDS.map(s => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${escapeHtml(t(s.nameKey))}</option>`).join('');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;
  document.getElementById('sim881-encounter-pick').innerHTML = _encounterOptions(d.encounterId);
  document.getElementById('sim881-sword-pick').innerHTML = _swordOptions(d.swordId);
  document.getElementById('sim881-player-sila').value = d.player.sila;
  document.getElementById('sim881-player-izd').value = d.player.izd;
  const enc = _encounter(d.encounterId), pending = !!d.pendingFight;
  const aids = ['orgfelt_gang', 'night_thieves5', 'alkein_thugs', 'wolfspiders'].includes(enc.id);
  for (const kind of ['dagger', 'poison', 'target']) {
    const input = document.getElementById(`sim881-${kind}`), selected = input.value;
    const enemies = d.pendingFight?.enemies || (enc.enemies || []).map((enemy, index) => ({ ...enemy, index, remaining: enemy.izd }));
    const available = enemies.filter(enemy => kind !== 'target' || enemy.remaining > 0);
    const none = kind === 'target' ? '' : `<option value="-1">${t('battlesim881.ui.none')}</option>`;
    input.innerHTML = none + available.map(enemy => `<option value="${enemy.index}">${escapeHtml(t(enemy.nameKey))} (${enemy.index + 1})</option>`).join('');
    if (Array.from(input.options).some(option => option.value === selected)) input.value = selected;
    input.disabled = pending && kind !== 'target';
    document.getElementById(`sim881-${kind}-row`).style.display = (kind === 'target' ? enc.chooseTarget : kind === 'poison' ? enc.id === 'wolfspiders' : aids) ? '' : 'none';
  }
  document.getElementById('sim881-potion').disabled = pending;
  document.getElementById('sim881-knife-magic-row').style.display = enc.special === 'knifeThrow' ? '' : 'none';
  document.getElementById('sim881-knife-magic').disabled = pending;
  for (const id of ['sim881-encounter-pick', 'sim881-sword-pick', 'sim881-player-sila', 'sim881-player-izd']) {
    document.getElementById(id).disabled = pending;
  }
  document.getElementById('sim881-overlay').querySelectorAll('.inv-qty-btn').forEach(button => { button.disabled = pending; });
  const fight = document.getElementById('sim881-fight');
  fight.disabled = !pending && d.player.izd <= 0;
  fight.textContent = t(pending ? 'battlesim881.btn.continue' : 'battlesim881.btn.fight');
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim881() {
  const overlay = document.getElementById('sim881-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim881(); return; }
  _renderAll();
}

function openSim881() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim881-overlay').classList.add('active');
}

function closeSim881() {
  document.getElementById('sim881-overlay')?.classList.remove('active');
}

export function setSim881Visible(visible) {
  const btn = document.getElementById('sim881-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim881();
}

// ── Init ─────────────────────────────────────────────────────────────────

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

export function initSim881() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim881-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim881.ui.title')}</span>
        <button id="sim881-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim881.ui.you')}</div>
            ${_numField(t('battlesim881.ui.sila'), 'sim881-player-sila')}
            ${_numField(t('battlesim881.ui.izd'), 'sim881-player-izd')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim881.ui.sword')}</span>
              <select id="sim881-sword-pick" class="inv-edit-input"></select>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim881.ui.encounter')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim881.ui.pick')}</span>
              <select id="sim881-encounter-pick" class="inv-edit-input"></select>
            </div>
            <div id="sim881-potion-row" class="inv-edit-row">
              <label><input id="sim881-potion" type="checkbox"> ${t('battlesim881.ui.potion')}</label>
            </div>
            <div id="sim881-knife-magic-row" class="inv-edit-row">
              <label><input id="sim881-knife-magic" type="checkbox"> ${t('battlesim881.ui.magic_knife')}</label>
            </div>
            <div id="sim881-dagger-row" class="inv-edit-row">
              <label class="inv-edit-label bsim-stat-label" for="sim881-dagger">${t('battlesim881.ui.dagger')}</label>
              <select id="sim881-dagger" class="inv-edit-input"></select>
            </div>
            <div id="sim881-poison-row" class="inv-edit-row">
              <label class="inv-edit-label bsim-stat-label" for="sim881-poison">${t('battlesim881.ui.poison')}</label>
              <select id="sim881-poison" class="inv-edit-input"></select>
            </div>
            <div id="sim881-target-row" class="inv-edit-row">
              <label class="inv-edit-label bsim-stat-label" for="sim881-target">${t('battlesim881.ui.target')}</label>
              <select id="sim881-target" class="inv-edit-input"></select>
            </div>
          </div>
          <div class="inv-modal-ftr bsim-action-grid">
            <button id="sim881-fight" class="inv-add-btn bsim-action-primary">${t('battlesim881.btn.fight')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim881-history-summary">${t('battlesim881.history.summary', { n: 0 })}</summary>
            <div id="sim881-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim881-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim881-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim881);
  document.getElementById('sim881-close').addEventListener('click', closeSim881);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim881(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim881-overlay'),
    open:  openSim881,
    close: closeSim881,
  });

  document.getElementById('sim881-encounter-pick').addEventListener('change', e => _pickEncounter(e.target.value));
  document.getElementById('sim881-sword-pick').addEventListener('change', e => _pickSword(e.target.value));
  document.getElementById('sim881-fight').addEventListener('click', _fight);

  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d || d.pendingFight) return;
      const id    = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const val   = Math.min(id === 'sim881-player-izd' ? 30 : Infinity, Math.max(0, (parseInt(input.value, 10) || 0) + delta));
      input.value = val;
      if (id === 'sim881-player-sila') d.player.sila = val;
      else if (id === 'sim881-player-izd') d.player.izd = val;
      saveState();
      _renderInputs();
    });
  });

  overlay.querySelectorAll('.inv-qty-input').forEach(input => {
    input.addEventListener('change', () => {
      const d = _data();
      if (!d || d.pendingFight) return;
      const val = Math.min(input.id === 'sim881-player-izd' ? 30 : Infinity, Math.max(0, parseInt(input.value, 10) || 0));
      input.value = val;
      const id = input.id;
      if (id === 'sim881-player-sila') d.player.sila = val;
      else if (id === 'sim881-player-izd') d.player.izd = val;
      saveState();
      _renderInputs();
    });
  });
}
