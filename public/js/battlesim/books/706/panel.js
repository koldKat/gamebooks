import { definition, POSITIONS } from './definition.js';
import { defendShip, retakeShip, attackShip } from './combat.js';
import { createState } from './state.js';
import { currentBookId, currentPlaythrough, saveState } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';

const ID = definition.stateKey;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const active = fight => Boolean(fight && !fight.outcome);

export function createDesertPanel({ document, t, getRun, getBookId, saveState, showAlert, showConfirm,
  getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t('battlesim706.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({ currentBookId: getBookId(), currentPlaythrough: getRun, saveState }));
  let rendered, displayedRun;
  const input = (key, label, max, value = 0, min = 0) => `<label class="inv-edit-row"><span>${escape(tk(label))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="${max}" step="1" value="${value}"></label>`;
  const check = (key, label) => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(label))}</label>`;
  const button = (key, label = key) => `<button type="button" class="bsim-action-btn" id="${ID}-${key}">${escape(tk(label))}</button>`;
  function number(key) {
    const field = el(key), raw = field.value.trim(), value = Number(raw);
    if (!raw || !Number.isInteger(value) || value < Number(field.min) || value > Number(field.max)) {
      field.closest('details')?.setAttribute('open', '');
      field.focus(); throw new RangeError('Invalid field');
    }
    return value;
  }
  function change(update) {
    if (getRun() !== displayedRun || !el('overlay')?.classList.contains('active')) { close(); return; }
    try { if (store.change(update)) render(true); }
    catch { showAlert(tk('invalid')); }
  }
  function close() { el('overlay')?.classList.remove('active'); }
  function cancel() {
    const run = getRun(), before = store.read();
    if (!active(before?.naval)) return;
    showConfirm(tk('cancelConfirm'), () => {
      if (Number(getBookId()) !== definition.id || getRun() !== run || store.read() !== before) return;
      change(d => {
        if (active(d.naval)) d.naval.outcome = 'cancelled';
      });
    });
  }
  function render(force = false) {
    if (Number(getBookId()) !== definition.id || !getRun()) { close(); rendered = null; return; }
    if (el('overlay')?.classList.contains('active') && getRun() !== displayedRun) { close(); return; }
    const d = store.read();
    if (!d || !force && d === rendered) return;
    rendered = d;
    el('endurance').value = d.character.endurance;
    el('silver').value = d.character.silver;
    const busy = active(d.naval);
    el('cancel').disabled = !busy;
    el('apply').disabled = busy;
    el('endurance').disabled = el('silver').disabled = busy;
    el('history').textContent = d.history.slice(-40).reverse().map(h => h.enemy + ': ' + tk('status.' + h.outcome)).join('\n');
    for (const key of Object.keys(POSITIONS)) {
      const point = d.deployment[key] ?? {};
      for (const field of ['force', 'pots', 'bows']) el(key + '-' + field).value = point[field] ?? (key === 'А' && field === 'force' ? 31 : 0);
      for (const field of ['whip', 'chestnuts', 'poison']) el(key + '-' + field).checked = Boolean(point[field]);
    }
    for (const key of ['whip', 'chestnuts', 'poison']) el('owned-' + key).checked = Boolean(d.equipment[key]);
    for (const control of el('deployment').querySelectorAll('input')) control.disabled = active(d.naval);
    el('defend').disabled = busy || d.character.endurance < 0;
    const naval = d.naval;
    el('retakeFields').hidden = !active(naval) || naval.phase !== 1;
    el('attackFields').hidden = !active(naval) || naval.phase !== 2;
    el('navalStatus').textContent = naval ? [tk('phaseStatus', naval),
      naval.remainingPirates === undefined ? '' : tk('pirates', { count: naval.remainingPirates }),
      naval.outcome ? tk('status.' + naval.outcome) : '',
      naval.destination ? tk('return', { section: naval.destination }) : '',
      ...(naval.results ?? []).map(r => tk('pointStatus', r))].filter(Boolean).join('\n') : '';
    if (naval) {
      el('survivors').value = naval.survivors;
      el('survivors').max = naval.survivors;
      el('attackSurvivors').value = naval.survivors;
      el('attackSurvivors').max = naval.survivors;
    }
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    try {
      store.ensure();
      displayedRun = getRun();
      el('overlay').classList.add('active'); render(true); el('close').focus();
    } catch { close(); showAlert(tk('invalid')); }
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    const deployments = Object.keys(POSITIONS).map(key => `<details><summary>${escape(tk('position.' + key))} (${key})</summary>`
      + input(key + '-force', 'force', 31, key === 'А' ? 31 : 0) + input(key + '-pots', 'pots', 8) + input(key + '-bows', 'bows', 3)
      + ['whip', 'chestnuts', 'poison'].map(field => check(key + '-' + field, field)).join('') + '</details>').join('');
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><details><summary>${escape(tk('character'))}</summary>${input('endurance', 'endurance', 40, 40, -1000)}${input('silver', 'silver', 1000000, 40)}${button('apply')}</details><div id="${ID}-naval"><p>${escape(tk('navalNote'))}</p><div id="${ID}-deployment">${['whip', 'chestnuts', 'poison'].map(field => check('owned-' + field, 'own.' + field)).join('')}${deployments}</div>${button('defend')}<p class="bsim-status" id="${ID}-navalStatus" role="status" aria-live="polite"></p><div id="${ID}-retakeFields" hidden><p>${escape(tk('manualEquipment'))}</p>${input('survivors', 'survivors', 31)}${check('whipSurvives', 'whipSurvives')}${input('whipKills', 'whipKills', 3)}${button('retake')}</div><div id="${ID}-attackFields" hidden><p>${escape(tk('manualEquipment'))}</p>${input('attackSurvivors', 'survivors', 31)}${input('availablePots', 'availablePots', 8)}${input('availableBows', 'availableBows', 3)}${check('availablePoison', 'availablePoison')}${button('attack')}</div></div><div class="bsim-btn-row">${button('cancel')}</div></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list bsim-status" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    const btn = document.createElement('button'); btn.id = ID + '-btn'; btn.textContent = t('battlesim.title'); btn.style.display = 'none';
    getButtonRow().appendChild(btn); btn.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', e => { backdrop = e.target === overlay; });
    overlay.addEventListener('click', e => { if (backdrop && e.target === overlay) close(); });
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    el('apply').addEventListener('click', () => change(d => {
      if (active(d.naval)) return;
      d.character = { endurance: number('endurance'), silver: number('silver') };
    }));
    el('cancel').addEventListener('click', cancel);
    el('defend').addEventListener('click', () => change(d => {
      if (active(d.naval) || d.character.endurance < 0) return;
      d.deployment = Object.fromEntries(Object.keys(POSITIONS).map(key => [key, {
        ...Object.fromEntries(['force', 'pots', 'bows'].map(field => [field, number(key + '-' + field)])),
        ...Object.fromEntries(['whip', 'chestnuts', 'poison'].map(field => [field, el(key + '-' + field).checked])),
      }]));
      d.equipment = Object.fromEntries(['whip', 'chestnuts', 'poison'].map(field => [field, el('owned-' + field).checked]));
      d.naval = { ...defendShip(d.deployment, d.equipment), ruleVersion: 1, kind: 'combat', name: tk('naval'), outcome: null };
      if (d.naval.destination) d.naval.outcome = 'loss';
    }));
    el('retake').addEventListener('click', () => change(d => {
      if (!active(d.naval) || d.naval.phase !== 1) return;
      if (el('whipSurvives').checked && !d.equipment.whip) throw new RangeError('Whip not owned');
      const result = retakeShip({ survivors: number('survivors'), remainingPirates: d.naval.remainingPirates,
        whipSurvives: el('whipSurvives').checked, whipKills: number('whipKills') });
      d.naval = { ...d.naval, ...result };
      if (result.destination) d.naval.outcome = 'loss';
    }));
    el('attack').addEventListener('click', () => change(d => {
      if (!active(d.naval) || d.naval.phase !== 2) return;
      if (el('availablePoison').checked && !d.equipment.poison) throw new RangeError('Poison not owned');
      const result = attackShip({ survivors: number('attackSurvivors'), pots: number('availablePots'),
        bows: number('availableBows'), poison: el('availablePoison').checked });
      d.naval = { ...d.naval, ...result, outcome: result.destination === 68 ? 'win' : result.destination === 58 ? 'loss' : 'retreat' };
    }));
    registerShortcut({ button: btn, overlay, open, close });
  }
  return { init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) close();
  } };
}

const panel = createDesertPanel({ document, t, getRun: currentPlaythrough, getBookId: () => currentBookId,
  saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  },
});
export function initSim706() { panel.init(); }
export function renderSim706() { panel.render(); }
export function setSim706Visible(visible) { panel.setVisible(visible); }
export { initSim706 as init, renderSim706 as render, setSim706Visible as setVisible };
