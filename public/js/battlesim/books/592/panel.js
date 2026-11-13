// Connect Shadow Chaser encounter controls to the active run and shared panel UI.
import {currentBookId, currentPlaythrough, saveState} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {createQuestState} from '../../engines/super-endless-quest/state.js';
import {createD20Forms} from '../../engines/d20/forms.js';
import {createOpponentEditor} from '../../opponents.js';
import {definition, encounters} from './definition.js';
import {startFight, combatAction, validateFight} from './combat.js';
import {renderReport} from './report.js';

const ui = createD20Forms(document, definition.stateKey, key => t(definition.i18nPrefix + '.' + key));
const store = createQuestState(() => ({run:currentPlaythrough(), bookId:currentBookId, definition, saveState}), {validateFight});
const inputs = new Map(), items = new Map();
let overlay, launch, right, controls, editor, notes, mode, start, custom, cancel, token, mountedRun, mountedOriginal, selected = null;
const close = () => overlay?.classList.remove('active');
const busy = state => state?.fight?.status === 'fighting';
const defaultEnemy = () => ({name:'', hp:3, rounds:4, injury:2});
function change(callback, expected = token) {
  try {
    if (store.update(state => {state.history = state.history.slice(-199); return callback(state);}, expected)) renderSim592();
  } catch {showAlert(ui.tr('invalid'));}
}
function layout() {
  const kind = selected?.mode ?? mode.value;
  mode.value = kind;
  for (const [key, field] of inputs) field.parentElement.hidden =
    (key === 'skill' || key === 'arrows') ? kind !== 'archery' : key === 'remaining' ? kind !== 'wowl' : key === 'captured' ? !selected?.rules.removableFromEnd : key === 'modifier' || key === 'armor' ? kind !== 'combat' : false;
  for (const field of items.values()) field.parentElement.hidden = kind !== 'combat';
  editor.element.hidden = kind === 'wowl';
  for (const field of editor.element.querySelectorAll('[data-stat]')) field.parentElement.hidden = kind === 'archery';
  editor.fixCount(Boolean(selected));
  notes.textContent = selected?.sourceNotes.join(' ') || ui.tr('customNotes');
}
function choose(entry) {
  if (busy(store.snapshot()?.state)) return;
  selected = entry; mode.value = entry.mode;
  editor.set(entry.profiles.map(row => ({...row, displayName:row.name})));
  if (entry.mode === 'archery') inputs.get('arrows').value = entry.rules.arrows;
  layout();
}
function fightControls(fight, expected) {
  const send = (kind, values = {}) => change(state => {
    state.fight = combatAction(state.fight, {kind, expectedRevision:fight.revision, ...values}); return state;
  }, expected);
  if (fight.mode === 'wowl') {ui.button(controls, 'defend', () => send('defend')); return;}
  const enemies = fight.mode === 'combat' ? fight.core.enemies : fight.targets;
  const target = ui.field(controls, 'target', {entries:enemies.flatMap((enemy, index) => enemy.hp ? [[String(index), (index + 1) + '. ' + enemy.name]] : [])});
  if (fight.mode === 'archery') ui.button(controls, 'shoot', () => send('shoot', {target:Number(target.value)}));
  else for (const threshold of [7, 9, 11]) ui.button(controls, 'attack.' + threshold,
    () => send('attack', {target:Number(target.value), attack:threshold}));
}
export function renderSim592() {
  if (!overlay) return;
  const snapshot = store.snapshot();
  if (!snapshot) {token = null; mountedRun = mountedOriginal = null; controls.replaceChildren(); right.replaceChildren(); close(); return;}
  if (mountedRun !== snapshot.run || mountedOriginal !== snapshot.original) {
    const saved = snapshot.state, setup = saved.setup ?? {};
    for (const [key, input] of inputs) input.value = key === 'hp' ? (saved.player?.hp ?? 12) : (setup[key] ?? {modifier:0, armor:'none', skill:3, arrows:10, remaining:3, captured:0}[key]);
    for (const [key, input] of items) input.checked = setup.equipment?.[key] ?? ['flynt','staff'].includes(key);
    const encounter = setup.encounter ?? saved.fight?.encounter;
    selected = encounters.find(entry => entry.key === encounter?.key) ?? null;
    mode.value = encounter?.mode ?? 'combat';
    editor.set((encounter?.profiles?.length ? encounter.profiles : [defaultEnemy()]).map(row => ({...row, displayName:row.name})));
    layout(); mountedRun = snapshot.run; mountedOriginal = snapshot.original;
  }
  token = snapshot;
  const locked = busy(snapshot.state);
  for (const input of [...inputs.values(), ...items.values(), mode]) input.disabled = locked;
  editor.lock(locked); start.disabled = custom.disabled = locked; cancel.disabled = !locked;
  controls.replaceChildren(); if (locked) fightControls(snapshot.state.fight, snapshot);
  renderReport(right, snapshot.state, ui);
}
export function initSim592() {
  if (overlay) return;
  overlay = document.createElement('div'); overlay.id = 'sim592-overlay'; overlay.className = 'inv-overlay';
  overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
  overlay.querySelector('.inv-modal-title').textContent = ui.tr('title');
  const closer = overlay.querySelector('.inv-close-btn'); closer.setAttribute('aria-label', t('btn.close')); closer.addEventListener('click', close);
  const left = overlay.querySelector('.bsim-col-left'); right = overlay.querySelector('.bsim-col-right'); ui.text(left, ui.tr('rules'));
  mode = ui.field(left, 'mode', {entries:['combat','archery','wowl'].map(key => [key, ui.tr('mode.' + key)])});
  mode.addEventListener('change', () => {if (busy(store.snapshot()?.state)) return; selected = null; editor.set([defaultEnemy()]); layout();});
  inputs.set('hp', ui.field(left, 'hp', {type:'number', value:12, min:1, max:12}));
  inputs.set('modifier', ui.field(left, 'modifier', {type:'number', value:0, min:-100, max:100}));
  inputs.set('armor', ui.field(left, 'armor', {entries:['none','leather','chainmail'].map(key => [key, ui.tr('armor.' + key)])}));
  inputs.set('skill', ui.field(left, 'skill', {type:'number', value:3, max:100}));
  inputs.set('arrows', ui.field(left, 'arrows', {type:'number', value:10, min:1, max:100}));
  inputs.set('remaining', ui.field(left, 'remaining', {type:'number', value:3, min:1, max:3}));
  inputs.set('captured', ui.field(left, 'captured', {type:'number', value:0, min:0, max:5}));
  for (const key of ['goldRing','flynt','staff','bracelet']) items.set(key, ui.checkbox(left, 'item.' + key, ['flynt','staff'].includes(key)));
  editor = createOpponentEditor({document, id:'sim592', t,
    fields:[{key:'hp', label:ui.tr('cp'), min:1, max:10000}, {key:'rounds', label:ui.tr('roundLimit'), min:1, max:10000},
      {key:'injury', label:ui.tr('injury'), min:0, max:10000}],
    presets:encounters.map(entry => ({...(entry.profiles[0] ?? defaultEnemy()), displayName:entry.name + ' (§' + entry.section + ')', entry})),
    isStatUnavailable:() => mode.value === 'archery', onSelect:preset => choose(preset.entry)});
  left.append(editor.element); notes = ui.text(left, ui.tr('customNotes'));
  custom = ui.button(left, 'custom', () => {if (busy(store.snapshot()?.state)) return; selected = null; mode.value = 'combat'; editor.set([defaultEnemy()]); layout();});
  start = ui.button(left, 'start', () => change(state => {
    if (busy(state)) return null;
    const kind = selected?.mode ?? mode.value;
    let profiles = kind === 'wowl' ? [] : editor.read().map(row => ({name:row.displayName || ui.tr('enemy'),
      hp:kind === 'archery' ? 2 : row.hp, rounds:kind === 'archery' ? 1 : row.rounds, injury:kind === 'archery' ? 0 : row.injury}));
    const encounter = {...(selected ?? {}), mode:kind, name:selected?.name ?? (kind === 'wowl' ? ui.tr('mode.wowl') : profiles.map(row => row.name).join(', ')), profiles,
      rules:selected?.rules ?? (kind === 'archery' ? {arrows:ui.number(inputs.get('arrows')), skillThreshold:5} : {})};
    const setup = {encounter:structuredClone(encounter), equipment:Object.fromEntries([...items].map(([key, input]) => [key, input.checked]))};
    for (const [key, input] of inputs) setup[key] = key === 'armor' ? input.value : ui.number(input);
    setup.equipment.armor = setup.armor;
    if (selected?.rules.removableFromEnd) profiles = profiles.slice(0, profiles.length - setup.captured);
    encounter.profiles = profiles;
    state.fight = startFight({hp:setup.hp}, encounter, setup); state.setup = setup; return state;
  }));
  controls = document.createElement('div'); controls.id = 'sim592-controls'; left.append(controls);
  cancel = ui.button(left, 'cancel', () => {
    const expected = token; if (!busy(expected?.state)) return;
    showConfirm(ui.tr('cancelConfirm'), () => change(state => {state.fight = null; return state;}, expected));
  });
  document.body.append(overlay); launch = document.createElement('button'); launch.id = 'sim592-btn'; launch.style.display = 'none';
  launch.innerHTML = shortcutLabel(t('battlesim.title')); launch.setAttribute('aria-keyshortcuts', 'S'); getPlayBtnRow().append(launch);
  launch.addEventListener('click', () => {if (!store.snapshot()) {showAlert(t('battlesim.no_active_playthrough')); return;} renderSim592(); overlay.classList.add('active');});
  registerPanelShortcut('KeyS', {getButton:() => launch, getOverlay:() => overlay,
    otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open:() => launch.click(), close});
  let backdrop = false;
  overlay.addEventListener('mousedown', event => {backdrop = event.target === overlay;});
  overlay.addEventListener('click', event => {if (backdrop && event.target === overlay) close();});
  overlay.addEventListener('keydown', event => {if (event.key === 'Escape') {event.stopPropagation(); close();}});
}
export function setSim592Visible(value) {if (launch) launch.style.display = value ? '' : 'none'; if (!value) close();}
export {initSim592 as init, renderSim592 as render, setSim592Visible as setVisible};
