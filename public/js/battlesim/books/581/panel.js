// Connect the encounter-only Savage Realms controls to the active book run.
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
const powers = ['blade', 'deathbringer', 'fire', 'mirror', 'shield', 'horn', 'poison', 'resurrection'];
const player = new Map(), companion = new Map(), quantities = new Map();
let overlay, launch, left, right, controls, editor, notes, count, start, custom, cancel, withCompanion, bonus,
  token, mountedRun, mountedOriginal, selected = null;
const close = () => overlay?.classList.remove('active');
const busy = state => state?.fight?.status === 'fighting';
function change(callback, expected = token) {
  try {
    if (store.update(state => {state.history = state.history.slice(-199); return callback(state);}, expected)) renderSim581();
  } catch {showAlert(ui.tr('invalid'));}
}
function layout() {
  const limits = selected?.rules.variableCount;
  count.parentElement.hidden = !limits;
  if (limits) {count.min = limits.min; count.max = limits.max;}
  notes.textContent = selected?.sourceNotes?.join(' ') || ui.tr('customNotes');
  editor.fixCount(Boolean(selected));
}
const profilesForEditor = profiles => profiles.map(profile => ({...profile, displayName:profile.name,
  undead:profile.undead ? 'yes' : 'no', stopHp:profile.stopHp ?? 0}));
