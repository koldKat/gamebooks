// Battle Simulator (Тайната на Зоро, book 882)
// Separate hand-to-hand, group sword, and formal duel modes.
// Group exchanges reuse the winning roll for damage; duels use hit series and Trick interruptions.
// Pistol quick-draw and narrative checks are outside the model.

import { currentPlaythrough, saveState } from '../core/state.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { startZorroFight, advanceZorroFight } from './engines/zorro.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

const ROSTER = [
  { id: 'rosario', nameKey: 'battlesim882.name.rosario', type: 'rukopashna',
    enemies: [{ nameKey: 'battlesim882.enemy.rosario', zhivot: 24, rb: 3, sila: 5, izdr: 5 }] },
  { id: 'sailors6', nameKey: 'battlesim882.name.sailors6', type: 'rukopashna',
    enemies: [
      { nameKey: 'battlesim882.enemy.sailor1', zhivot: 10, rb: 3, sila: 2, izdr: 3 },
      { nameKey: 'battlesim882.enemy.sailor2', zhivot: 8,  rb: 2, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.sailor3', zhivot: 8,  rb: 3, sila: 2, izdr: 3 },
      { nameKey: 'battlesim882.enemy.sailor4', zhivot: 7,  rb: 1, sila: 4, izdr: 4 },
      { nameKey: 'battlesim882.enemy.sailor5', zhivot: 7,  rb: 2, sila: 3, izdr: 4 },
      { nameKey: 'battlesim882.enemy.sailor6', zhivot: 6,  rb: 3, sila: 2, izdr: 5 },
    ] },
  { id: 'sailors4', nameKey: 'battlesim882.name.sailors4', type: 'rukopashna',
    enemies: [
      { nameKey: 'battlesim882.enemy.sailor1', zhivot: 10, rb: 2, sila: 4, izdr: 3 },
      { nameKey: 'battlesim882.enemy.sailor2', zhivot: 8,  rb: 3, sila: 2, izdr: 3 },
      { nameKey: 'battlesim882.enemy.sailor3', zhivot: 8,  rb: 2, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.sailor4', zhivot: 7,  rb: 1, sila: 3, izdr: 4 },
    ] },
  { id: 'idalgo_soldier', nameKey: 'battlesim882.name.idalgo_soldier', type: 'rukopashna', retreatLoss: 15,
    enemies: [{ nameKey: 'battlesim882.enemy.idalgo_soldier', zhivot: 25, rb: 2, sila: 2, izdr: 3 }] },
  { id: 'lola', nameKey: 'battlesim882.name.lola', type: 'rukopashna',
    enemies: [{ nameKey: 'battlesim882.enemy.lola', zhivot: 12, rb: 4, sila: 2, izdr: 1 }] },
  { id: 'bandits3_knife', nameKey: 'battlesim882.name.bandits3_knife', type: 'rukopashna', extraDamageBonus: 3,
    enemies: [
      { nameKey: 'battlesim882.enemy.bandit1', zhivot: 9,  rb: 3, sila: 3, izdr: 2 },
      { nameKey: 'battlesim882.enemy.bandit2', zhivot: 11, rb: 2, sila: 2, izdr: 3 },
      { nameKey: 'battlesim882.enemy.bandit3', zhivot: 10, rb: 3, sila: 2, izdr: 2 },
    ] },
  { id: 'mateo_gang', nameKey: 'battlesim882.name.mateo_gang', type: 'rukopashna',
    enemies: [
      { nameKey: 'battlesim882.enemy.mateo', zhivot: 18, rb: 3, sila: 4, izdr: 3 },
      { nameKey: 'battlesim882.enemy.robber1', zhivot: 15, rb: 3, sila: 3, izdr: 4 },
      { nameKey: 'battlesim882.enemy.robber2', zhivot: 10, rb: 2, sila: 4, izdr: 3 },
      { nameKey: 'battlesim882.enemy.robber3', zhivot: 9,  rb: 2, sila: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.robber4', zhivot: 8,  rb: 2, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.robber5', zhivot: 11, rb: 3, sila: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.robber6', zhivot: 12, rb: 2, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.robber7', zhivot: 9,  rb: 2, sila: 3, izdr: 2 },
      { nameKey: 'battlesim882.enemy.robber8', zhivot: 10, rb: 2, sila: 3, izdr: 4 },
      { nameKey: 'battlesim882.enemy.robber9', zhivot: 4,  rb: 1, sila: 1, izdr: 1 },
      { nameKey: 'battlesim882.enemy.robber10', zhivot: 8,  rb: 2, sila: 4, izdr: 3 },
    ] },
  { id: 'fuentes_4', nameKey: 'battlesim882.name.fuentes_4', type: 'shpagi',
    enemies: [
      { nameKey: 'battlesim882.enemy.soldier1', zhivot: 15, fehtovka: 3, barzina: 2, srachnost: 3, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier2', zhivot: 14, fehtovka: 2, barzina: 2, srachnost: 2, sila: 2, izdr: 1 },
      { nameKey: 'battlesim882.enemy.soldier3', zhivot: 18, fehtovka: 3, barzina: 4, srachnost: 1, sila: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier4', zhivot: 16, fehtovka: 1, barzina: 2, srachnost: 2, sila: 2, izdr: 2 },
    ] },
  { id: 'romero_12', nameKey: 'battlesim882.name.romero_12', type: 'shpagi',
    enemies: [
      { nameKey: 'battlesim882.enemy.soldier1', zhivot: 15, fehtovka: 3, barzina: 2, srachnost: 2, sila: 3, izdr: 4 },
      { nameKey: 'battlesim882.enemy.soldier2', zhivot: 12, fehtovka: 2, barzina: 3, srachnost: 2, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier3', zhivot: 11, fehtovka: 3, barzina: 2, srachnost: 3, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier4', zhivot: 10, fehtovka: 2, barzina: 4, srachnost: 2, sila: 4, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier5', zhivot: 5,  fehtovka: 2, barzina: 2, srachnost: 2, sila: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier6', zhivot: 4,  fehtovka: 2, barzina: 3, srachnost: 3, sila: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier7', zhivot: 8,  fehtovka: 3, barzina: 1, srachnost: 2, sila: 2, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier8', zhivot: 10, fehtovka: 2, barzina: 2, srachnost: 3, sila: 3, izdr: 1 },
      { nameKey: 'battlesim882.enemy.soldier9', zhivot: 12, fehtovka: 2, barzina: 2, srachnost: 3, sila: 2, izdr: 1 },
      { nameKey: 'battlesim882.enemy.soldier10', zhivot: 15, fehtovka: 3, barzina: 3, srachnost: 4, sila: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier11', zhivot: 14, fehtovka: 3, barzina: 2, srachnost: 2, sila: 1, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier12', zhivot: 13, fehtovka: 4, barzina: 4, srachnost: 4, sila: 3, izdr: 5 },
    ] },
  { id: 'angular_8', nameKey: 'battlesim882.name.angular_8', type: 'shpagi',
    enemies: [
      { nameKey: 'battlesim882.enemy.soldier1', zhivot: 15, fehtovka: 3, barzina: 2, srachnost: 2, sila: 3, izdr: 4 },
      { nameKey: 'battlesim882.enemy.soldier2', zhivot: 12, fehtovka: 2, barzina: 3, srachnost: 2, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier3', zhivot: 11, fehtovka: 3, barzina: 2, srachnost: 3, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier4', zhivot: 10, fehtovka: 2, barzina: 4, srachnost: 2, sila: 4, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier5', zhivot: 5,  fehtovka: 2, barzina: 2, srachnost: 2, sila: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier6', zhivot: 4,  fehtovka: 2, barzina: 3, srachnost: 3, sila: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier7', zhivot: 8,  fehtovka: 3, barzina: 1, srachnost: 2, sila: 2, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier8', zhivot: 10, fehtovka: 2, barzina: 2, srachnost: 3, sila: 3, izdr: 1 },
    ] },
  { id: 'gate_4', nameKey: 'battlesim882.name.gate_4', type: 'shpagi',
    enemies: [
      { nameKey: 'battlesim882.enemy.soldier1', zhivot: 15, fehtovka: 3, barzina: 2, srachnost: 2, sila: 3, izdr: 4 },
      { nameKey: 'battlesim882.enemy.soldier2', zhivot: 12, fehtovka: 2, barzina: 3, srachnost: 2, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier3', zhivot: 11, fehtovka: 3, barzina: 2, srachnost: 3, sila: 3, izdr: 3 },
      { nameKey: 'battlesim882.enemy.soldier4', zhivot: 10, fehtovka: 2, barzina: 4, srachnost: 2, sila: 4, izdr: 2 },
    ] },
  { id: 'morsilya_twins', nameKey: 'battlesim882.name.morsilya_twins', type: 'shpagi',
    enemies: [
      { nameKey: 'battlesim882.enemy.edwardo', zhivot: 25, fehtovka: 5, barzina: 5, srachnost: 5, sila: 4, izdr: 5 },
      { nameKey: 'battlesim882.enemy.enrike',  zhivot: 25, fehtovka: 5, barzina: 5, srachnost: 5, sila: 4, izdr: 5 },
    ] },
  { id: 'romero_duel', nameKey: 'battlesim882.name.romero_duel', type: 'duel',
    enemy: { nameKey: 'battlesim882.enemy.romero', zhivot: 28, pronizvasht: 5, sechasht: 4, blok: 3, fint: 4, trikove: 4 } },
  { id: 'muerto_duel', nameKey: 'battlesim882.name.muerto_duel', type: 'duel',
    enemy: { nameKey: 'battlesim882.enemy.muerto', zhivot: 30, pronizvasht: 4, sechasht: 4, blok: 5, fint: 5, trikove: 2 } },
  { id: 'galdos_mounted', nameKey: 'battlesim882.name.galdos_mounted', type: 'duel',
    enemy: { nameKey: 'battlesim882.enemy.galdos', zhivot: 36, pronizvasht: 2, sechasht: 5, blok: 5, fint: 3, trikove: 2 } },
  { id: 'galdos_dismounted', nameKey: 'battlesim882.name.galdos_dismounted', type: 'duel',
    enemy: { nameKey: 'battlesim882.enemy.galdos', zhivot: 36, pronizvasht: 2, sechasht: 4, blok: 4, fint: 3, trikove: 2 } },
  { id: 'gregorio', nameKey: 'battlesim882.name.gregorio', type: 'rukopashna', enemyDamageBonus: 10,
    enemies: [{ nameKey: 'battlesim882.enemy.gregorio', zhivot: 25, rb: 4, sila: 4, izdr: 3 }] },
  { id: 'outer_guards', nameKey: 'battlesim882.name.outer_guards', type: 'shpagi',
    enemies: [
      { nameKey: 'battlesim882.enemy.soldier1', zhivot: 12, fehtovka: 4, barzina: 3, sila: 3, srachnost: 2, izdr: 2 },
      { nameKey: 'battlesim882.enemy.soldier2', zhivot: 8, fehtovka: 2, barzina: 3, sila: 2, srachnost: 4, izdr: 5 },
    ] },
];
const romeroSoldiers = ROSTER.find(e => e.id === 'romero_12').enemies;
ROSTER.push(
  { id: 'village_middle', nameKey: 'battlesim882.name.village_middle', type: 'shpagi', enemies: romeroSoldiers.slice(3, 8) },
  { id: 'village_last', nameKey: 'battlesim882.name.village_last', type: 'shpagi', enemies: romeroSoldiers.slice(8) },
  { id: 'village_whip', nameKey: 'battlesim882.name.village_whip', type: 'shpagi', enemies: romeroSoldiers.slice(9) },
);
const PLAYER_DEFAULTS = { sila: 3, barzina: 5, srachnost: 1, izdr: 2, strast: 4,
  zhivot: 50, rb: 3, fehtovka: 5, pronizvasht: 0, sechasht: 0, blok: 0, fint: 0, trikove: 0 };

function _encounter(id) { return ROSTER.find(e => e.id === id) || ROSTER[0]; }

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim882) {
    pt.sim882 = {
      encounterId: 'rosario',
      player: { ...PLAYER_DEFAULTS },
      log: [],
      history: [],
    };
  }
  return pt.sim882;
}

function _appendLog(d, line) {
  d.log ||= [];
  d.log.push(line);
  if (d.log.length > 400) d.log.shift();
}

function _recordOutcome(d, outcome) {
  d.history ||= [];
  d.history.push({ enemy: t(_encounter(d.encounterId).nameKey), outcome, ts: Date.now() });
}

function _fight(interrupt = false) {
  const d = _data();
  if (!d) return;
  const enc = _encounter(d.encounterId);
  const player = { ...PLAYER_DEFAULTS, ...d.player };
  if (!d.pendingFight && player.zhivot <= 0) return;
  if (!d.pendingFight && enc.type === 'duel' && ['pronizvasht', 'sechasht', 'blok', 'fint', 'trikove'].some(key => player[key] < 1)) {
    showAlert(t('battlesim882.ui.training_required'));
    return;
  }
  if (!d.pendingFight) {
    d.pendingFight = startZorroFight(player, enc, Number(document.getElementById('sim882-removed').value), Number(document.getElementById('sim882-prior-damage').value));
    _appendLog(d, t('battlesim882.log.header', { name: t(enc.nameKey) }));
  }
  const result = advanceZorroFight(d.pendingFight, _roll1d6, interrupt);
  for (const event of result.events) {
    const name = t(event.name);
    _appendLog(d, t(`battlesim882.log.${event.kind}`, {
      ...event, name, who: event.player ? t('battlesim882.ui.you') : name,
      attacker: event.player ? t('battlesim882.ui.you') : name,
      defender: event.player ? name : t('battlesim882.ui.you'),
    }));
  }
  d.player = { ...player, zhivot: result.state.playerLife };
  d.pendingFight = result.state.outcome ? null : result.state;
  if (result.state.outcome) {
    document.getElementById('sim882-removed').value = 0;
    document.getElementById('sim882-prior-damage').value = 0;
  }
  if (result.state.outcome === 'win') {
    _appendLog(d, t('battlesim882.log.win_footer', { trophy: SVG_TROPHY }));
    _recordOutcome(d, 'win');
  } else if (result.state.outcome === 'loss') {
    _appendLog(d, t('battlesim882.log.loss_footer', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  } else if (result.state.outcome === 'retreat') {
    _appendLog(d, t('battlesim882.log.retreat'));
    _recordOutcome(d, 'retreat');
  } else _appendLog(d, t('battlesim882.log.pending'));
  saveState();
  _renderAll();
}

function _pickEncounter(id) {
  const d = _data();
  if (!d || d.pendingFight) return;
  d.encounterId = id;
  document.getElementById('sim882-removed').value = 0;
  document.getElementById('sim882-prior-damage').value = 0;
  saveState();
  _renderAll();
}

// ── Render ───────────────────────────────────────────────────────────────

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim882-history-summary');
  const listEl = document.getElementById('sim882-history-list');
  if (!d || !sumEl || !listEl) return;
  const history = d.history || [];
  sumEl.textContent = t('battlesim882.history.summary', { n: history.length });
  if (!history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim882.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : h.outcome === 'retreat' ? '' : SVG_SKULL;
    const result = t(h.outcome === 'win' ? 'battlesim882.history.won' : h.outcome === 'retreat' ? 'battlesim882.history.retreat' : 'battlesim882.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim882-log');
  if (!el || !d) return;
  el.innerHTML = (d.log || []).slice().reverse().join('<br>');
}

function _encounterOptions(selectedId) {
  return ROSTER.map(e => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(t(e.nameKey))}</option>`).join('');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;
  document.getElementById('sim882-encounter-pick').innerHTML = _encounterOptions(d.encounterId);
  ['sila', 'barzina', 'srachnost', 'izdr', 'strast', 'zhivot', 'rb', 'fehtovka', 'pronizvasht', 'sechasht', 'blok', 'fint', 'trikove'].forEach(k => {
    const el = document.getElementById(`sim882-player-${k}`);
    if (el) el.value = d.player?.[k] ?? PLAYER_DEFAULTS[k];
  });
  const enc = _encounter(d.encounterId);
  const overlay = document.getElementById('sim882-overlay');
  overlay.querySelectorAll('.inv-qty-btn, .inv-qty-input, #sim882-encounter-pick, #sim882-prior-damage').forEach(el => { el.disabled = Boolean(d.pendingFight); });
  const removed = document.getElementById('sim882-removed');
  removed.closest('.inv-edit-row').hidden = !['romero_12', 'gate_4', 'village_whip'].includes(enc.id);
  document.getElementById('sim882-prior-damage').closest('.inv-edit-row').hidden = enc.id !== 'rosario';
  const interrupt = document.getElementById('sim882-interrupt');
  interrupt.hidden = !(d.pendingFight?.type === 'duel' && d.pendingFight.turn === false && d.pendingFight.playerInterrupts > 0);
  interrupt.textContent = t('battlesim882.btn.interrupt', { n: d.pendingFight?.playerInterrupts || 0 });
  const fight = document.getElementById('sim882-fight');
  fight.disabled = !d.pendingFight && (d.player?.zhivot ?? PLAYER_DEFAULTS.zhivot) <= 0;
  fight.textContent = t(d.pendingFight ? 'battlesim882.btn.continue' : 'battlesim882.btn.fight');
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim882() {
  const overlay = document.getElementById('sim882-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim882(); return; }
  _renderAll();
}

function openSim882() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim882-overlay').classList.add('active');
}

function closeSim882() {
  document.getElementById('sim882-overlay')?.classList.remove('active');
}

export function setSim882Visible(visible) {
  const btn = document.getElementById('sim882-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim882();
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

export function initSim882() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim882-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim882.ui.title')}</span>
        <button id="sim882-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim882.ui.you')}</div>
            ${_numField(t('battlesim882.ui.zhivot'), 'sim882-player-zhivot')}
            ${_numField(t('battlesim882.ui.sila'), 'sim882-player-sila')}
            ${_numField(t('battlesim882.ui.barzina'), 'sim882-player-barzina')}
            ${_numField(t('battlesim882.ui.srachnost'), 'sim882-player-srachnost')}
            ${_numField(t('battlesim882.ui.izdr'), 'sim882-player-izdr')}
            ${_numField(t('battlesim882.ui.strast'), 'sim882-player-strast')}
            ${_numField(t('battlesim882.ui.rb'), 'sim882-player-rb')}
            ${_numField(t('battlesim882.ui.fehtovka'), 'sim882-player-fehtovka')}
            ${_numField(t('battlesim882.ui.pronizvasht'), 'sim882-player-pronizvasht')}
            ${_numField(t('battlesim882.ui.sechasht'), 'sim882-player-sechasht')}
            ${_numField(t('battlesim882.ui.blok'), 'sim882-player-blok')}
            ${_numField(t('battlesim882.ui.fint'), 'sim882-player-fint')}
            ${_numField(t('battlesim882.ui.trikove'), 'sim882-player-trikove')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim882.ui.encounter')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim882.ui.pick')}</span>
              <select id="sim882-encounter-pick" class="inv-edit-input"></select>
            </div>
            ${_numField(t('battlesim882.ui.removed'), 'sim882-removed')}
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim882.ui.prior_damage')}</span>
              <select id="sim882-prior-damage" class="inv-edit-input">
                <option value="0">${t('battlesim882.ui.none')}</option>
                <option value="4">${t('battlesim882.ui.bottle')}</option>
                <option value="6">${t('battlesim882.ui.chair')}</option>
              </select>
            </div>
          </div>
          <div class="inv-modal-ftr bsim-action-grid">
            <button id="sim882-fight" class="inv-add-btn bsim-action-primary">${t('battlesim882.btn.fight')}</button>
            <button id="sim882-interrupt" class="inv-add-btn" hidden>${t('battlesim882.btn.interrupt', { n: 0 })}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim882-history-summary">${t('battlesim882.history.summary', { n: 0 })}</summary>
            <div id="sim882-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim882-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim882-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim882);
  document.getElementById('sim882-close').addEventListener('click', closeSim882);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim882(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim882-overlay'),
    open:  openSim882,
    close: closeSim882,
  });

  document.getElementById('sim882-encounter-pick').addEventListener('change', e => _pickEncounter(e.target.value));
  document.getElementById('sim882-fight').addEventListener('click', () => _fight());
  document.getElementById('sim882-interrupt').addEventListener('click', () => _fight(true));
  document.getElementById('sim882-removed').value = 0;

  const statKeys = ['sila', 'barzina', 'srachnost', 'izdr', 'strast', 'zhivot', 'rb', 'fehtovka', 'pronizvasht', 'sechasht', 'blok', 'fint', 'trikove'];
  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d || d.pendingFight) return;
      const id    = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const maximum = id.endsWith('-zhivot') ? 50 : id.endsWith('-removed') ? Math.max(0, (_encounter(d.encounterId).enemies?.length || 1) - 1) : 5;
      const val   = Math.min(maximum, Math.max(0, (parseInt(input.value, 10) || 0) + delta));
      input.value = val;
      const key = statKeys.find(k => id === `sim882-player-${k}`);
      if (key) { d.player ||= { ...PLAYER_DEFAULTS }; d.player[key] = val; }
      saveState();
    });
  });

  overlay.querySelectorAll('.inv-qty-input').forEach(input => {
    input.addEventListener('change', () => {
      const d = _data();
      if (!d || d.pendingFight) return;
      const maximum = input.id.endsWith('-zhivot') ? 50 : input.id.endsWith('-removed') ? Math.max(0, (_encounter(d.encounterId).enemies?.length || 1) - 1) : 5;
      const val = Math.min(maximum, Math.max(0, parseInt(input.value, 10) || 0));
      input.value = val;
      const key = statKeys.find(k => input.id === `sim882-player-${k}`);
      if (key) { d.player ||= { ...PLAYER_DEFAULTS }; d.player[key] = val; }
      saveState();
    });
  });
}
