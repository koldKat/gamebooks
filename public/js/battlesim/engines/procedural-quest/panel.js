// Present optional combat procedures, editable opponents and run-bound saved actions.
import {createOpponentEditor} from '../../opponents.js';
import {createQuestState} from '../super-endless-quest/state.js';
import {startProcedure, procedureAction, validateProcedureFight, availableProcedureChoices} from './core.js';
import {compileCustomProcedure} from './custom.js';

export function createProcedurePanel({document, definition, t, getRoster, getRules, getRun, getBookId,
  saveState, getButtonRow, showAlert, showConfirm, registerShortcut = () => {}}) {
  const id = definition.stateKey, tr = (key, values) => t('battlesim.procedural.' + key, values);
  const store = createQuestState(() => ({run:getRun(), bookId:getBookId(), definition, saveState}),
    {validateFight:validateProcedureFight, preservePlayerFields:true});
  const fields = new Map();
  let overlay, launch, left, right, selector, setup, controls, start, cancel, presetEditor, customEditor;
  let token, mountedRun, mountedState;
  let draftValues = {};
  const busy = state => state.fight?.status === 'fighting';
  const close = () => overlay?.classList.remove('active');
  function text(parent, value, tag = 'p') {
    const node = document.createElement(tag); node.textContent = value; parent.append(node); return node;
  }
  function button(parent, key, action, label = tr(key)) {
    const node = document.createElement('button'); node.type = 'button'; node.id = id + '-' + key;
    node.className = 'bsim-action-btn'; node.textContent = label; node.addEventListener('click', action); parent.append(node); return node;
  }
  function input(parent, key, label, min, max, value = '', checkbox = false) {
    const row = document.createElement('label'); row.className = 'inv-edit-row';
    text(row, label, 'span');
    const control = document.createElement('input'); control.id = id + '-' + key;
    control.type = checkbox ? 'checkbox' : 'number';
    control.className = control.type === 'number' ? 'inv-edit-input' : '';
    control.autocomplete = 'off'; control.min = min; control.max = max; control.step = 1;
    if (control.type === 'checkbox') control.checked = Number(value) === 1;
    else control.value = value;
    row.append(control); parent.append(row); return control;
  }
  function numeric(control) {
    if (control.type === 'checkbox') return Number(control.checked);
    const value = Number(control.value);
    if (!control.value.trim() || !Number.isSafeInteger(value) || value < Number(control.min) || value > Number(control.max)) {
      throw new RangeError(tr('invalid'));
    }
    return value;
  }
  function collectDraft() {
    for (const [key, control] of fields) draftValues[key] = control.type === 'checkbox' ? Number(control.checked) : control.value;
  }
  function selected() {
    return selector.value === 'custom' ? getRules().customProfiles['1']
      : getRoster().find(entry => entry.key === selector.value);
  }
  function setupFields(values = draftValues) {
    const template = selected();
    if (!template) throw new RangeError(tr('invalid'));
    setup.replaceChildren(); fields.clear();
    for (const field of template.variables) {
      if (field.internal) continue;
      fields.set(field.key, input(setup, field.key, field.label, field.min, field.max,
        values[field.key] ?? field.default ?? '', field.min === 0 && field.max === 1));
    }
    const custom = selector.value === 'custom';
    customEditor.element.hidden = !custom; presetEditor.element.hidden = custom;
  }
  function change(action, expected = token) {
    try { if (store.update(action, expected)) render(); } catch { showAlert(tr('invalid')); }
  }
  function begin(state) {
    if (busy(state)) return;
    const custom = selector.value === 'custom';
    const opponents = (custom ? customEditor : presetEditor).read();
    const name = opponents[0]?.displayName.trim();
    if (!name) throw new RangeError(tr('invalid'));
    const procedure = custom ? compileCustomProcedure(opponents, getRules())
      : {...selected(), displayName:name, name};
    const player = {};
    for (const field of procedure.variables) {
      player[field.key] = field.internal ? field.default : numeric(fields.get(field.key));
    }
    state.fight = startProcedure(player, procedure);
    state.setup = {procedure:selector.value, opponents:structuredClone(opponents)};
    return state;
  }
  function stop() {
    const expected = token;
    if (!expected || !busy(expected.state)) return;
    showConfirm(tr('cancelConfirm'), () => change(state => {
      state.fight = procedureAction(state.fight, {kind:'cancel', expectedEvent:expected.state.fight.events.length});
      return state;
    }, expected));
  }
  function actionControls(state, expected) {
    controls.replaceChildren();
    if (!busy(state)) return;
    const fight = state.fight, step = fight.opponent.steps.find(step => step.id === fight.step);
    text(controls, step.label);
    if (!fight.opponent.custom) text(controls, tr('section', {section:step.section}));
    const act = action => change(next => {
      next.fight = procedureAction(next.fight, {expectedEvent:fight.events.length, ...action}); return next;
    }, expected);
    if (fight.phase === 'continue') {
      button(controls, 'continue', () => act({kind:'continue', destination:fight.pending}));
    } else if (fight.phase === 'finish') {
      button(controls, 'finish', () => act({kind:'finish'}), tr('confirmOutcome', {outcome:tr('status.' + step.outcome)}));
    } else if (fight.phase === 'choice') {
      for (const row of availableProcedureChoices(fight)) {
        button(controls, 'choice-' + row.id, () => act({kind:'choice', choice:row.id}), row.label);
      }
    } else if (fight.phase === 'effect') {
      button(controls, 'apply', () => act({kind:'effect'}));
    } else if (fight.phase === 'roll') {
      const spent = getRules().experienceEnabled === false ? null
        : input(controls, 'spent', tr('spent'), 0, step.experience ? Math.min(fight.player.experience, step.experienceLimit ?? fight.player.experience) : 0, 0);
      if (spent && !step.experience) spent.disabled = true;
      const dice = Array.from({length:step.dice}, (_, i) => {
        const control = input(controls, 'die-' + i, tr('die', {number:i + 1}), 1, 6);
        control.placeholder = tr('automatic'); return control;
      });
      button(controls, 'roll', () => {
        try {
          const entered = dice.filter(control => control.value.trim());
          if (entered.length && entered.length !== dice.length) throw new RangeError(tr('invalid'));
          act({kind:'roll', spent:spent ? numeric(spent) : 0, ...(entered.length ? {dice:dice.map(numeric)} : {})});
        } catch { showAlert(tr('invalid')); }
      });
    }
  }
  function report(state) {
    right.replaceChildren();
    const fight = state.fight;
    text(right, tr(fight ? 'status.' + fight.status : 'ready'), 'h4').className = 'bsim-side-title';
    if (fight) {
      text(right, fight.opponent.name);
      text(right, tr(getRules().experienceEnabled === false ? 'totalsNoExperience' : 'totals',
        {hp:fight.player.hp, maxHp:fight.player.maxHp, experience:fight.player.experience}));
      for (const key of getRules().reportFields ?? []) {
        const field = fight.opponent.variables.find(row => row.key === key);
        if (field) text(right, field.label + ': ' + fight.player[key]);
      }
      if (!fight.opponent.custom && fight.destination != null) text(right, tr('section', {section:fight.destination}));
    }
    text(right, tr('manualStory'));
    text(right, tr('log'), 'h4').className = 'bsim-side-title';
    const log = document.createElement('div'); log.className = 'bsim-log'; right.append(log);
    const steps = new Map(fight?.opponent.steps.map(step => [step.id, step]) ?? []);
    for (const event of (fight?.events ?? []).slice(-100).reverse()) {
      const step = steps.get(event.step);
      let line = step?.label ?? '';
      if (event.kind === 'roll') line += ' ' + tr(getRules().experienceEnabled === false ? 'rollLogNoExperience' : 'rollLog', {dice:event.dice.join(' + '), spent:event.spent, total:event.total});
      else if (event.kind === 'choice') line += ' ' + (step?.choices.find(row => row.id === event.choice)?.label ?? '');
      line += ' ' + tr('hp', {hp:event.hp}); text(log, line);
    }
    text(right, tr('history'), 'h4').className = 'bsim-side-title';
    for (const row of state.history.slice(-30).reverse()) text(right, row.enemy + ' · ' + tr('status.' + row.outcome));
  }
  function render() {
    if (!overlay?.classList.contains('active')) return;
    const currentRun = getRun();
    if (token?.run === currentRun && Number(getBookId()) === definition.id
        && token.original === currentRun?.[id]) return;
    const next = store.snapshot();
    if (!next) { token = mountedRun = mountedState = null; close(); return; }
    const state = next.state;
    try { if (state.fight) validateProcedureFight(state.fight); } catch {
      controls.replaceChildren(); text(controls, tr('invalidSaved')); start.disabled = cancel.disabled = true; return;
    }
    if (mountedRun !== next.run || mountedState !== next.original) {
      selector.value = getRoster().some(entry => entry.key === state.setup?.procedure) ? state.setup.procedure : 'custom';
      draftValues = {...state.player};
      if (state.setup?.procedure === 'custom') customEditor.set(state.setup.opponents);
      else presetEditor.set(state.setup?.opponents ?? [{}]);
      setupFields(); mountedRun = next.run; mountedState = next.original;
    }
    token = next;
    const locked = busy(state);
    for (const control of fields.values()) control.disabled = locked;
    selector.disabled = start.disabled = locked; cancel.disabled = !locked;
    presetEditor.lock(locked); customEditor.lock(locked);
    actionControls(state, next); report(state);
  }
  function open() {
    if (!getRun() || Number(getBookId()) !== definition.id) { showAlert(t('battlesim.no_active_playthrough')); return; }
    overlay.classList.add('active'); render();
  }
  function init() {
    if (overlay) return;
    overlay = document.createElement('div'); overlay.id = id + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent = t(definition.i18nPrefix + '.title');
    const closer = overlay.querySelector('.inv-close-btn'); closer.setAttribute('aria-label', t('btn.close')); closer.addEventListener('click', close);
    left = overlay.querySelector('.bsim-col-left'); right = overlay.querySelector('.bsim-col-right');
    text(left, tr(getRules().experienceEnabled === false ? 'rulesNoExperience' : 'rules'));
    const row = document.createElement('label'); row.className = 'inv-edit-row'; text(row, tr('procedure'), 'span');
    selector = document.createElement('select'); selector.className = 'inv-edit-input'; selector.id = id + '-procedure';
    for (const item of [{key:'custom', displayName:tr('custom')}, ...getRoster()]) {
      const option = document.createElement('option'); option.value = item.key; option.textContent = item.displayName; selector.append(option);
    }
    row.append(selector); left.append(row);
    setup = document.createElement('div'); left.append(setup);
    function selectPreset(entry) {
      collectDraft(); selector.value = entry.key; presetEditor.set([entry]); setupFields();
    }
    presetEditor = createOpponentEditor({document, id:id + '-preset', t, fields:[], presets:getRoster(), onSelect:selectPreset});
    presetEditor.fixCount(true); left.append(presetEditor.element);
    customEditor = createOpponentEditor({document, id:id + '-custom', t, fields:getRules().customOpponentFields,
      presets:getRoster(), onSelect:selectPreset}); left.append(customEditor.element);
    selector.addEventListener('change', () => {
      collectDraft();
      if (selector.value !== 'custom') presetEditor.set([selected()]);
      setupFields();
    });
    start = button(left, 'start', () => change(begin));
    controls = document.createElement('div'); controls.id = id + '-controls'; left.append(controls);
    cancel = button(left, 'cancel', stop); document.body.append(overlay);
    launch = document.createElement('button'); launch.id = id + '-btn'; launch.style.display = 'none';
    getButtonRow().append(launch); launch.addEventListener('click', open); registerShortcut({button:launch, overlay, open, close});
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
  }
  return {init, render, setVisible(visible) { if (launch) launch.style.display = visible ? '' : 'none'; if (!visible) close(); }};
}