function choose(entry) {
  if (busy(store.snapshot()?.state)) return;
  selected = entry; editor.set(profilesForEditor(entry.profiles));
  if (entry.rules.variableCount) count.value = entry.rules.variableCount.min;
  if (entry.companionSuggestion) {
    withCompanion.checked = true;
    for (const [key, input] of companion) input.value = entry.companionSuggestion[key] ?? entry.companionSuggestion.hp;
  }
  layout();
}
const optionalDie = (parent, key) => ui.field(parent, key, {type:'number', min:1, max:6, optional:true});
function fightControls(fight, expected) {
  const send = (kind, read = () => ({})) => change(state => {
    state.fight = combatAction(state.fight, {kind, expectedRevision:fight.revision, ...read()}); return state;
  }, expected);
  if (fight.result) {
    ui.text(controls, ui.tr('reviewResult')); ui.button(controls, 'finish', () => send('finish'));
    if (fight.result === 'loss' && fight.powers.resurrection) {
      const hp = ui.field(controls, 'reviveHp', {type:'number', min:1, max:fight.player.maxHp, optional:true});
      ui.button(controls, 'resurrect', () => send('resurrect', () => ({hp:ui.number(hp)})));
    }
    return;
  }
  if (fight.pending) {
    if (fight.pending.companion != null) {
      ui.text(controls, ui.tr('alliedHelp'));
      const rows = [];
      for (const who of ['player', 'companion', 'enemy']) {
        const group = ui.group(controls, 'allocation.' + who, true), hit = ui.checkbox(group, 'hit.' + who);
        const die = optionalDie(group, 'damageDie');
        const target = who === 'enemy' ? ui.field(group, 'target', {entries:[['player', ui.tr('player')], ['companion', ui.tr('companion')]]}) : null;
        rows.push({who, hit, die, target});
      }
      ui.button(controls, 'resolve', () => send('resolve', () => ({hits:rows.filter(row => row.hit.checked)
        .map(row => ({who:row.who, target:row.target?.value ?? 'enemy', die:ui.number(row.die, true)}))})));
    } else {
      const die = optionalDie(controls, 'damageDie');
      ui.button(controls, 'resolve', () => send('resolve', () => ({die:ui.number(die, true)})));
    }
    return;
  }
  const manual = ui.group(controls, 'manualDice'), dice = new Map();
  for (const who of ['player', 'enemy', ...(fight.companion?.hp ? ['companion'] : [])]) dice.set(who, optionalDie(manual, 'die.' + who));
  ui.text(manual, ui.tr('diceHelp'));
  ui.button(controls, 'roll', () => send('roll', () => ({dice:Object.fromEntries([...dice].map(([who, input]) => [who, ui.number(input, true)]))})));
  for (const power of powers.filter(key => key !== 'resurrection' && fight.powers[key])) {
    const button = ui.button(controls, 'power.' + power, () => send('power', () => ({power})));
    button.dataset.action = 'power-' + power;
  }
}
export function renderSim581() {
  if (!overlay) return;
  const snapshot = store.snapshot();
  if (!snapshot) {token = null; mountedRun = mountedOriginal = null; controls.replaceChildren(); right.replaceChildren(); close(); return;}
  if (mountedRun !== snapshot.run || mountedOriginal !== snapshot.original) {
    const saved = snapshot.state, hero = saved.player ?? {hp:25, maxHp:25, skill:3};
    for (const [key, input] of player) input.value = hero[key] ?? 0;
    const ally = saved.fight?.companion;
    withCompanion.checked = Boolean(ally);
    for (const [key, input] of companion) input.value = ally?.[key] ?? ({name:'', hp:25, maxHp:25, skill:3, diceModifier:0})[key];
    for (const [key, input] of quantities) input.value = saved.fight?.powers[key] ?? 0;
    bonus.value = saved.fight?.status === 'fighting' ? saved.fight.playerBonus : 0;
    selected = encounters.find(entry => entry.key === saved.opponent?.key) ?? null;
    editor.set(profilesForEditor(saved.opponent?.profiles ?? [{name:'', hp:25, skill:3}]));
    count.value = saved.fight?.enemies.length ?? selected?.rules.variableCount?.min ?? 2;
    layout(); mountedRun = snapshot.run; mountedOriginal = snapshot.original;
  }
  token = snapshot;
  const locked = busy(snapshot.state);
  for (const input of [...player.values(), ...companion.values(), ...quantities.values(), withCompanion, bonus, count]) input.disabled = locked;
  editor.lock(locked); start.disabled = custom.disabled = locked; cancel.disabled = !locked;
  controls.replaceChildren(); if (locked) fightControls(snapshot.state.fight, snapshot);
  renderReport(right, snapshot.state, ui);
}
export function initSim581() {
  if (overlay) return;
  overlay = document.createElement('div'); overlay.id = 'sim581-overlay'; overlay.className = 'inv-overlay';
  overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
  overlay.querySelector('.inv-modal-title').textContent = ui.tr('title');
  const closer = overlay.querySelector('.inv-close-btn'); closer.setAttribute('aria-label', t('btn.close')); closer.addEventListener('click', close);
  left = overlay.querySelector('.bsim-col-left'); right = overlay.querySelector('.bsim-col-right'); ui.text(left, ui.tr('rules'));
  for (const [key, value] of [['hp',25], ['maxHp',25], ['skill',3]]) player.set(key, ui.field(left, key, {type:'number', value, min:key === 'maxHp' ? 1 : 0}));
  bonus = ui.field(left, 'bonus', {entries:[['0', ui.tr('noBonus')], ['1', ui.tr('potionBonus')]]});
  const allies = ui.group(left, 'companionSetup'); withCompanion = ui.checkbox(allies, 'useCompanion');
  companion.set('name', ui.field(allies, 'companionName'));
  for (const [key, value] of [['hp',25], ['maxHp',25], ['skill',3], ['diceModifier',0]]) companion.set(key,
    ui.field(allies, 'companion.' + key, {type:'number', value, min:key === 'diceModifier' ? -6 : key === 'maxHp' ? 1 : 0, max:key === 'diceModifier' ? 6 : 10000}));
  const equipment = ui.group(left, 'availablePowers'); ui.text(equipment, ui.tr('powersHelp'));
  for (const key of powers) quantities.set(key, ui.field(equipment, 'power.' + key, {type:'number', value:0, max:99}));
  editor = createOpponentEditor({document, id:'sim581', t,
    fields:[{key:'hp', label:ui.tr('hp'), min:1, max:10000}, {key:'skill', label:ui.tr('skill'), min:0, max:1000},
      {key:'stopHp', label:ui.tr('stopHp'), min:0, max:9999}, {key:'undead', label:ui.tr('undead'), options:[{value:'no', label:ui.tr('no')}, {value:'yes', label:ui.tr('yes')}]}],
    presets:encounters.map(entry => ({...entry.profiles[0], undead:entry.profiles[0].undead ? 'yes' : 'no',
      displayName:entry.name + ' (§' + entry.section + (entry.tableRoll ? ', ' + entry.tableRoll : '') + ')', entry})),
    onSelect:preset => choose(preset.entry)});
  left.append(editor.element); count = ui.field(left, 'count', {type:'number', value:2, min:2, max:6});
  notes = ui.text(left, ui.tr('customNotes'));
  custom = ui.button(left, 'custom', () => {
    if (busy(store.snapshot()?.state)) return;
    selected = null; editor.set(profilesForEditor([{name:'', hp:25, skill:3}])); layout();
  });
  start = ui.button(left, 'start', () => change(state => {
    if (busy(state)) return null;
    const hero = Object.fromEntries([...player].map(([key, input]) => [key, ui.number(input)]));
    const profiles = editor.read().map(row => ({name:row.displayName || ui.tr('enemy'), hp:row.hp, skill:row.skill,
      stopHp:row.stopHp, undead:row.undead === 'yes'}));
    const encounter = {...(selected ?? {}), name:selected?.name ?? profiles.map(row => row.name).join(', '), profiles};
    const ally = withCompanion.checked ? Object.fromEntries([...companion].map(([key, input]) => [key, key === 'name' ? input.value : ui.number(input)])) : null;
    state.fight = startFight(hero, encounter, {companion:ally, playerBonus:ui.number(bonus),
      ...(selected?.rules.variableCount ? {count:ui.number(count)} : {}),
      powers:Object.fromEntries([...quantities].map(([key, input]) => [key, ui.number(input)]))});
    return state;
  }));
  controls = document.createElement('div'); controls.id = 'sim581-controls'; left.append(controls);
  cancel = ui.button(left, 'cancel', () => {
    const expected = token;
    if (!busy(expected?.state)) return;
    showConfirm(ui.tr('cancelConfirm'), () => change(state => {state.fight = combatAction(state.fight,
      {kind:'cancel', expectedRevision:state.fight.revision}); return state;}, expected));
  });
  document.body.append(overlay); launch = document.createElement('button'); launch.id = 'sim581-btn'; launch.style.display = 'none';
  launch.innerHTML = shortcutLabel(t('battlesim.title')); launch.setAttribute('aria-keyshortcuts', 'S'); getPlayBtnRow().append(launch);
  launch.addEventListener('click', () => {if (!store.snapshot()) {showAlert(t('battlesim.no_active_playthrough')); return;} renderSim581(); overlay.classList.add('active');});
  registerPanelShortcut('KeyS', {getButton:() => launch, getOverlay:() => overlay,
    otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open:() => launch.click(), close});
  let backdrop = false;
  overlay.addEventListener('mousedown', event => {backdrop = event.target === overlay;});
  overlay.addEventListener('click', event => {if (backdrop && event.target === overlay) close();});
  overlay.addEventListener('keydown', event => {if (event.key === 'Escape') {event.stopPropagation(); close();}});
}
export function setSim581Visible(value) {if (launch) launch.style.display = value ? '' : 'none'; if (!value) close();}
export {initSim581 as init, renderSim581 as render, setSim581Visible as setVisible};
