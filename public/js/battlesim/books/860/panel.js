import { definition, ENCOUNTERS } from './definition.js';
import * as combat from './combat.js';
import { createState } from './state.js';
import { createOpponentEditor } from '../../opponents.js';
import { currentBookId, currentPlaythrough, saveState } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';

const ID = definition.stateKey;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createHousePanel({document,t,getRun,getBookId,saveState,showAlert,showConfirm,getButtonRow,registerShortcut = () => {}}) {
  const tk = (key, values) => t(definition.i18nPrefix + '.' + key, values);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId:getBookId(),currentPlaythrough:getRun,saveState}));
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const number = (key, min, max) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="${max}" step="1" required></label>`;
  let shownRun, editor, editorRun, rendered, characterStamp;
  function close() {el('overlay')?.classList.remove('active'); rendered = null;}
  function change(update) {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) {close(); return;}
    try {if (store.change(update)) render(true);} catch {showAlert(tk('invalid'));}
  }
  function confirmed(key, update) {
    const run = getRun(), before = store.read();
    showConfirm(tk(key), () => {if (getRun() === run && store.read() === before) change(update);});
  }
  function numeric(key) {
    if (!el(key).value.trim()) throw new RangeError('Missing value');
    return Number(el(key).value);
  }
  function character() {return combat.validateCharacter({energy:numeric('energy'),initialEnergy:numeric('initialEnergy')});}
  function saveSetup(sourceId) {
    if (store.read()?.pending) return;
    change(data => {
      data.opponents = editor.snapshot();
      const candidate = sourceId ?? data.sourceId;
      const preset = ENCOUNTERS.find(row => row.id === candidate), opponent = data.opponents[0];
      data.sourceId = preset && opponent.displayName === preset.displayName && Number(opponent.threshold) === preset.threshold
        && Number(opponent.damageDice) === preset.damageDice ? candidate : null;
    });
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id) {close(); return;}
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    const locked = Boolean(data.pending);
    if (editorRun !== getRun()) {
      editorRun = getRun(); characterStamp = null;
      editor.set(data.opponents ?? [{displayName:tk('customOpponent'),threshold:8,damageDice:1}]);
    }
    editor.lock(locked); editor.fixCount(true);
    const stamp = JSON.stringify(data.character);
    if (stamp !== characterStamp || locked) {
      characterStamp = stamp;
      for (const key of ['energy','initialEnergy']) el(key).value = data.character[key];
    }
    for (const key of ['energy','initialEnergy','newCharacter','saveCharacter']) el(key).disabled = locked;
    el('start').disabled = locked || !data.character.energy;
    el('resolve').disabled = !locked;
    el('cancel').disabled = !locked;
    el('accuracy').disabled = locked || !data.character.energy;
    el('manualDice').hidden = !el('manual').checked;
    el('special').hidden = !ENCOUNTERS.some(row => row.id === data.sourceId && row.heavyWound);
    const result = data.result;
    el('status').textContent = tk('status.' + (locked ? 'pending' : result?.outcome ?? 'ready'));
    el('totals').textContent = tk('totals',{energy:data.character.energy,initial:data.character.initialEnergy});
    el('destination').textContent = result?.destination ? tk('destination',{section:result.destination}) : '';
    el('log').innerHTML = data.log.slice(-80).map(line => '<div>' + escape(line) + '</div>').join('');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) {showAlert(t('battlesim.no_active_playthrough')); return;}
    shownRun = getRun(); editorRun = null;
    try {
      if (!store.read()) store.change(data => {data.character = combat.newCharacter();});
      el('overlay').classList.add('active'); render(true); el('close').focus();
    } catch {close(); showAlert(tk('invalid'));}
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div>${number('energy',0,1000000)}${number('initialEnergy',1,1000000)}<div class="bsim-btn-row">${button('saveCharacter')}${button('newCharacter')}</div></div><div id="${ID}-editor"></div><p>${escape(tk('customNote'))}</p><p id="${ID}-special">${escape(tk('special'))}</p><div class="bsim-btn-row">${button('start')}${button('resolve')}${button('cancel')}</div><label class="bsim-checkbox"><input type="checkbox" id="${ID}-manual">${escape(tk('manual'))}</label><div id="${ID}-manualDice">${number('attackOne',1,6)}${number('attackTwo',1,6)}${number('damageOne',1,6)}${number('damageTwo',1,6)}</div><div class="bsim-side"><div class="bsim-side-title">${escape(tk('accuracyTitle'))}</div><p>${escape(tk('accuracyNote'))}</p>${number('accuracyDie',1,6)}<div class="bsim-btn-row">${button('accuracy')}</div></div></div><div class="bsim-col bsim-col-right"><div class="bsim-status" id="${ID}-status" role="status" aria-live="polite"></div><p id="${ID}-totals"></p><p id="${ID}-destination"></p><div class="bsim-log" id="${ID}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({document,id:ID,t,language:'bg',presets:ENCOUNTERS,
      fields:[{key:'threshold',label:tk('threshold'),min:0,max:12},{key:'damageDice',label:tk('damageDice'),min:0,max:2}],
      onSelect:selected => saveSetup(String(selected.id))});
    el('editor').appendChild(editor.element);
    editor.element.addEventListener('input', () => saveSetup());
    editor.element.addEventListener('change', () => saveSetup());
    for (const key of ['attackOne','attackTwo','damageOne','damageTwo','accuracyDie']) el(key).value = 1;
    el('manual').addEventListener('change', () => render(true));
    el('close').addEventListener('click',close);
    let backdrop = false;
    overlay.addEventListener('mousedown',event => {backdrop = event.target === overlay;});
    overlay.addEventListener('click',event => {if (backdrop && event.target === overlay) close();});
    overlay.addEventListener('keydown',event => {if (event.key === 'Escape' && !event.defaultPrevented) {event.stopPropagation();close();}});
    el('newCharacter').addEventListener('click', () => confirmed('newCharacterConfirm',data => {
      if (data.pending) throw new RangeError('Active round');
      data.character = combat.newCharacter(); data.result = null; data.log = [];
    }));
    el('saveCharacter').addEventListener('click', () => change(data => {
      if (data.pending) throw new RangeError('Active round');
      data.character = character(); data.result = null;
    }));
    el('start').addEventListener('click', () => change(data => {
      if (data.pending) throw new RangeError('Active round');
      const opponents = editor.read();
      if (opponents.length !== 1) throw new RangeError('Choose one encounter');
      const source = ENCOUNTERS.find(row => row.id === data.sourceId && row.heavyWound) ?? null;
      data.encounter = combat.validateEncounter({...opponents[0],id:source?.id,heavyWound:Boolean(source)});
      data.character = character();
      if (!data.character.energy) throw new RangeError('Dead character');
      data.opponents = editor.snapshot(); data.pending = true; data.result = null;
    }));
    el('resolve').addEventListener('click', () => change(data => {
      if (!data.pending) throw new RangeError('No active round');
      const supplied = el('manual').checked ? {
        attackDice:data.encounter.threshold ? [numeric('attackOne'),numeric('attackTwo')] : undefined,
        damageDice:data.encounter.heavyWound ? undefined : Array.from({length:data.encounter.damageDice},(_, index) => numeric(index ? 'damageTwo' : 'damageOne')),
      } : {};
      const result = combat.resolveRound(data.character,data.encounter,supplied);
      data.character = result.character; data.result = result; data.pending = false;
      data.log.push(tk('event',{name:result.encounter.displayName,attack:result.attackTotal ?? tk('automatic'),damage:result.damage,energy:data.character.energy}));
      if (result.encounter.heavyWound && result.wounded) data.log.push(tk('heavyResult'));
    }));
    el('cancel').addEventListener('click', () => change(data => {data.pending = false;}));
    el('accuracy').addEventListener('click', () => change(data => {
      if (data.pending || !data.character.energy) throw new RangeError('Unavailable roll');
      const result = combat.rollAccuracy(el('manual').checked ? numeric('accuracyDie') : undefined);
      data.log.push(tk('accuracyResult',result));
    }));
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click',open);
    registerShortcut({button:trigger,overlay,open,close});
  }
  return {init,render,open,close,setVisible(visible) {if (el('btn')) el('btn').style.display = visible ? '' : 'none'; if (!visible) {close(); shownRun = null;}}};
}

const panel = createHousePanel({document,t,getRun:currentPlaythrough,getBookId:() => currentBookId,saveState,showAlert,showConfirm,getButtonRow:getPlayBtnRow,
  registerShortcut({button,overlay,open,close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:() => button,getOverlay:() => overlay,otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id),open,close});
  }});
export function initSim860() {panel.init();}
export function renderSim860() {panel.render();}
export function setSim860Visible(visible) {panel.setVisible(visible);}
export { initSim860 as init, renderSim860 as render, setSim860Visible as setVisible };
