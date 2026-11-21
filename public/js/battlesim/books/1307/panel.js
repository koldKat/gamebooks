// Connect Mochila's combat setup, saved fights and logs to the active playthrough.
import {definition, encounters, loadRoster} from './definition.js';
import {startFight, playCombatAction, canReroll, validateFight} from './combat.js';
import {psychicHeal} from './effects.js';
import {createQuestState} from '../../engines/super-endless-quest/state.js';
import {createD20Forms} from '../../engines/d20/forms.js';
import {createOpponentEditor} from '../../opponents.js';
import {createThemedSelect} from '../../../ui-helpers/themed-select.js';
import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../run-context.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {decorateOutcome} from '../../outcome.js';

const defaults = {hp:15, hpInitial:15, attackMin:9, ammo:6, silverAmmo:0, reserve:2, weapon:'gun', fanning:false,
  marksman:false, necklace:false, bandana:false, bandanaUsed:false, powers:0, psychicHealing:false};
const enemyDefaults = {displayName:'', low:2, high:4, low2:7, high2:9, damage:4, hp:10};
export function createMochilaPanel(getContext, document) {
  const ctx = () => getContext(), id = definition.stateKey;
  const ui = createD20Forms(document, id, key => ctx().t('battlesim1307.' + key));
  const store = createQuestState(() => ({...ctx(), definition}), {validateFight});
  const inputs = new Map(), menus = [];
  let overlay, launch, right, controls, editor, notes, start, custom, reload, heal, token, mountedRun, mountedOriginal, selected = null, previewingSetup = false;
  const busy = () => token?.state.fight?.status === 'fighting';
  const close = () => {menus.forEach(menu => menu.close()); overlay?.classList.remove('active');};
  function presetRow(entry) {
    const ranges = entry.range.split(',').map(part => part.trim().split(/[-–]/).map(Number));
    return {...entry, displayName:entry.name, low:ranges[0][0], high:ranges[0][1] ?? ranges[0][0],
      low2:ranges[1]?.[0] ?? 0, high2:ranges[1]?.[1] ?? ranges[1]?.[0] ?? 0};
  }
  function choose(entry) {
    if (busy()) return;
    selected = entry; editor.set([entry ? presetRow(entry) : enemyDefaults]);
    previewingSetup = true; showOpponentLife(null);
    notes.textContent = entry?.note ?? ui.tr('customNotes');
  }
  function showOpponentLife(fight) {
    const input = editor.element.querySelector('[data-stat="hp"]');
    if (!input) return;
    let output = input.parentElement.querySelector('[data-live-hp]');
    if (!output) {
      output = document.createElement('output'); output.className = 'inv-edit-input';
      output.dataset.liveHp = ''; output.setAttribute('aria-live', 'polite'); input.after(output);
    }
    input.hidden = Boolean(fight); output.hidden = !fight;
    output.value = fight ? String(fight.opponent.hp) : '';
  }
  function change(callback, expected = token) {
    try {
      if (store.update(state => {state.history = state.history.slice(-199); return callback(state);}, expected)) render();
    } catch {ctx().showAlert(ui.tr('invalid'));}
  }
  function playerInput() {
    return Object.fromEntries([...inputs].map(([key, input]) => [key,
      input.type === 'checkbox' ? input.checked : input.tagName === 'SELECT' ? input.value : ui.number(input)]));
  }
  function saveIdlePlayer(state, player) {
    player.bandanaUsed = Boolean(player.bandanaUsed || state.player?.bandanaUsed || state.fight?.player.bandanaUsed);
    state.player = player;
    // Keep the previous battle log and its recorded outcome while retaining
    // post-battle recovery when the shared state layer copies combat stats.
    if (state.fight) state.fight.player = structuredClone(player);
    return state;
  }
  function syncHealing() {
    heal.disabled = busy() || !inputs.get('psychicHealing').checked || Number(inputs.get('powers').value) < 1
      || Number(inputs.get('hp').value) >= Number(inputs.get('hpInitial').value);
  }
  function render() {
    if (!overlay) return;
    const snap = store.snapshot();
    if (!snap) {token = null; close(); return;}
    const saved = snap.state, fight = saved.fight;
    if (mountedRun !== snap.run || mountedOriginal !== snap.original) {
      previewingSetup = false;
      const player = {...defaults, ...saved.player};
      for (const [key, input] of inputs) {
        if (input.type === 'checkbox') input.checked = Boolean(player[key]); else input.value = player[key];
      }
      selected = encounters.find(entry => entry.key === saved.setup?.key) ?? null;
      editor.set(saved.setup?.opponents ?? [selected ? presetRow(selected) : enemyDefaults]);
      notes.textContent = selected?.note ?? ui.tr('customNotes');
      mountedRun = snap.run; mountedOriginal = snap.original;
    }
    token = snap;
    const locked = busy();
    for (const input of inputs.values()) input.disabled = locked;
    const weaponInput = inputs.get('weapon');
    if (locked) {
      weaponInput.value = fight.player.weapon;
      weaponInput.disabled = !['attack', 'fan'].includes(fight.phase) || fight.opponent.knifeOnly;
    }
    for (const option of weaponInput.options) {
      option.disabled = Boolean(locked && option.value !== 'knife'
        && (fight.opponent.knifeOnly || !(option.value === 'silverGun' ? fight.player.silverAmmo : fight.player.ammo)));
    }
    editor.lock(locked); editor.fixCount(true);
    showOpponentLife(previewingSetup ? null : fight);
    start.disabled = custom.disabled = reload.disabled = locked;
    reload.disabled ||= inputs.get('weapon').value === 'silverGun';
    syncHealing();
    controls.replaceChildren(); right.replaceChildren();
    const status = ui.text(right, ui.tr('status.' + (fight?.status ?? 'ready')));
    status.className = 'bsim-status'; decorateOutcome(status, fight?.status);
    if (fight) {
      ui.text(right, ui.tr('round') + ': ' + fight.round);
      ui.text(right, fight.opponent.name + ': ' + fight.opponent.hp + ' · ' + ui.tr('hp') + ': ' + fight.player.hp);
      ui.text(right, ui.tr('weapon') + ': ' + ui.tr(fight.player.weapon));
      ui.text(right, ui.tr('ammo') + ': ' + fight.player.ammo + ' · ' + ui.tr('silverAmmo') + ': ' + (fight.player.silverAmmo ?? 0));
      if (fight.opponent.ammo != null) ui.text(right, ui.tr('enemyAmmo') + ': ' + fight.opponent.ammo);
      for (const line of fight.log) {
        const node = ui.text(right, ui.tr(line.side) + ': ' + line.dice.join(' + ') + ' · '
          + ui.tr(line.hit ? 'hit' : 'miss') + (line.damage ? ' (' + line.damage + ')' : '')
          + (line.instant ? ' · ' + ui.tr('instant') : ''), 'div');
        node.className = 'bsim-log-' + (line.hit ? line.side === 'player' ? 'success' : 'danger' : 'muted');
      }
    }
    const history = ui.group(right, 'history');
    for (const row of saved.history.slice(-40).reverse()) {
      decorateOutcome(ui.text(history, row.enemy + ': ' + ui.tr('status.' + row.outcome), 'div'), row.outcome);
    }
    if (locked) {
      const send = (kind, values) => change(state => {
        state.fight = playCombatAction(state.fight, kind, undefined, values); return state;
      }, snap);
      if (fight.phase === 'enemySetup') {
        ui.text(controls, ui.tr('missingMelee'));
        const range = ui.field(controls, 'meleeRange');
        const damage = ui.field(controls, 'damage', {type:'number',value:0});
        ui.button(controls, 'continueMelee', () => {
          try {send('setEnemyMelee', {range:range.value, damage:ui.number(damage)});}
          catch {ctx().showAlert(ui.tr('invalid'));}
        });
      } else if (fight.phase === 'resolve') {
        ui.text(controls, ui.tr('player') + ': ' + fight.pending.dice.join(' + ') + ' · ' + ui.tr(fight.pending.hit || fight.pending.instant ? 'hit' : 'miss'));
        ui.button(controls, 'resolve', () => send('resolve'));
        if (canReroll(fight)) ui.button(controls, 'reroll', () => send('reroll'));
      } else {
        const empty = fight.player.weapon !== 'knife'
          && !(fight.player.weapon === 'silverGun' ? fight.player.silverAmmo : fight.player.ammo);
        ui.button(controls, fight.phase === 'fan' ? 'fireAgain' : 'attack.' + fight.player.weapon,
          () => send('attack')).disabled = empty;
        if (empty) ui.text(controls, ui.tr('emptyWeapon'));
        if (fight.phase === 'fan') ui.button(controls, 'endTurn', () => send('endTurn'));
        if (fight.player.weapon !== 'knife' && !fight.opponent.knifeOnly) ui.button(controls, 'switchKnife', () => send('knife'));
      }
      ui.button(controls, 'cancel', () => ctx().showConfirm(ui.tr('cancelConfirm'), () => change(state => {
        state.player = structuredClone(state.fight.player); state.fight = null; return state;
      }, snap)));
    }
    menus.forEach(menu => menu.sync());
  }
  function init() {
    if (overlay) return;
    overlay = document.createElement('div'); overlay.id = id + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent = ui.tr('title');
    const closer = overlay.querySelector('.inv-close-btn'); closer.setAttribute('aria-label', ctx().t('btn.close')); closer.addEventListener('click', close);
    const left = overlay.querySelector('.bsim-col-left');
    right = document.createElement('div'); right.className = 'bsim-report';
    overlay.querySelector('.bsim-col-right').append(right);
    ui.text(left, ui.tr('rules'));
    for (const [key, min, max] of [['hp',1,1000000], ['hpInitial',1,1000000], ['powers',0,1000000], ['attackMin',2,12], ['ammo',0,6], ['reserve',0,1000000], ['silverAmmo',0,6]]) {
      inputs.set(key, ui.field(left, key, {type:'number', value:defaults[key], min, max}));
    }
    inputs.set('weapon', ui.field(left, 'weapon', {entries:[['gun',ui.tr('gun')],['silverGun',ui.tr('silverGun')],['knife',ui.tr('knife')]]}));
    const special = ui.group(left, 'special');
    for (const key of ['fanning','marksman','necklace','bandana','bandanaUsed']) inputs.set(key, ui.checkbox(special, key));
    const healing = ui.group(left, 'psychicHealing', true);
    inputs.set('psychicHealing', ui.checkbox(healing, 'hasPsychicHealing'));
    ui.text(healing, ui.tr('psychicHealingRule'));
    heal = ui.button(healing, 'psychicHeal', () => change(state =>
      saveIdlePlayer(state, psychicHeal(playerInput(), state.fight))));
    for (const key of ['psychicHealing','powers']) inputs.get(key).addEventListener('change', () => {
      if (busy()) return;
      change(state => state.fight?.status === 'fighting' ? null : saveIdlePlayer(state, playerInput()));
    });
    for (const key of ['powers','hp','hpInitial']) inputs.get(key).addEventListener('input', syncHealing);
    editor = createOpponentEditor({document, id, t:ctx().t, language:'bg', fields:[
      ...['low','high','low2','high2'].map(key => ({key,label:ui.tr(key),min:key.endsWith('2') ? 0 : 2,max:12})),
      {key:'hp',label:ui.tr('enemyHp'),min:1}, {key:'damage',label:ui.tr('damage'),min:0},
    ], presets:encounters.map(presetRow), onSelect:row => {
      selected = encounters.find(entry => entry.key === row.key) ?? null;
      previewingSetup = true; showOpponentLife(null);
      notes.textContent = selected?.note ?? ui.tr('customNotes');
    }});
    left.append(editor.element); notes = ui.text(left, ui.tr('customNotes'));
    custom = ui.button(left, 'custom', () => choose(null));
    start = ui.button(left, 'start', () => change(state => {
      if (state.fight?.status === 'fighting') return null;
      const [row] = editor.read();
      if (row.low > row.high || (row.low2 === 0) !== (row.high2 === 0) || row.low2 > row.high2) throw new RangeError('Invalid hit range');
      const enemy = {...selected, name:row.displayName || ui.tr('enemy'), hp:row.hp, damage:row.damage,
        range:row.low + '-' + row.high + (row.low2 ? ',' + row.low2 + '-' + row.high2 : '')};
      const player = playerInput();
      // Once used, the bandana cannot be reset between fights in the same run.
      player.bandanaUsed = Boolean(player.bandanaUsed || state.player?.bandanaUsed);
      state.fight = startFight(player, enemy); state.setup = {key:selected?.key ?? null, opponents:editor.snapshot()}; return state;
    }));
    reload = ui.button(left, 'reload', () => change(state => {
      if (state.fight?.status === 'fighting') return null;
      const player = playerInput();
      if (player.weapon === 'silverGun') return null;
      const count = Math.min(6 - player.ammo, player.reserve);
      player.ammo += count; player.reserve -= count;
      player.bandanaUsed = Boolean(player.bandanaUsed || state.player?.bandanaUsed);
      state.player = player; state.fight = null; return state;
    }));
    inputs.get('weapon').addEventListener('change', () => {
      if (busy()) {
        const weapon = inputs.get('weapon').value;
        change(state => {
          state.fight = playCombatAction(state.fight, 'weapon', undefined, {weapon}); return state;
        });
        render();
        return;
      }
      reload.disabled = busy() || inputs.get('weapon').value === 'silverGun';
    });
    controls = document.createElement('div'); left.append(controls);
    document.body.append(overlay);
    menus.push(createThemedSelect(inputs.get('weapon')));
    launch = document.createElement('button'); launch.id = id + '-btn'; launch.style.display = 'none';
    launch.setAttribute('aria-keyshortcuts', 'S');
    launch.innerHTML = ctx().shortcutLabel(ctx().t('battlesim.title')); ctx().getPlayBtnRow().append(launch);
    launch.addEventListener('click', () => {if (!store.snapshot()) return; render(); overlay.classList.add('active');});
    ctx().registerPanelShortcut('KeyS', {getButton:() => launch, getOverlay:() => overlay,
      otherOverlayIds:ctx().ALL_PANEL_OVERLAY_IDS.filter(key => key !== overlay.id), open:() => launch.click(), close});
    let backdrop = false;
    overlay.addEventListener('mousedown', event => {backdrop = event.target === overlay;});
    overlay.addEventListener('click', event => {if (backdrop && event.target === overlay) close();});
    overlay.addEventListener('keydown', event => {if (event.key === 'Escape') {event.stopPropagation(); close();}});
  }
  return {init, render, setVisible(value) {if (launch) launch.style.display = value ? '' : 'none'; if (!value) close();}};
}
const panel = createMochilaPanel(() => ({bookId:currentBookId, run:currentPlaythrough(), saveState, t,
  getPlayBtnRow, showAlert, showConfirm, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS}), document);
export const initSim1307 = panel.init, renderSim1307 = panel.render, setSim1307Visible = panel.setVisible;
export const {init, render, setVisible} = panel;
export const loadData = () => loadRoster(apiFetch);
