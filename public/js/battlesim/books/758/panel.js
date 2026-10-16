import {definition, PROGRAM_TYPES, encounterOptions} from './definition.js';
import {createLedger, validateLedger, resolveProgram, rechargePrograms, useSafety} from './combat.js';
import {createState} from './state.js';
import {currentBookId, currentPlaythrough, saveState} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

const ID = definition.stateKey;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export function createCyberProgramsPanel({document, t, getRun, getBookId, saveState, showAlert, getButtonRow, registerShortcut = () => {}}) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId: getBookId(), currentPlaythrough: getRun, saveState}));
  const button = key => `<button type="button" class="bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  let displayedRun, rendered;
  function close() {el('overlay')?.classList.remove('active');}
  function change(update) {
    if (getRun() !== displayedRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) {close(); return;}
    try {if (store.change(update)) render(true);} catch {showAlert(tk('invalid'));}
  }
  function options() {
    const encounter = Number(el('encounter').value), previous = el('program').value;
    const clan = store.read()?.ledger.clan ?? 'A';
    el('program').innerHTML = encounterOptions(encounter).map(option => `<option value="${option.type}${option.index}">${escape(tk('program.' + clan + '.' + option.type + '.' + option.index))}</option>`).join('');
    if ([...el('program').options].some(option => option.value === previous)) el('program').value = previous;
  }
  function render(force = false) {
    if (Number(getBookId()) !== definition.id || !getRun()) {close(); rendered = null; return;}
    if (el('overlay')?.classList.contains('active') && getRun() !== displayedRun) {close(); return;}
    const data = store.read();
    if (!data || !force && data === rendered) return;
    rendered = data;
    el('clan').value = data.ledger.clan;
    for (const type of PROGRAM_TYPES) for (const index of [0, 1, 2]) {
      const key = type + index, program = data.ledger.programs[key];
      el('label-' + key).textContent = tk('program.' + data.ledger.clan + '.' + type + '.' + index);
      el('owned-' + key).checked = program.owned;
      el('uses-' + key).value = program.remaining;
    }
    el('safety').checked = data.ledger.safety;
    options();
    const fight = data.fight;
    for (const key of ['resolve', 'encounter', 'program', 'apply', 'clan', 'recharge']) el(key).disabled = Boolean(fight);
    el('again').disabled = !fight;
    el('rescue').disabled = Boolean(fight) || !data.ledger.safety;
    el('result').textContent = fight ? [fight.name, tk('outcome.' + fight.outcome), fight.section ? tk('destination', {section: fight.section}) : tk('escaped')].join('\n') : tk('ready');
    el('history').textContent = data.history.slice(-40).reverse().map(row => row.enemy + ': ' + tk('outcome.' + row.outcome)).join('\n');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) {showAlert(t('battlesim.no_active_playthrough')); return;}
    try {store.ensure(); displayedRun = getRun(); el('overlay').classList.add('active'); render(true); el('close').focus();}
    catch {close(); showAlert(tk('invalid'));}
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    const programs = PROGRAM_TYPES.map(type => `<h4>${escape(tk(type))}</h4>` + [0, 1, 2].map(index => {
      const key = type + index;
      return `<label class="inv-edit-row"><span><input type="checkbox" id="${ID}-owned-${key}"> <span id="${ID}-label-${key}"></span></span><input class="inv-edit-input" id="${ID}-uses-${key}" type="number" min="0" max="3" step="1" value="0" aria-label="${escape(tk('uses'))}"></label>`;
    }).join('')).join('');
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title">
      <div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div>
      <div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><details open><summary>${escape(tk('ledger'))}</summary>
      <label class="inv-edit-row"><span>${escape(tk('clan'))}</span><select class="inv-edit-input" id="${ID}-clan"><option value="A">${escape(tk('alpha'))}</option><option value="O">${escape(tk('omega'))}</option></select></label>
      <p>${escape(tk('usesNote'))}</p>${programs}<label class="bsim-checkbox"><input type="checkbox" id="${ID}-safety">${escape(tk('safety'))}</label>
      <div class="bsim-btn-row">${button('apply')}${button('recharge')}</div></details></div>
      <div class="bsim-col bsim-col-right"><label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter">${Array.from({length: 18}, (_, index) => `<option value="${index + 1}">${escape(tk('enemy.' + (index + 1)))}</option>`).join('')}</select></label>
      <label class="inv-edit-row"><span>${escape(tk('program'))}</span><select class="inv-edit-input" id="${ID}-program"></select></label>
      <div class="bsim-btn-row">${button('resolve')}${button('rescue')}${button('again')}</div><p class="bsim-status" role="status" aria-live="polite" id="${ID}-result"></p>
      <details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list bsim-status" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.textContent = t('battlesim.title'); trigger.style.display = 'none';
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close);
    overlay.addEventListener('click', event => {if (event.target === overlay) close();});
    overlay.addEventListener('keydown', event => {if (event.key === 'Escape') {event.stopPropagation(); close();}});
    el('encounter').addEventListener('change', options);
    el('clan').addEventListener('change', () => {
      const clan = el('clan').value;
      for (const type of PROGRAM_TYPES) for (const index of [0, 1, 2]) {
        el('label-' + type + index).textContent = tk('program.' + clan + '.' + type + '.' + index);
        el('owned-' + type + index).checked = false;
        el('uses-' + type + index).value = 0;
      }
      el('safety').checked = false;
    });
    el('apply').addEventListener('click', () => change(data => {
      if (data.fight) return;
      const ledger = createLedger(el('clan').value);
      for (const type of PROGRAM_TYPES) for (const index of [0, 1, 2]) {
        const key = type + index, field = el('uses-' + key), raw = field.value.trim();
        if (!raw || !Number.isInteger(Number(raw))) throw new RangeError('Invalid count');
        ledger.programs[key] = {owned: el('owned-' + key).checked, remaining: Number(raw)};
      }
      ledger.safety = el('safety').checked;
      data.ledger = validateLedger(ledger);
    }));
    el('recharge').addEventListener('click', () => change(data => {if (!data.fight) data.ledger = rechargePrograms(data.ledger);}));
    function resolve(rescue) {
      change(data => {
        if (data.fight) return;
        const encounter = Number(el('encounter').value), key = el('program').value;
        const option = encounterOptions(encounter).find(option => option.type + option.index === key);
        if (!option) throw new RangeError('Invalid choice');
        const result = rescue ? useSafety(data.ledger, encounter) : resolveProgram(data.ledger, encounter, option.type, option.index);
        data.ledger = result.ledger;
        data.fight = {...result.fight, name: tk('enemy.' + encounter)};
      });
    }
    el('resolve').addEventListener('click', () => resolve(false));
    el('rescue').addEventListener('click', () => resolve(true));
    el('again').addEventListener('click', () => change(data => {data.fight = null;}));
    registerShortcut({button: trigger, overlay, open, close});
  }
  return {init, render, open, close, setVisible(visible) {if (el('btn')) el('btn').style.display = visible ? '' : 'none'; if (!visible) close();}};
}

const panel = createCyberProgramsPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId,
  saveState, showAlert, getButtonRow: getPlayBtnRow,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  },
});
export function initSim758() {panel.init();}
export function renderSim758() {panel.render();}
export function setSim758Visible(visible) {panel.setVisible(visible);}
export { initSim758 as init, renderSim758 as render, setSim758Visible as setVisible };
