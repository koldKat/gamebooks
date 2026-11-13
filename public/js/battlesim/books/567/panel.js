// Connect the Craven Manor combat tool to the current run and shared simulator controls.
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
const inputs = new Map(), abilityKeys = ['absorber', 'reducer', 'forward', 'freeze', 'secondSelf'];
let overlay, launch, left, right, controls, editor, notes, pair, rounds, enemyBonus, start, custom,
  cancel, token, mountedRun, mountedOriginal, selected = null;
const close = () => overlay?.classList.remove('active');
const busy = state => state?.fight?.status === 'fighting';
function change(callback, expected = token) {
  try {
    if (store.update(state => {state.history = state.history.slice(-199); return callback(state);}, expected)) renderSim567();
  } catch {showAlert(ui.tr('invalid'));}
}
function presetLayout() {
  pair.checked = Boolean(selected?.rules.pair ?? pair.checked);
  pair.disabled = rounds.disabled = enemyBonus.disabled = Boolean(selected);
  notes.textContent = selected?.sourceNotes?.join(' ') || ui.tr('customNotes');
  editor.fixCount(true);
}
function setPreset(entry) {
  selected = entry; pair.checked = Boolean(entry.rules.pair);
  rounds.value = entry.rounds; enemyBonus.value = entry.rules.enemyBonus ?? 0;
  editor.set(entry.profiles.map(row => ({...row, displayName:row.name}))); presetLayout();
}
function manualPair(parent, label, key) {
  const group = ui.group(parent, label), pair = [
    ui.field(group, 'die1', {type:'number', min:1, max:6, optional:true}),
    ui.field(group, 'die2', {type:'number', min:1, max:6, optional:true}),
  ];
  return () => pair.every(input => !input.value.trim()) ? {} : {[key]:pair.map(input => ui.number(input))};
}
function combatControls(fight, expected) {
  const send = (kind, options = {}) => change(state => {
    state.fight = combatAction(state.fight, {kind, expectedRevision:fight.revision,
      ...(typeof options === 'function' ? options() : options)}); return state;
  }, expected);
  if (fight.result) {
    ui.text(controls, ui.tr('reviewResult'));
    ui.button(controls, 'finish', () => send('finish'));
  } else if (fight.pending) {
    const boost = ui.field(controls, fight.opponent.rules.boxing ? 'lowerEnemy' : 'boost', {type:'number', value:0, min:0, max:Math.min(2, fight.player.ttp)});
    const secondBoost = fight.pending.player2 && !fight.opponent.rules.boxing
      ? ui.field(controls, 'secondBoost', {type:'number', value:0, min:0, max:Math.min(2, fight.player.ttp)}) : null;
    const raw = fight.pending.player, special = raw && (raw[0] === raw[1] || raw[0] + raw[1] > 10);
    if (fight.opponent.rules.gunfight) boost.disabled = !fight.pending.dodge;
    const resolve = choice => send('resolve', () => ({choice, boost:boost.disabled ? 0 : ui.number(boost), secondBoost:secondBoost ? ui.number(secondBoost) : 0}));
    if (special && fight.opponent.rules.disarm) {
      boost.disabled = true; if (secondBoost) secondBoost.disabled = true;
      const disarm = manualPair(controls, 'disarmDice', 'disarm');
      ui.button(controls, 'doubleHit', () => send('resolve', {choice:'hit'}));
      ui.button(controls, 'disarm', () => send('resolve', () => ({choice:'disarm', dice:disarm()})));
    } else {
      ui.button(controls, 'resolve', () => resolve());
      if (special && fight.opponent.rules.escape) ui.button(controls, 'escape', () => send('resolve', {choice:'escape'}));
    }
  } else {
    const manual = ui.group(controls, 'manualDice'), readers = [];
    if (fight.opponent.rules.gunfight) {
      readers.push(manualPair(manual, 'shotDice', 'shot'));
      if (fight.gun.phase === 'enemy') readers.push(manualPair(manual, 'dodgeDice', 'dodge'));
    } else {
      readers.push(manualPair(manual, 'playerDice', 'player'), manualPair(manual, 'enemyDice', 'enemy'));
      if (fight.cloneLeft && fight.enemies === 1) readers.push(manualPair(manual, 'cloneDice', 'player2'));
      if (fight.enemies === 2 && !fight.cloneLeft) readers.push(manualPair(manual, 'secondEnemyDice', 'enemy2'));
    }
    ui.text(manual, ui.tr('diceHelp'));
    ui.button(controls, 'roll', () => send('roll', () => ({dice:Object.assign({}, ...readers.map(read => read()))})));
    if (!fight.opponent.rules.gunfight) {
      for (const ability of ['freeze', 'secondSelf']) {
        const button = ui.button(controls, ability, () => send(ability));
        button.disabled = !fight.player[ability] || fight.used[ability];
      }
      const forward = ui.group(controls, 'forward');
      const die = ui.field(forward, 'forwardDie', {type:'number', min:1, max:6, optional:true});
      const button = ui.button(forward, 'useForward', () => send('forward', () => ({die:ui.number(die, true)})));
      button.disabled = !fight.player.forward || fight.used.forward;
    }
  }
  const rewinds = ui.group(controls, 'rewinds');
  for (const [scope, cost] of [['roll', 2], ['row', 5], ['fight', 8]]) {
    const price = fight.player.reducer ? 1 : cost;
    const button = ui.button(rewinds, 'rewind.' + scope, () => send('rewind', {scope}));
    button.textContent += ' (' + price + ')';
    button.disabled = !fight.checkpoints[scope] || fight.player.ttp < price || scope === 'row' && fight.opponent.rules.gunfight;
  }
}
export function renderSim567() {
  if (!overlay) return;
  const snapshot = store.snapshot();
  if (!snapshot) {token = null; mountedRun = mountedOriginal = null; controls.replaceChildren(); right.replaceChildren(); close(); return;}
  if (mountedRun !== snapshot.run || mountedOriginal !== snapshot.original) {
    for (const [key, input] of inputs) {
      const value = snapshot.state.player?.[key];
      if (input.type === 'checkbox') input.checked = Boolean(value); else input.value = value ?? 10;
    }
    const saved = snapshot.state.opponent;
    selected = encounters.find(entry => entry.key === saved?.key) ?? null;
    rounds.value = saved?.rounds ?? 12; enemyBonus.value = saved?.rules.enemyBonus ?? 0;
    pair.checked = Boolean(saved?.rules.pair);
    editor.set((saved?.profiles ?? [{name:''}]).map(row => ({...row, displayName:row.name})));
    presetLayout(); mountedRun = snapshot.run; mountedOriginal = snapshot.original;
  }
  token = snapshot;
  const locked = busy(snapshot.state);
  for (const input of inputs.values()) input.disabled = locked;
  pair.disabled = rounds.disabled = enemyBonus.disabled = locked || Boolean(selected);
  editor.lock(locked); start.disabled = custom.disabled = locked; cancel.disabled = !locked;
  controls.replaceChildren(); if (locked) combatControls(snapshot.state.fight, snapshot);
  renderReport(right, snapshot.state, ui);
}
export function initSim567() {
  if (overlay) return;
  overlay = document.createElement('div'); overlay.id = 'sim567-overlay'; overlay.className = 'inv-overlay';
  overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
  overlay.querySelector('.inv-modal-title').textContent = ui.tr('title');
  const closer = overlay.querySelector('.inv-close-btn'); closer.setAttribute('aria-label', t('btn.close')); closer.addEventListener('click', close);
  left = overlay.querySelector('.bsim-col-left'); right = overlay.querySelector('.bsim-col-right'); ui.text(left, ui.tr('rules'));
  for (const key of ['ttp', 'maxTtp']) inputs.set(key, ui.field(left, key, {type:'number', value:10, min:key === 'maxTtp' ? 1 : 0}));
  const abilities = ui.group(left, 'abilities');
  for (const key of abilityKeys) inputs.set(key, ui.checkbox(abilities, key));
  editor = createOpponentEditor({document, id:'sim567', t, fields:[],
    presets:encounters.map(entry => ({displayName:entry.name + ' (§' + entry.section + ')', entry})),
    onSelect:preset => setPreset(preset.entry)});
  left.append(editor.element); editor.fixCount(true);
  pair = ui.checkbox(left, 'pair');
  pair.addEventListener('change', () => {if (!selected && !busy(token?.state)) editor.set(pair.checked ? [{name:''}, {name:''}] : [{name:''}]);});
  rounds = ui.field(left, 'rounds', {type:'number', value:12, min:6, max:120}); rounds.step = '6';
  enemyBonus = ui.field(left, 'enemyBonus', {type:'number', value:0, min:-100, max:100});
  notes = ui.text(left, ui.tr('customNotes'));
  custom = ui.button(left, 'custom', () => {
    if (busy(token?.state)) return;
    selected = null; pair.checked = false; rounds.value = 12; enemyBonus.value = 0; editor.set([{name:''}]); presetLayout();
  });
  start = ui.button(left, 'start', () => change(state => {
    if (busy(state)) return null;
    const player = Object.fromEntries([...inputs].map(([key, input]) => [key, input.type === 'checkbox' ? input.checked : ui.number(input)]));
    const profiles = editor.read().map(row => ({name:row.displayName || ui.tr('opponent')}));
    const encounter = selected ? {...selected, profiles} : {name:profiles.map(row => row.name).join(', '), rounds:ui.number(rounds), profiles,
      rules:{pair:pair.checked, enemyBonus:ui.number(enemyBonus)}};
    state.fight = startFight(player, encounter); return state;
  }));
  controls = document.createElement('div'); controls.id = 'sim567-controls'; left.append(controls);
  cancel = ui.button(left, 'cancel', () => {
    const expected = token;
    if (!busy(expected?.state)) return;
    showConfirm(ui.tr('cancelConfirm'), () => change(state => {state.fight = combatAction(state.fight,
      {kind:'cancel', expectedRevision:state.fight.revision}); return state;}, expected));
  });
  document.body.append(overlay); launch = document.createElement('button'); launch.id = 'sim567-btn'; launch.style.display = 'none';
  launch.innerHTML = shortcutLabel(t('battlesim.title')); launch.setAttribute('aria-keyshortcuts', 'S'); getPlayBtnRow().append(launch);
  launch.addEventListener('click', () => {if (!store.snapshot()) {showAlert(t('battlesim.no_active_playthrough')); return;} renderSim567(); overlay.classList.add('active');});
  registerPanelShortcut('KeyS', {getButton:() => launch, getOverlay:() => overlay,
    otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open:() => launch.click(), close});
  let backdrop = false;
  overlay.addEventListener('mousedown', event => {backdrop = event.target === overlay;});
  overlay.addEventListener('click', event => {if (backdrop && event.target === overlay) close();});
  overlay.addEventListener('keydown', event => {if (event.key === 'Escape') {event.stopPropagation(); close();}});
}
export function setSim567Visible(value) {if (launch) launch.style.display = value ? '' : 'none'; if (!value) close();}
export {initSim567 as init, renderSim567 as render, setSim567Visible as setVisible};
