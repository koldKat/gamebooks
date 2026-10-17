import { definition, ENCOUNTERS, ENEMIES, PRESETS, RACES, encounterPreset } from './definition.js';
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
const fields = ['strength','agility','life','maxLife','damage'];
const checks = ['boulder','shield','godSword','optionalRaces'];
const traits = ['drain','firstHit','fire','gnome','demon'];
const active = fight => Boolean(fight && !fight.outcome);

export function createRampagePanel({document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {}}) {
  const tk = (key, values) => t(definition.i18nPrefix + '.' + key, values);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({currentBookId:getBookId(),currentPlaythrough:getRun,saveState}));
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const number = (key,min,max,label = key) => `<label class="inv-edit-row"><span>${escape(tk(label))}</span><input class="inv-edit-input" type="number" min="${min}" max="${max}" step="1" id="${ID}-${key}" required></label>`;
  const check = (key,label = key) => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(label))}</label>`;
  const select = (key,options) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${options.map(([value,label]) => `<option value="${value}">${escape(label)}</option>`).join('')}</select></label>`;
  let shownRun, editor, editorRun, characterStamp, rendered;
  function close() { el('overlay')?.classList.remove('active'); rendered = null; }
  function change(update) {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) { close(); return; }
    try { if (store.change(update)) render(true); } catch { showAlert(tk('invalid')); }
  }
  function confirmed(key,update) {
    const run = getRun(), before = store.read();
    showConfirm(tk(key),() => { if (getRun() === run && store.read() === before) change(update); });
  }
  function numeric(key) {
    if (!el(key).value.trim()) throw new RangeError('Missing value');
    return Number(el(key).value);
  }
  function readCharacter() {
    return combat.validateCharacter({...store.read().character,
      ...Object.fromEntries(fields.map(key => [key,numeric(key)])),
      ...Object.fromEntries(checks.map(key => [key,el(key).checked])), race:el('race').value, bags:numeric('bags')});
  }
  function manualDie(key) { return el('manual').checked ? numeric(key) : undefined; }
  function updateFight(data,fight) {
    data.fight = fight;
    for (const event of fight.events) data.log.push(tk('event.' + event.kind, {...event,
      result:tk(event.hit ? 'success' : 'failure')}));
  }
  function saveSetup() {
    if (!active(store.read()?.fight)) change(data => {
      data.opponents = editor.snapshot(); data.encounter = el('encounter').value;
      data.traits = Object.fromEntries(traits.map(key => [key,el('trait-' + key).checked]));
    });
  }
  function selectEncounter(preset) {
    el('encounter').value = preset?.id ?? '';
    for (const key of traits) el('trait-' + key).checked = Boolean(preset?.[key]);
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id) { close(); return; }
    const data = store.read();
    if (!data || !force && rendered === data) return;
    rendered = data;
    const fight = data.fight, locked = active(fight), character = data.character;
    if (editorRun !== getRun()) {
      editorRun = getRun(); characterStamp = null;
      el('encounter').value = data.encounter ?? '';
      editor.set(data.opponents ?? [{displayName:tk('customOpponent'),strength:2,damage:1,hp:4}]);
      for (const key of traits) el('trait-' + key).checked = Boolean(data.traits?.[key]);
    }
    editor.lock(locked); editor.fixCount(Boolean(el('encounter').value));
    const stamp = JSON.stringify(character);
    if (characterStamp !== stamp || locked) {
      characterStamp = stamp;
      for (const key of fields) el(key).value = character[key];
      for (const key of checks) el(key).checked = character[key];
      el('race').value = character.race; el('bags').value = character.bags;
    }
    for (const key of [...fields,...checks,'race','bags','preset','encounter','newCharacter','saveCharacter',...traits.map(key => 'trait-' + key)]) el(key).disabled = locked;
    for (const key of ['start','attributeCheck','food','potion','injury','blast']) el(key).disabled = locked || !character.life;
    for (const key of ['round','flee']) el(key).disabled = !locked;
    el('throw').disabled = !locked || Boolean(fight.rounds) || !character.boulder || fight.boulderSpent;
    el('targetRow').hidden = !fight || fight.enemies.length < 2;
    const previous = Number(el('target').value);
    el('target').innerHTML = fight ? fight.enemies.map((enemy,index) => `<option value="${index}" ${enemy.resolved || !enemy.hp ? 'disabled' : ''}>${escape(enemy.name)} · ${enemy.hp}</option>`).join('') : '';
    el('target').value = fight?.enemies[previous] && !fight.enemies[previous].resolved && fight.enemies[previous].hp
      ? String(previous) : String(fight?.enemies.findIndex(enemy => !enemy.resolved && enemy.hp > 0) ?? 0);
    el('target').disabled = !locked;
    el('manualDice').hidden = !el('manual').checked;
    el('die-one').disabled = !el('manual').checked;
    el('die-two').disabled = !el('manual').checked || !locked;
    el('die-shield').disabled = !el('manual').checked || !character.shield;
    el('status').textContent = tk('status.' + (fight?.outcome ?? (fight ? 'active' : 'ready')));
    el('totals').textContent = fight ? tk('totals',{life:character.life,enemies:fight.enemies.map(enemy => enemy.name + ': ' + enemy.hp).join(' · ')}) : '';
    el('destination').textContent = fight?.destination ? tk('destination',{section:fight.destination}) : '';
    el('log').innerHTML = data.log.slice(-80).map(line => '<div>' + escape(line) + '</div>').join('');
    el('history').innerHTML = data.history.slice(-40).reverse().map(row => '<div>' + escape(row.enemy + ': ' + tk('status.' + row.outcome)) + '</div>').join('');
    try { el('cost').textContent = tk('cost',{cost:combat.creationCost(readCharacter())}); } catch { el('cost').textContent = ''; }
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    shownRun = getRun(); editorRun = null;
    try {
      if (!store.read()) store.change(data => {data.character = combat.newCharacter();});
      el('overlay').classList.add('active'); render(true); el('close').focus();
    } catch { close(); showAlert(tk('invalid')); }
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div>${select('preset',PRESETS.map(row => [row.id,row.name]))}${button('newCharacter')}${select('race',RACES.map(race => [race,tk('race.' + race)]))}${fields.map(key => number(key,key === 'maxLife' ? 1 : 0,1000000)).join('')}${select('bags',[[1,'1'],[2,'2']])}${checks.map(key => check(key)).join('')}<p id="${ID}-cost"></p><div class="bsim-btn-row">${button('saveCharacter')}</div></div>${select('encounter',[['',tk('custom')],...ENCOUNTERS.map(row => [row.id,row.displayName])])}<div id="${ID}-editor"></div><details><summary>${escape(tk('enemyTraits'))}</summary>${traits.map(key => check('trait-' + key,'trait.' + key)).join('')}</details><p>${escape(tk('customNote'))}</p><div id="${ID}-targetRow">${select('target',[])}</div><div class="bsim-btn-row">${button('start')}${button('round')}${button('throw')}${button('flee')}</div>${check('manual')}<div id="${ID}-manualDice">${number('die-one',1,6,'die.one')}${number('die-two',1,6,'die.two')}${number('die-shield',1,6,'die.shield')}</div><details><summary>${escape(tk('checksRecovery'))}</summary>${select('attribute',[['strength',tk('strength')],['agility',tk('agility')]])}${number('modifier',-1000000,1000000)}<div class="bsim-btn-row">${button('attributeCheck')}</div>${number('amount',0,1000000)}${check('fireDamage')}<div class="bsim-btn-row">${button('food')}${button('potion')}${button('injury')}${button('blast')}</div></details></div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-totals"></p><p id="${ID}-destination"></p><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({document,id:ID,t,language:'bg',fields:[
      {key:'strength',label:tk('strength'),min:0,max:1000000},
      {key:'damage',label:tk('damage'),min:0,max:1000000},
      {key:'hp',label:tk('life'),min:1,max:1000000},
    ],presets:ENEMIES,onSelect(selected) {
      const preset = editor.snapshot().length === 1
        ? ENCOUNTERS.find(row => row.displayName === selected.displayName) : null;
      selectEncounter(preset);
      saveSetup();
    }});
    el('editor').appendChild(editor.element);
    editor.element.addEventListener('input',event => {
      if (event.target.matches('[role="combobox"]') && el('encounter').value) selectEncounter(null);
    });
    editor.element.addEventListener('input',saveSetup); editor.element.addEventListener('change',saveSetup);
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.style.display = 'none'; trigger.textContent = t('battlesim.title');
    getButtonRow().appendChild(trigger); trigger.addEventListener('click',open);
    for (const key of ['die-one','die-two','die-shield']) el(key).value = 1;
    el('modifier').value = 0; el('amount').value = 1;
    el('manual').addEventListener('change',() => render(true));
    el('encounter').addEventListener('change',() => {
      if (active(store.read()?.fight)) return;
      const preset = el('encounter').value ? encounterPreset(el('encounter').value) : null;
      if (preset) editor.set([preset]);
      selectEncounter(preset);
      saveSetup();
    });
    for (const key of traits) el('trait-' + key).addEventListener('change',saveSetup);
    el('close').addEventListener('click',close);
    let backdrop = false;
    overlay.addEventListener('mousedown',event => {backdrop = event.target === overlay;});
    overlay.addEventListener('click',event => {if (backdrop && event.target === overlay) close();});
    overlay.addEventListener('keydown',event => {if (event.key === 'Escape' && !event.defaultPrevented) {event.stopPropagation();close();}});
    el('newCharacter').addEventListener('click',() => confirmed('newCharacterConfirm',data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = combat.newCharacter(el('preset').value); data.fight = null; data.log = [];
    }));
    el('saveCharacter').addEventListener('click',() => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = readCharacter(); data.fight = null;
    }));
    el('start').addEventListener('click',() => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = readCharacter(); data.opponents = editor.snapshot(); data.encounter = el('encounter').value;
      data.traits = Object.fromEntries(traits.map(key => [key,el('trait-' + key).checked]));
      const preset = data.encounter ? encounterPreset(data.encounter) : null;
      updateFight(data,combat.startFight(data.character,editor.read(),{encounter:preset,traits:data.traits}));
    }));
    el('round').addEventListener('click',() => change(data => updateFight(data,combat.playRound(data.fight,{
      target:numeric('target'),playerDie:manualDie('die-one'),enemyDie:manualDie('die-two'),shieldDie:manualDie('die-shield'),
    }))));
    el('throw').addEventListener('click',() => change(data => updateFight(data,combat.throwBoulder(data.fight,{target:numeric('target'),value:manualDie('die-one')}))));
    el('flee').addEventListener('click',() => confirmed('fleeConfirm',data => updateFight(data,combat.flee(data.fight))));
    el('attributeCheck').addEventListener('click',() => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      data.character = readCharacter(); data.fight = null;
      const result = combat.checkAttribute(data.character,el('attribute').value,manualDie('die-one') ?? combat.rollDie(),numeric('modifier'));
      data.log.push(tk('event.check',{...result,result:tk(result.success ? 'success' : 'failure')}));
    }));
    for (const key of ['food','potion']) el(key).addEventListener('click',() => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      const before = readCharacter();
      data.character = combat.heal(before,key === 'potion' ? before.maxLife : numeric('amount')); data.fight = null;
      data.log.push(tk('event.heal',{restored:data.character.life - before.life,life:data.character.life}));
    }));
    for (const key of ['injury','blast']) el(key).addEventListener('click',() => change(data => {
      if (active(data.fight)) throw new RangeError('Fight active');
      const roll = key === 'blast' ? manualDie('die-one') ?? combat.rollDie() : numeric('amount');
      const result = combat.takeDamage(readCharacter(),roll,{fire:key === 'blast' || el('fireDamage').checked,shieldDie:manualDie('die-shield')});
      data.character = result.character; data.fight = null;
      data.log.push(tk('event.injury',{...result,roll,shield:result.shield ?? '',life:result.character.life}));
    }));
    registerShortcut({button:trigger,overlay,open,close});
  }
  return {init,render,open,close,setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) {close();shownRun = null;}
  }};
}

const panel = createRampagePanel({document,t,getRun:currentPlaythrough,getBookId:() => currentBookId,saveState,
  showAlert,showConfirm,getButtonRow:getPlayBtnRow,registerShortcut({button,overlay,open,close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:() => button,getOverlay:() => overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id),open,close});
  }});
export function initSim856() {panel.init();}
export function renderSim856() {panel.render();}
export function setSim856Visible(visible) {panel.setVisible(visible);}
export { initSim856 as init, renderSim856 as render, setSim856Visible as setVisible };
