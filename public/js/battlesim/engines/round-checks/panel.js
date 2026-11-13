// Connect finite-round combat setup and actions to the current run using shared simulator controls.
import {createQuestState} from '../super-endless-quest/state.js';
import {createD20Forms} from '../d20/forms.js';
import {createOpponentEditor} from '../../opponents.js';
import {startFight, combatAction, validateFight, automaticWinSource, availableConsumables} from './combat.js';
import {renderReport} from './report.js';

export function createRoundChecksPanel(getContext, {definition, encounters, stats, defaults = {}, parameters, parameterLimits = {}, combinations,
  itemKeys = ['caltrop','timeGrenade','creepyBall'], consumableKeys = [], booleanParameters = [],
  customRules = {goal:{kind:'manual'}}, roundAdjustment = false, persistBattleParameters = false}) {
  const id = definition.stateKey, ctx = () => getContext();
  const ui = createD20Forms(document, id, key => ctx().t(definition.i18nPrefix + '.' + key));
  const store = createQuestState(() => ({...ctx(), definition}), {validateFight});
  const inputs = new Map(), items = new Map();
  let overlay, launch, right, controls, editor, notes, start, custom, cancel, token, mountedRun, mountedOriginal, selected = null;
  const close = () => overlay?.classList.remove('active');
  const busy = state => state?.fight?.status === 'fighting';
  const defaultRound = () => ({name:'', dice:2, stats:stats[0], target:10});
  const combination = round => (round.select && round.select !== 'sum' ? round.select + ':' : '') + round.stats.join('+');
  const inputNumber = key => inputs.get(key).type === 'checkbox' ? Number(inputs.get(key).checked) : ui.number(inputs.get(key));
  function rows(encounter) {
    return encounter.rounds.map((round, index) => ({...round, stats:combination(round),
      displayName:ui.tr('round') + ' ' + (index + 1) + ' · ' + encounter.name}));
  }
  function layout() {
    const rules = selected?.rules ?? customRules;
    const relevant = new Set(selected?.rounds.flatMap(round => Object.keys(round.params ?? {})) ?? []);
    for (const round of selected?.rounds ?? []) {
      if (round.targetParameter) relevant.add(round.targetParameter);
      if (round.automaticWinParameter) relevant.add(round.automaticWinParameter);
      for (const effect of round.startEffects ?? []) if (effect.when?.parameter) relevant.add(effect.when.parameter.name);
    }
    if (rules.automaticWinParameter) relevant.add(rules.automaticWinParameter);
    for (const effect of rules.finishEffects ?? []) if (effect.when?.parameter) relevant.add(effect.when.parameter.name);
    for (const [key, thresholds] of Object.entries(rules.derivedParameters ?? {})) {
      relevant.delete(key); for (const threshold of thresholds) relevant.add(threshold.name);
    }
    for (const key of parameters) inputs.get(key).parentElement.hidden = !relevant.has(key);
    for (const [key, input] of items) input.parentElement.hidden = consumableKeys.includes(key) && !Object.hasOwn(rules.consumables ?? {}, key);
    for (const [index, row] of [...editor.element.querySelectorAll('.bsim-opponent-row')].entries()) {
      const spec = selected?.rounds[index], target = row.querySelector('[data-stat="target"]');
      if (spec?.opposed || spec?.targetParameter) {
        target.value = '';
        target.placeholder = spec.opposed ? spec.opposed.dice + 'd6 + ' + spec.opposed.bonus + ' (' + ui.tr('cap') + ' ' + spec.opposed.cap + ')'
          : (spec.targetFactor ?? 1) + ' × ' + ui.tr(spec.targetParameter) + ' + ' + spec.target;
      }
    }
    editor.fixCount(Boolean(selected));
    notes.textContent = selected?.sourceNotes?.join(' ') || ui.tr('customNotes');
  }
  function choose(entry) {
    if (busy(store.snapshot()?.state)) return;
    selected = entry; editor.set(rows(entry)); layout();
  }
  function change(callback, expected = token) {
    try {
      if (store.update(state => {
        state.history = state.history.slice(-199);
        const next = callback(state);
        if (persistBattleParameters && next?.fight && next.setup) next.setup.params = {...next.setup.params, ...next.fight.params};
        return next;
      }, expected)) render();
    } catch {ctx().showAlert(ui.tr('invalid'));}
  }
  function fightControls(fight, expected) {
    const send = (kind, values = {}) => change(state => {
      state.fight = combatAction(state.fight, {kind, expectedRevision:fight.revision, ...values}); return state;
    }, expected);
    if (fight.pendingChoice) {
      ui.text(controls, ui.tr('chooseStat'));
      for (const stat of fight.pendingChoice.fields) ui.button(controls, stat, () => send('choose', {stat}));
    } else if (fight.result) {
      if (fight.result === 'manual') {
        ui.text(controls, ui.tr('manualOutcome'));
        for (const outcome of ['win','loss']) ui.button(controls, 'confirm.' + outcome, () => {
          ctx().showConfirm(ui.tr('confirmOutcome'), () => send('finish', {outcome}));
        });
      } else ui.button(controls, 'finish', () => send('finish'));
    } else {
      if (fight.pending) {
        ui.button(controls, 'resolve', () => send('resolve'));
        if (fight.items.creepyBall) for (const side of ['player','enemy']) for (const [index, value] of fight.pending[side].entries()) {
          const button = ui.button(controls, 'changeDie', () => send('creepyBall', {side, index}));
          button.textContent += ': ' + ui.tr(side === 'player' ? 'yourDice' : 'enemyDice') + ' ' + (index + 1) + ' (' + value + ' → 6)';
        }
      } else {
        const adjustment = roundAdjustment ? ui.field(controls, 'roundAdjustment', {type:'number', value:0, min:-1000, max:1000}) : null;
        ui.button(controls, 'roll', () => {
          try {send('roll', adjustment ? {roundModifier:ui.number(adjustment)} : {});}
          catch {ctx().showAlert(ui.tr('invalid'));}
        });
      }
      if (fight.items.grenade) {
        const button = ui.button(controls, 'grenade', () => send('grenade'));
        button.textContent += ' (' + fight.items.grenade + ')';
      }
      const automatic = automaticWinSource(fight);
      if (automatic) ui.button(controls, 'automaticWin', () => send('automaticWin')).textContent += ' · ' + ui.tr('item.' + automatic);
      for (const key of availableConsumables(fight)) ui.button(controls, 'consume.' + key, () => send('consume', {key}));
    }
  }
  function render() {
    if (!overlay) return;
    const snapshot = store.snapshot();
    if (!snapshot) {token = null; mountedRun = mountedOriginal = null; controls.replaceChildren(); right.replaceChildren(); close(); return;}
    if (mountedRun !== snapshot.run || mountedOriginal !== snapshot.original) {
      const saved = snapshot.state, setup = saved.setup ?? {};
      for (const [key, input] of inputs) {
        const value = stats.includes(key) ? (saved.player?.[key] ?? defaults[key] ?? 2) : (setup.params?.[key] ?? 0);
        if (input.type === 'checkbox') input.checked = Boolean(value);
        else input.value = value;
      }
      for (const input of items.values()) input.checked = false;
      const encounter = setup.encounter ?? saved.fight?.encounter;
      selected = encounters.find(entry => entry.key === encounter?.key) ?? null;
      editor.set(encounter ? rows(encounter) : [defaultRound()]);
      layout(); mountedRun = snapshot.run; mountedOriginal = snapshot.original;
    }
    token = snapshot;
    const locked = busy(snapshot.state);
    for (const input of [...inputs.values(), ...items.values()]) input.disabled = locked;
    editor.lock(locked); start.disabled = custom.disabled = locked; cancel.disabled = !locked;
    controls.replaceChildren(); if (locked) fightControls(snapshot.state.fight, snapshot);
    renderReport(right, snapshot.state, ui, stats);
  }
  function init() {
    if (overlay) return;
    overlay = document.createElement('div'); overlay.id = id + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent = ui.tr('title');
    const closer = overlay.querySelector('.inv-close-btn'); closer.setAttribute('aria-label', ctx().t('btn.close')); closer.addEventListener('click', close);
    const left = overlay.querySelector('.bsim-col-left'); right = overlay.querySelector('.bsim-col-right'); ui.text(left, ui.tr('rules'));
    for (const key of stats) inputs.set(key, ui.field(left, key, {type:'number', value:defaults[key] ?? 2, min:-1000000}));
    inputs.set('modifier', ui.field(left, 'modifier', {type:'number', value:0, min:-1000, max:1000}));
    for (const key of parameters) inputs.set(key, booleanParameters.includes(key) ? ui.checkbox(left, key)
      : ui.field(left, key, {type:'number', value:0, max:parameterLimits[key] ?? 1000000}));
    for (const key of itemKeys) items.set(key, ui.checkbox(left, 'item.' + key));
    const editorLabels = {opponents:'combatRounds', name:'encounterName', add:'addRound', remove:'removeRound'};
    editor = createOpponentEditor({document, id, t:key => {
      const suffix = key.replace('battlesim.editor.', ''); return editorLabels[suffix] ? ui.tr(editorLabels[suffix]) : ctx().t(key);
    }, fields:[{key:'dice', label:ui.tr('dice'), min:1, max:3},
      {key:'stats', label:ui.tr('statFormula'), options:combinations.map(value => ({value, label:value.split(':').map(part => part.split('+').map(key => ui.tr(key)).join(value.includes(':') ? ' / ' : ' + ')).join(': ')}))},
      {key:'target', label:ui.tr('target'), min:-1000000}],
    presets:encounters.map(entry => ({...rows(entry)[0], displayName:entry.name + ' (§' + entry.section + ')', entry})),
    isStatUnavailable:(key, row) => key === 'target' && Boolean(row.opposed || row.targetParameter),
    onSelect:preset => choose(preset.entry)});
    left.append(editor.element); notes = ui.text(left, ui.tr('customNotes'));
    custom = ui.button(left, 'custom', () => {
      if (busy(store.snapshot()?.state)) return; selected = null; editor.set([defaultRound()]); layout();
    });
    start = ui.button(left, 'start', () => change(state => {
      if (busy(state)) return null;
      const read = editor.read();
      const rounds = read.map((row, index) => {
        const [select, statList] = row.stats.includes(':') ? row.stats.split(':') : ['sum', row.stats];
        return {...row, stats:statList ? statList.split('+') : [], select,
          target:row.target == null ? (row.targetParameter ? selected.rounds[index].target : 0) : row.target};
      });
      const encounter = {...(selected ?? {}), rounds,
        name:selected?.name ?? (read[0].displayName || ui.tr('enemy')), rules:selected?.rules ?? customRules};
      const player = Object.fromEntries(stats.map(key => [key, inputNumber(key)]));
      const params = Object.fromEntries(parameters.map(key => [key, inputNumber(key)]));
      state.fight = startFight(player, encounter, {params, modifier:ui.number(inputs.get('modifier')),
        consumables:Object.fromEntries(consumableKeys.map(key => [key, items.get(key)?.checked ?? false])),
        ...Object.fromEntries([...items].map(([key, input]) => [key, input.checked]))});
      state.setup = {encounter:structuredClone(encounter), params}; return state;
    }));
    controls = document.createElement('div'); controls.id = id + '-controls'; left.append(controls);
    cancel = ui.button(left, 'cancel', () => {
      const expected = token; if (!busy(expected?.state)) return;
      ctx().showConfirm(ui.tr('cancelConfirm'), () => change(state => {state.fight = null; return state;}, expected));
    });
    document.body.append(overlay); launch = document.createElement('button'); launch.id = id + '-btn'; launch.style.display = 'none';
    launch.innerHTML = ctx().shortcutLabel(ctx().t('battlesim.title')); ctx().getPlayBtnRow().append(launch);
    launch.addEventListener('click', () => {if (!store.snapshot()) return; render(); overlay.classList.add('active');});
    ctx().registerPanelShortcut('KeyS', {getButton:() => launch, getOverlay:() => overlay,
      otherOverlayIds:ctx().ALL_PANEL_OVERLAY_IDS.filter(key => key !== overlay.id), open:() => launch.click(), close});
    let backdrop = false;
    overlay.addEventListener('mousedown', event => {backdrop = event.target === overlay;});
    overlay.addEventListener('click', event => {if (backdrop && event.target === overlay) close();});
    overlay.addEventListener('keydown', event => {if (event.key === 'Escape') {event.stopPropagation(); close();}});
  }
  function setVisible(value) {if (launch) launch.style.display = value ? '' : 'none'; if (!value) close();}
  return {init, render, setVisible};
}
