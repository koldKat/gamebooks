// Bind independent Dungeons to Dominions encounters to the initiating run and shared simulator UI.
import {createQuestState} from '../super-endless-quest/state.js';
import {createD20Forms} from '../d20/forms.js';
import {createOpponentEditor} from '../../opponents.js';
import {startFight, combatAction, validateFight} from './combat.js';

export function createDominionsPanel({document, definition, t, getRoster, getRun, getBookId, saveState,
  getButtonRow, showAlert, showConfirm, registerShortcut = () => {}}) {
  const id = definition.stateKey, ui = createD20Forms(document, id, key => t(definition.i18nPrefix + '.' + key));
  const store = createQuestState(() => ({run:getRun(), bookId:getBookId(), definition, saveState}), {validateFight});
  const inputs = new Map();
  let overlay, launch, left, right, controls, editor, notes, sequential, start, reset, cancel,
    token, mountedRun, mountedOriginal, selected = null;
  const close = () => overlay?.classList.remove('active');
  const busy = state => state?.fight?.status === 'fighting';
  function change(callback, expected = token) {
    try {
      if (store.update(state => {state.history = state.history.slice(-199); return callback(state);}, expected)) render();
    } catch {showAlert(ui.tr('invalid'));}
  }
  function presetLayout() {
    editor.fixCount(Boolean(selected));
    sequential.closest('label').hidden = Boolean(selected);
    notes.textContent = selected?.sourceNotes?.join(' ') || ui.tr('customNotes');
  }
  function selectPreset(entry) {
    selected = entry;
    editor.set(entry.profiles.map(row => ({...row, displayName:row.name})));
    presetLayout();
  }
  function report(state) {
    right.replaceChildren();
    const fight = state.fight;
    ui.text(right, ui.tr(fight ? 'status.' + fight.status : 'ready'), 'h4').className = 'bsim-side-title';
    if (fight) {
      ui.text(right, fight.opponent.name);
      ui.text(right, `${ui.tr('hp')}: ${fight.player.hp} · ${ui.tr('shield')}: ${fight.player.shield} · ${ui.tr('armor')}: ${fight.player.armor}`);
      ui.text(right, `${ui.tr('ammo')}: ${fight.player.ammo} · ${ui.tr('bombs')}: ${fight.player.bombs}`);
      for (const row of fight.enemies) ui.text(right, `${row.name} · ${ui.tr('hp')}: ${row.hp}`);
      ui.text(right, `${ui.tr('round')}: ${fight.round}`);
      ui.text(right, ui.tr('manualStory'));
      const log = document.createElement('div'); log.className = 'bsim-log'; right.append(log);
      for (const event of fight.events.slice().reverse()) {
        let message = `${event.round}. `, color = 'muted';
        if (event.kind === 'dice') message += `${ui.tr('roll.' + event.roll)}: [${event.dice.join(', ')}] = ${event.total}`;
        else if (event.kind === 'attack') {
          const who = event.who === 'player' ? ui.tr('player') : fight.enemies[event.target].name;
          message += `${who}: ${ui.tr(event.skipped ? 'skipped' : event.hit ? 'hit' : 'miss')}`;
          if (event.damage) message += ` · ${event.healing ? '+' : '-'}${event.damage} ${ui.tr('hp')}`;
          if (event.critical) message += ' · ' + ui.tr('critical');
          color = event.hit ? event.who === 'player' && !event.healing ? 'success' : 'danger' : 'muted';
        } else if (event.kind === 'damage') {
          message += `${ui.tr('player')}: -${event.hp} ${ui.tr('hp')}`;
          if (event.shield) message += ` · -${event.shield} ${ui.tr('shield')}`;
          message += ' · ' + ui.tr('cause.' + event.cause); color = 'danger';
        } else if (event.kind === 'benefactor') {message += ui.tr('effect.' + (event.total <= 4 ? 'immune' : event.total <= 7 ? 'clone' : event.total <= 10 ? 'healing' : 'acid')); color = 'accent';}
        else if (event.kind === 'distance' || event.kind === 'flee') {message += ui.tr(event.kind) + ': ' + ui.tr(event.success ? 'success' : 'failure'); color = event.success ? 'success' : 'danger';}
        else {message += ui.tr('event.' + event.kind); color = event.kind === 'poisonDeath' ? 'danger' : 'accent';}
        ui.text(log, message).className = 'bsim-log-' + color;
      }
    }
    if (state.history.length) {
      ui.text(right, ui.tr('history'), 'h4').className = 'bsim-side-title';
      for (const row of state.history.slice(-30).reverse()) ui.text(right, row.enemy + ' · ' + ui.tr('status.' + row.outcome));
    }
    for (const child of right.children) child.classList.add('bsim-report');
  }
  function render() {
    if (!overlay) return;
    const snapshot = store.snapshot();
    if (!snapshot) {token = null; mountedRun = mountedOriginal = null; controls.replaceChildren(); right.replaceChildren(); close(); return;}
    if (mountedRun !== snapshot.run || mountedOriginal !== snapshot.original) {
      for (const [key, input] of inputs) {
        const value = snapshot.state.player?.[key];
        if (input.type === 'checkbox') input.checked = Boolean(value);
        else input.value = value ?? ({hp:8, av:0, armor:0, damage:3, missileAv:0, ammo:0, shield:0, bombs:0}[key]);
      }
      selected = getRoster().find(entry => entry.key === snapshot.state.opponent?.key) ?? null;
      editor.set((snapshot.state.opponent?.profiles ?? [{name:'', av:0, armor:0, damage:2, hp:6}]).map(row => ({...row, displayName:row.name})));
      sequential.checked = Boolean(snapshot.state.opponent?.rules.sequential);
      presetLayout(); mountedRun = snapshot.run; mountedOriginal = snapshot.original;
    }
    token = snapshot;
    const locked = busy(snapshot.state);
    for (const input of inputs.values()) input.disabled = locked;
    sequential.disabled = locked; editor.lock(locked); start.disabled = reset.disabled = locked; cancel.disabled = !locked;
    controls.replaceChildren();
    if (locked) {
      const fight = snapshot.state.fight, firstLiving = fight.enemies.findIndex(row => row.hp > 0);
      const entries = fight.enemies.flatMap((row, index) => row.hp > 0 && (!fight.opponent.rules.sequential || index === firstLiving)
        ? [[String(index), row.name + ' (' + row.hp + ')']] : []);
      const target = ui.field(controls, 'target', {entries}); target.closest('label').hidden = entries.length === 1;
      const dice = ui.group(controls, 'manualDice'), pairs = new Map();
      for (const key of ['player', 'enemy']) pairs.set(key, [
        ui.field(dice, key + 'Die1', {type:'number', min:1, max:6, optional:true}),
        ui.field(dice, key + 'Die2', {type:'number', min:1, max:6, optional:true}),
      ]);
      if (entries.length > 1) for (const input of pairs.get('enemy')) input.disabled = true;
      ui.text(dice, ui.tr('diceHelp'));
      const perform = (kind, mode) => change(state => {
        const manual = {};
        for (const [key, pair] of pairs) if (!pair[0].disabled && pair.some(input => input.value.trim())) manual[key] = pair.map(input => ui.number(input));
        state.fight = combatAction(state.fight, {kind, mode, expectedRevision:fight.revision, target:ui.number(target), dice:manual});
        return state;
      }, snapshot);
      ui.button(controls, 'melee', () => perform('round', 'melee'));
      const missile = ui.button(controls, 'missile', () => perform('round', 'missile'));
      missile.disabled = fight.melee || fight.player.ammo === 0;
      const bomb = ui.button(controls, 'bomb', () => perform('round', 'bomb')); bomb.disabled = fight.player.bombs === 0;
      ui.button(controls, 'flee', () => perform('flee', 'melee'));
    }
    report(snapshot.state);
  }
  function init() {
    if (overlay) return;
    overlay = document.createElement('div'); overlay.id = id + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent = ui.tr('title');
    const closer = overlay.querySelector('.inv-close-btn'); closer.setAttribute('aria-label', t('btn.close')); closer.addEventListener('click', close);
    left = overlay.querySelector('.bsim-col-left'); right = overlay.querySelector('.bsim-col-right');
    ui.text(left, ui.tr('rules'));
    for (const key of ['hp', 'av', 'armor', 'damage', 'shield']) inputs.set(key, ui.field(left, key, {type:'number', min:key === 'hp' ? 1 : key === 'av' ? -100 : 0, max:1000000}));
    const options = ui.group(left, 'conditions');
    for (const key of ['athletics', 'highCon', 'resistant', 'perception', 'hunting', 'stealth', 'spareWeapon', 'warned', 'silverWeapon', 'elementalResistance', 'voyberry', 'halfOutgoing']) inputs.set(key, ui.checkbox(options, key));
    const ranged = ui.group(left, 'ranged');
    for (const key of ['missileAv', 'ammo', 'bombs']) inputs.set(key, ui.field(ranged, key, {type:'number', min:key === 'missileAv' ? -100 : 0}));
    ui.text(ranged, ui.tr('rangedHelp'));
    const fields = ['av', 'armor', 'damage', 'hp'].map(key => ({key, label:ui.tr(key), min:key === 'hp' ? 1 : key === 'av' ? -100 : 0, max:1000000}));
    editor = createOpponentEditor({document, id, t, fields,
      presets:getRoster().map(entry => ({displayName:entry.name + ' (§' + entry.section + ')', ...entry.profiles[0], entry})),
      onSelect:preset => selectPreset(preset.entry)});
    left.append(editor.element);
    sequential = ui.checkbox(left, 'sequential'); notes = ui.text(left, ui.tr('customNotes'));
    reset = ui.button(left, 'custom', () => {
      if (busy(token?.state)) return;
      selected = null; editor.set([{displayName:'', av:0, armor:0, damage:2, hp:6}]); presetLayout();
    });
    start = ui.button(left, 'start', () => change(state => {
      if (busy(state)) return null;
      const player = {name:ui.tr('player')};
      for (const [key, input] of inputs) player[key] = input.type === 'checkbox' ? input.checked : ui.number(input);
      const profiles = editor.read().map(row => ({name:row.displayName || ui.tr('opponent'), av:row.av, armor:row.armor, damage:row.damage, hp:row.hp}));
      const encounter = selected ? {...selected, profiles} : {name:profiles.map(row => row.name).join(', '), section:0, profiles, rules:{sequential:sequential.checked}};
      state.fight = startFight(player, encounter); return state;
    }));
    controls = document.createElement('div'); controls.id = id + '-controls'; left.append(controls);
    cancel = ui.button(left, 'cancel', () => {
      const expected = token;
      if (!busy(expected?.state)) return;
      showConfirm(ui.tr('cancelConfirm'), () => change(state => {state.fight = combatAction(state.fight,
        {kind:'cancel', expectedRevision:state.fight.revision}); return state;}, expected));
    });
    document.body.append(overlay); launch = document.createElement('button'); launch.id = id + '-btn'; launch.style.display = 'none'; getButtonRow().append(launch);
    launch.addEventListener('click', () => {
      if (!store.snapshot()) {showAlert(t('battlesim.no_active_playthrough')); return;}
      render(); overlay.classList.add('active');
    });
    registerShortcut({button:launch, overlay, open:() => launch.click(), close});
    let backdrop = false;
    overlay.addEventListener('mousedown', event => {backdrop = event.target === overlay;});
    overlay.addEventListener('click', event => {if (backdrop && event.target === overlay) close();});
    overlay.addEventListener('keydown', event => {if (event.key === 'Escape') {event.stopPropagation(); close();}});
  }
  return {init, render, setVisible(value) {if (launch) launch.style.display = value ? '' : 'none'; if (!value) close();}};
}
