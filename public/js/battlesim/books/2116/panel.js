import { definition, QUALITIES, ITEMS, ENCOUNTERS } from './definition.js';
import { resolveEncounter } from './combat.js';
import { createState } from './state.js';
import { currentBookId, currentPlaythrough, saveState } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';

const ID = definition.stateKey;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export function createFullMoonPanel({document, t, getRun, getBookId, saveState, showAlert, getButtonRow, registerShortcut = () => {}}) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  let rendered, displayedRun;
  const button = key => `<button type="button" class="bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const input = (key, min = 0, value = '') => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="1000000" step="1" value="${value}"></label>`;
  function number(key) {
    const field = el(key), raw = field.value.trim(), value = Number(raw);
    if (!raw || !Number.isSafeInteger(value) || value < Number(field.min) || value > Number(field.max)) {
      field.closest('details')?.setAttribute('open', ''); field.focus(); throw new RangeError('Invalid field');
    }
    return value;
  }
  function close() {el('overlay')?.classList.remove('active');}
  function change(update) {
    if (getRun() !== displayedRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) {close(); return;}
    try {if (store.change(update)) render(true);} catch {showAlert(tk('invalid'));}
  }
  function methods() {
    const encounter = el('encounter').value, previous = el('method').value;
    el('method').innerHTML = ENCOUNTERS[encounter].map(id => `<option value="${id}">${escape(tk('method.' + id))} (${id})</option>`).join('');
    if (ENCOUNTERS[encounter].includes(Number(previous))) el('method').value = previous;
  }
  function render(force = false) {
    if (Number(getBookId()) !== definition.id || !getRun()) {close(); rendered = null; return;}
    if (el('overlay')?.classList.contains('active') && getRun() !== displayedRun) {close(); return;}
    const d = store.read();
    if (!d || !force && d === rendered) return;
    rendered = d;
    for (const key of QUALITIES) el(key).value = d.character?.stats[key] ?? '';
    el('score').value = d.character?.score ?? 100;
    for (const key of ITEMS) el('owned-' + key).checked = Boolean(d.items[key]);
    el('resolve').disabled = !d.character || Boolean(d.fight);
    el('again').disabled = !d.fight;
    el('encounter').disabled = el('method').disabled = Boolean(d.fight);
    const fight = d.fight;
    el('result').textContent = fight ? [fight.name, tk('outcome.' + fight.outcome),
      ...(fight.attackCheck ? [tk('check', fight.attackCheck)] : []),
      ...(fight.total === undefined ? [] : [tk('check', fight)]),
      tk('destination', {section: fight.section}), tk('scoreChange', {amount: fight.scoreDelta}),
      fight.next ? tk('continue', {section: fight.next}) : tk('retry', {section: fight.retry}),
      ...(fight.consumed ? [tk('consumed', {item: tk(fight.consumed)})] : [])].join('\n') : tk('ready');
    el('history').textContent = d.history.slice(-40).reverse().map(h => h.enemy + ': ' + tk('outcome.' + h.outcome)).join('\n');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) {showAlert(t('battlesim.no_active_playthrough')); return;}
    try {store.ensure(); displayedRun = getRun(); el('overlay').classList.add('active'); render(true); el('close').focus();}
    catch {close(); showAlert(tk('invalid'));}
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    const equipment = ITEMS.map(key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-owned-${key}">${escape(tk(key))}</label>`).join('');
    const encounters = Object.keys(ENCOUNTERS).map(key => `<option value="${key}">${escape(tk('enemy.' + key))}</option>`).join('');
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title">
      <div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div>
      <div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p>
      <details open><summary>${escape(tk('character'))}</summary><p>${escape(tk('setup'))}</p>
      ${QUALITIES.map(key => input(key)).join('')}${input('score', -1000000, 100)}${equipment}${button('apply')}</details></div>
      <div class="bsim-col bsim-col-right"><label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter">${encounters}</select></label>
      <label class="inv-edit-row"><span>${escape(tk('method'))}</span><select class="inv-edit-input" id="${ID}-method"></select></label>
      <div class="bsim-btn-row">${button('resolve')}${button('again')}</div><p class="bsim-status" id="${ID}-result" role="status" aria-live="polite"></p>
      <details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list bsim-status" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    const btn = document.createElement('button'); btn.id = ID + '-btn'; btn.textContent = t('battlesim.title'); btn.style.display = 'none';
    getButtonRow().appendChild(btn); btn.addEventListener('click', open);
    el('close').addEventListener('click', close);
    overlay.addEventListener('click', event => {if (event.target === overlay) close();});
    overlay.addEventListener('keydown', event => {if (event.key === 'Escape') {event.stopPropagation(); close();}});
    el('encounter').addEventListener('change', methods); methods();
    el('apply').addEventListener('click', () => change(d => {
      d.character = {stats: Object.fromEntries(QUALITIES.map(key => [key, number(key)])), score: number('score')};
      d.items = Object.fromEntries(ITEMS.map(key => [key, el('owned-' + key).checked]));
    }));
    el('resolve').addEventListener('click', () => change(d => {
      if (!d.character || d.fight) return;
      const encounter = el('encounter').value, method = Number(el('method').value);
      const result = resolveEncounter(encounter, method, d.character.stats, d.items);
      d.fight = {...result, encounter, method, name: tk('enemy.' + encounter), ruleVersion: 1};
      d.character.score += result.scoreDelta;
      if (result.consumed) d.items[result.consumed] = false;
    }));
    el('again').addEventListener('click', () => change(d => {d.fight = null;}));
    registerShortcut({button: btn, overlay, open, close});
  }
  return {init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) close();
  }};
}

const panel = createFullMoonPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId,
  saveState, showAlert, getButtonRow: getPlayBtnRow,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  },
});
export function initSim2116() {panel.init();}
export function renderSim2116() {panel.render();}
export function setSim2116Visible(visible) {panel.setVisible(visible);}
export { initSim2116 as init, renderSim2116 as render, setSim2116Visible as setVisible };
