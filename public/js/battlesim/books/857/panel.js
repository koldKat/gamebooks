import { definition, ENCOUNTERS, encounterPreset } from './definition.js';
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
const characterFields = ['combat','movement','life','damage','armour','gold'];
const active = fight => Boolean(fight && !fight.outcome);

export function createEmeraldPanel({document,t,getRun,getBookId,saveState,showAlert,showConfirm,getButtonRow,registerShortcut = () => {}}) {
  const tk = (key,values) => t(definition.i18nPrefix + '.' + key,values);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId:getBookId(),currentPlaythrough:getRun,saveState}));
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const number = (key,min = 0,max = 1000000,label = key) => `<label class="inv-edit-row"><span>${escape(tk(label))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="${max}" step="1" required></label>`;
  let shownRun,editor,editorRun,stamp,rendered;
  function close() {el('overlay')?.classList.remove('active');rendered = null;}
  function change(update) {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) {close();return;}
    try {if (store.change(update)) render(true);} catch {showAlert(tk('invalid'));}
  }
  function confirmed(key,update) {
    const run = getRun(), before = store.read();
    showConfirm(tk(key),() => {if (getRun() === run && store.read() === before) change(update);});
  }
  function numeric(key) {
    if (!el(key).value.trim()) throw new RangeError('Missing value');
    return Number(el(key).value);
  }
  function character() {return combat.validateCharacter(Object.fromEntries(characterFields.map(key => [key,numeric(key)])));}
  function dice() {return el('manual').checked ? {playerDie:numeric('die-one'),enemyDie:numeric('die-two')} : {};}
  function updateFight(data,fight) {
    data.fight = fight;
    for (const event of fight.events) data.log.push(tk('event.' + event.kind,{...event,actor:tk('actor.' + (event.actor ?? 'player'))}));
  }
  function saveSetup() {
    if (!active(store.read()?.fight)) change(data => {data.opponents = editor.snapshot();data.encounter = el('encounter').value;});
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id) {close();return;}
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    const fight = data.fight, locked = active(fight);
    if (editorRun !== getRun()) {
      editorRun = getRun();stamp = null;
      el('encounter').value = data.encounter ?? '';
      editor.set(data.opponents ?? [{displayName:tk('customOpponent'),combat:0,movement:0,hp:8,damage:1,armour:0}]);
    }
    editor.lock(locked);editor.fixCount(Boolean(el('encounter').value));
    const next = JSON.stringify(data.character);
    if (stamp !== next || locked) {stamp = next;for (const key of characterFields) el(key).value = data.character[key];}
    for (const key of [...characterFields,'newCharacter','saveCharacter','encounter']) el(key).disabled = locked;
    el('start').disabled = locked || !data.character.life;
    el('attack').disabled = !locked || !fight.actor || fight.pendingTie;
    el('abandon').disabled = !locked;
    el('initiative').hidden = !locked || fight.actor !== null;
    el('tie').hidden = !locked || !fight.pendingTie;
    for (const key of ['playerFirst','enemyFirst']) el(key).disabled = !locked || fight.actor !== null;
    el('resolveTie').disabled = !locked || !fight.pendingTie;
    el('manualDice').hidden = !el('manual').checked;
    el('status').textContent = tk('status.' + (fight?.outcome ?? (fight ? 'active' : 'ready')));
    el('totals').textContent = fight ? tk('totals',{life:data.character.life,enemies:fight.enemies.map(row => row.name + ': ' + row.hp).join(' · ')}) : '';
    el('actor').textContent = locked && fight.actor ? tk('turn',{actor:tk('actor.' + fight.actor)}) : '';
    el('destination').textContent = fight?.destination ? tk('destination',{section:fight.destination}) : '';
    el('log').innerHTML = data.log.slice(-80).map(line => '<div>' + escape(line) + '</div>').join('');
    el('history').innerHTML = data.history.slice(-40).reverse().map(row => '<div>' + escape(row.enemy + ': ' + tk('status.' + row.outcome)) + '</div>').join('');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) {showAlert(t('battlesim.no_active_playthrough'));return;}
    shownRun = getRun();editorRun = null;
    try {
      if (!store.read()) store.change(data => {data.character = combat.newCharacter();});
      el('overlay').classList.add('active');render(true);el('close').focus();
    } catch {close();showAlert(tk('invalid'));}
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');overlay.id = ID + '-overlay';overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div>${characterFields.map(key => number(key,['combat','movement'].includes(key) ? -1000000 : 0)).join('')}<div class="bsim-btn-row">${button('saveCharacter')}${button('newCharacter')}</div></div><label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter"><option value="">${escape(tk('custom'))}</option>${ENCOUNTERS.map(row => `<option value="${row.id}">${escape(row.displayName)}</option>`).join('')}</select></label><div id="${ID}-editor"></div><p>${escape(tk('customNote'))}</p><div class="bsim-btn-row">${button('start')}${button('attack')}${button('abandon')}</div><label class="bsim-checkbox"><input type="checkbox" id="${ID}-manual">${escape(tk('manual'))}</label><div id="${ID}-manualDice">${number('die-one',1,6,'die.one')}${number('die-two',1,6,'die.two')}</div><div id="${ID}-initiative"><p>${escape(tk('initiativeNote'))}</p><div class="bsim-btn-row">${button('playerFirst')}${button('enemyFirst')}</div></div><div id="${ID}-tie"><p>${escape(tk('tieNote'))}</p>${number('dealt')}${number('received')}<div class="bsim-btn-row">${button('resolveTie')}</div></div></div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-actor"></p><p id="${ID}-totals"></p><p id="${ID}-destination"></p><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({document,id:ID,t,language:'bg',presets:ENCOUNTERS,
      fields:['combat','movement','hp','damage','armour'].map(key => ({key,label:tk(key === 'hp' ? 'life' : key),min:['combat','movement'].includes(key) ? -1000000 : key === 'hp' ? 1 : 0,max:1000000})),
      onSelect(selected) {
        el('encounter').value = editor.snapshot().length === 1 ? selected.id : '';
        saveSetup();
      }});
    el('editor').appendChild(editor.element);
    editor.element.addEventListener('input',event => {
      if (event.target.matches('[role="combobox"]')) el('encounter').value = '';
      saveSetup();
    });
    editor.element.addEventListener('change',saveSetup);
    el('encounter').addEventListener('change',() => {
      if (active(store.read()?.fight)) return;
      if (el('encounter').value) editor.set([encounterPreset(el('encounter').value)]);
      saveSetup();
    });
    for (const key of ['die-one','die-two']) el(key).value = 1;
    for (const key of ['dealt','received']) el(key).value = 0;
    el('manual').addEventListener('change',() => render(true));
    el('close').addEventListener('click',close);
    let backdrop = false;
    overlay.addEventListener('mousedown',event => {backdrop = event.target === overlay;});
    overlay.addEventListener('click',event => {if (backdrop && event.target === overlay) close();});
    overlay.addEventListener('keydown',event => {if (event.key === 'Escape' && !event.defaultPrevented) {event.stopPropagation();close();}});
    el('newCharacter').addEventListener('click',() => confirmed('newCharacterConfirm',data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = combat.newCharacter();data.fight = null;data.log = [];
    }));
    el('saveCharacter').addEventListener('click',() => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = character();data.fight = null;
    }));
    el('start').addEventListener('click',() => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = character();data.opponents = editor.snapshot();data.encounter = el('encounter').value;
      updateFight(data,combat.startFight(data.character,editor.read(),{...dice(),encounter:data.encounter ? encounterPreset(data.encounter) : null}));
    }));
    el('attack').addEventListener('click',() => change(data => updateFight(data,combat.playAttack(data.fight,dice()))));
    for (const [key,actor] of [['playerFirst','player'],['enemyFirst','enemy']]) el(key).addEventListener('click',() => change(data => updateFight(data,combat.chooseInitiative(data.fight,actor))));
    el('resolveTie').addEventListener('click',() => change(data => updateFight(data,combat.resolveTie(data.fight,{dealt:numeric('dealt'),received:numeric('received')}))));
    el('abandon').addEventListener('click',() => confirmed('abandonConfirm',data => updateFight(data,combat.abandon(data.fight))));
    const trigger = document.createElement('button');trigger.id = ID + '-btn';trigger.style.display = 'none';trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger);trigger.addEventListener('click',open);
    registerShortcut({button:trigger,overlay,open,close});
  }
  return {init,render,open,close,setVisible(visible) {if (el('btn')) el('btn').style.display = visible ? '' : 'none';if (!visible) {close();shownRun = null;}}};
}

const panel = createEmeraldPanel({document,t,getRun:currentPlaythrough,getBookId:() => currentBookId,saveState,showAlert,showConfirm,getButtonRow:getPlayBtnRow,
  registerShortcut({button,overlay,open,close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:() => button,getOverlay:() => overlay,otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id),open,close});
  }});
export function initSim857() {panel.init();}
export function renderSim857() {panel.render();}
export function setSim857Visible(visible) {panel.setVisible(visible);}
export { initSim857 as init, renderSim857 as render, setSim857Visible as setVisible };
