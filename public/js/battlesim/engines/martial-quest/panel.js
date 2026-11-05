// Present optional martial encounters, explicit combat actions and saved results.
import {createOpponentEditor} from '../../opponents.js';
import {startMartialFight, martialAction, validateMartialFight} from './core.js';
import {createQuestState} from '../super-endless-quest/state.js';

export function createMartialPanel({document, definition, t, getRoster, getRun, getBookId,
  saveState, getButtonRow, showAlert, showConfirm, registerShortcut = () => {}}) {
  const id = definition.stateKey, tr = (key, values) => t('battlesim.martial.' + key, values);
  const store = createQuestState(() => ({run:getRun(), bookId:getBookId(), definition, saveState}),
    {validateFight:validateMartialFight});
  const fields = {};
  let overlay, launch, left, right, editor, procedure, acknowledged, start, cancel, controls;
  let shownToken, mountedRun, mountedState;
  const busy = state => state.fight?.status === 'fighting';
  const close = () => overlay?.classList.remove('active');
  function text(holder, value, tag = 'p') {
    const node = document.createElement(tag); node.textContent = value; holder.append(node); return node;
  }
  function button(holder, key, action, caption = tr(key)) {
    const node = document.createElement('button'); node.type = 'button'; node.className = 'bsim-action-btn';
    node.id = id + '-' + key; node.textContent = caption; node.addEventListener('click', action); holder.append(node); return node;
  }
  function number(holder, key, min, max, value = '') {
    const row = document.createElement('label'), input = document.createElement('input');
    row.className = 'inv-edit-row'; text(row, tr(key), 'span');
    input.type = 'number'; input.min = min; input.max = max; input.step = 1;
    input.className = 'inv-edit-input'; input.autocomplete = 'off'; input.id = id + '-' + key; input.value = value;
    row.append(input); holder.append(row); return input;
  }
  function numeric(input) {
    const value = Number(input.value);
    if (!input.value.trim() || !Number.isSafeInteger(value) || value < Number(input.min) || value > Number(input.max)) {
      throw new RangeError(tr('invalid'));
    }
    return value;
  }
  function change(action, token = shownToken) {
    try { if (store.update(action, token)) render(); } catch { showAlert(tr('invalid')); }
  }
  function begin(state) {
    if (busy(state)) return;
    const template = getRoster().find(entry => entry.section === procedure.value);
    const opponent = editor.read()[0];
    if (!template || !opponent?.displayName.trim()) throw new RangeError(tr('invalid'));
    const player = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, numeric(input)]));
    state.fight = startMartialFight(player, {...template, name:opponent.displayName, displayName:opponent.displayName}, acknowledged.checked);
    return state;
  }
  function stop() {
    const token = shownToken;
    if (!token || !busy(token.state)) return;
    showConfirm(tr('cancelConfirm'), () => change(state => {
      state.fight = martialAction(state.fight, {kind:'cancel', expectedEvent:token.state.fight.events.length});
      return state;
    }, token));
  }
  function actionControls(state, token) {
    controls.replaceChildren();
    if (!busy(state)) return;
    const fight = state.fight, step = fight.opponent.steps.find(step => step.section === fight.step);
    const act = action => change(next => {
      next.fight = martialAction(next.fight, {expectedEvent:fight.events.length, ...action}); return next;
    }, token);
    if (fight.phase === 'continue') {
      button(controls, 'continue', () => act({kind:'continue', destination:fight.pending}), tr('continueAt', {section:fight.pending}));
      return;
    }
    if (fight.phase === 'finish') {
      button(controls, 'finish', () => act({kind:'continue'}), tr('confirmOutcome', {outcome:tr('status.' + step.outcome)}));
      return;
    }
    if (fight.phase === 'choice') {
      for (const choice of step.choices) button(controls, 'choice-' + choice.to,
        () => act({kind:'choice', destination:choice.to}), choice.label + ' (' + choice.to + ')');
      return;
    }
    const damage = step.damage[fight.damageIndex];
    if (fight.phase === 'damage' && !damage.dice) {
      button(controls, 'damage', () => act({kind:'damage'}), tr('applyDamage', {amount:damage.fixed}));
      return;
    }
    text(controls, fight.phase === 'damage' ? tr('damageRoll')
      : tr('check', {skill:tr(step.skill), target:step.target}));
    const spent = number(controls, 'spent', 0, fight.player.experience, 0);
    const die = number(controls, 'die', 1, 6); die.placeholder = tr('automatic');
    button(controls, 'roll', () => {
      try {
        act({kind:fight.phase === 'damage' ? 'damage' : 'roll', spent:numeric(spent),
          ...(die.value.trim() ? {die:numeric(die)} : {})});
      } catch { showAlert(tr('invalid')); }
    });
  }
  function report(state) {
    right.replaceChildren();
    const fight = state.fight;
    text(right, tr(fight ? 'status.' + fight.status : 'ready'), 'h4').className = 'bsim-side-title';
    if (fight) {
      text(right, fight.opponent.name);
      text(right, tr('totals', {hp:fight.player.hp, maxHp:fight.player.maxHp, experience:fight.player.experience}));
      text(right, tr('section', {section:fight.step}));
      if (fight.destination !== fight.step) text(right, tr('destination', {section:fight.destination}));
      if (fight.status === 'loss' && !fight.player.hp) text(right, tr(fight.opponent.training ? 'unconscious' : 'death'));
      text(right, tr('manualStory'));
    }
    text(right, tr('log'), 'h4').className = 'bsim-side-title';
    const log = document.createElement('div'); log.className = 'bsim-log'; right.append(log);
    for (const event of (fight?.events ?? []).slice(-100).reverse()) {
      const prefix = tr('section', {section:event.section}) + ': ';
      if (event.kind === 'roll') text(log, prefix + tr('rollLog', {die:event.die, spent:event.spent,
        total:event.total, result:tr(event.success ? 'passed' : 'failed')}));
      else if (event.kind === 'damage') text(log, prefix + tr('damageLog', {amount:event.amount, hp:event.hp}));
      else if (event.kind === 'cancel') text(log, tr('status.cancelled'));
      else if (event.destination) text(log, prefix + tr('destination', {section:event.destination}));
      else text(log, prefix + tr('status.' + fight.status));
    }
    text(right, tr('history'), 'h4').className = 'bsim-side-title';
    for (const item of state.history.slice(-30).reverse()) text(right, item.enemy + ' · ' + tr('status.' + item.outcome));
  }
  function render() {
    if (!overlay) return;
    const token = store.snapshot();
    if (!token) { shownToken = null; mountedRun = mountedState = null; close(); return; }
    const state = token.state, locked = busy(state);
    if (mountedRun !== token.run || mountedState !== token.original) {
      for (const [key, input] of Object.entries(fields)) input.value = state.player?.[key] ?? '';
      procedure.value = getRoster().find(entry => entry.section === state.opponent?.section)?.section ?? getRoster()[0].section;
      editor.set([state.opponent ?? {}]); acknowledged.checked = false;
      mountedRun = token.run; mountedState = token.original;
    }
    shownToken = token;
    for (const input of Object.values(fields)) input.disabled = locked;
    procedure.disabled = acknowledged.disabled = start.disabled = locked;
    editor.lock(locked); cancel.disabled = !locked;
    actionControls(state, token); report(state);
  }
  function open() {
    if (!store.snapshot()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    render(); overlay.classList.add('active');
  }
  function init() {
    if (overlay) return;
    overlay = document.createElement('div'); overlay.id = id + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent = t(definition.i18nPrefix + '.title');
    const closer = overlay.querySelector('.inv-close-btn'); closer.setAttribute('aria-label', t('btn.close')); closer.addEventListener('click', close);
    left = overlay.querySelector('.bsim-col-left'); right = overlay.querySelector('.bsim-col-right');
    text(left, tr('rules'));
    for (const key of ['maxHp','hp','prowess','perception','kenjutsu','experience']) {
      fields[key] = number(left, key, key === 'experience' ? 0 : 1, 1000000);
    }
    const row = document.createElement('label'); row.className = 'inv-edit-row'; text(row, tr('procedure'), 'span');
    procedure = document.createElement('select'); procedure.className = 'inv-edit-input'; procedure.id = id + '-procedure';
    for (const entry of getRoster()) {
      const option = document.createElement('option'); option.value = entry.section; option.textContent = tr('procedure.' + entry.key); procedure.append(option);
    }
    row.append(procedure); left.append(row);
    editor = createOpponentEditor({document, id, t, fields:[], presets:getRoster(), onSelect:entry => { procedure.value = entry.section; }});
    editor.fixCount(true); left.append(editor.element);
    const damageRow = document.createElement('label'); damageRow.className = 'inv-edit-row';
    acknowledged = document.createElement('input'); acknowledged.type = 'checkbox'; acknowledged.id = id + '-acknowledged';
    damageRow.append(acknowledged); text(damageRow, tr('acknowledged'), 'span'); left.append(damageRow);
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
