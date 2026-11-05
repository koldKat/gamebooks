// Present encounter setup, declared experience, dice and combat results.
import {createOpponentEditor} from '../../opponents.js';
import {startQuestFight, questRoll, exitQuestFight} from './core.js';
import {createQuestState} from './state.js';
import {startStagedQuestFight, stagedQuestAction} from './steps.js';

export function createQuestPanel({document, definition, t, getRoster, getRun, getBookId,
  saveState, getButtonRow, showAlert, showConfirm, registerShortcut = () => {}}) {
  const id = definition.stateKey, tr = (key, values) => t('battlesim.superEndless.' + key, values);
  const store = createQuestState(() => ({run:getRun(), bookId:getBookId(), definition, saveState}));
  let overlay, launch, left, right, editor, start, cancel, custom, controls, shownToken, mountedRun, mountedState;
  const fields = {}, modifiers = {}, staged = definition.combatMode === 'staged';
  let damageAcknowledged;
  const busy = state => state.fight?.status === 'fighting';
  const close = () => overlay?.classList.remove('active');
  function number(holder, key, min, max, value = '') {
    const row = document.createElement('label'), label = document.createElement('span'), input = document.createElement('input');
    row.className = 'inv-edit-row'; label.textContent = tr(key);
    input.type = 'number'; input.min = min; input.max = max; input.step = 1;
    input.className = 'inv-edit-input'; input.autocomplete = 'off'; input.id = id + '-' + key; input.value = value;
    row.append(label, input); holder.append(row); return input;
  }
  function numeric(input) {
    const value = Number(input.value);
    if (!input.value.trim() || !Number.isSafeInteger(value) || value < Number(input.min) || value > Number(input.max)) {
      throw new RangeError(tr('invalid'));
    }
    return value;
  }
  function checkbox(holder, key) {
    const row = document.createElement('label'), input = document.createElement('input'), label = document.createElement('span');
    row.className = 'inv-edit-row'; input.type = 'checkbox'; input.id = id + '-' + key;
    label.textContent = tr(key); row.append(label, input); holder.append(row); return input;
  }
  function button(holder, key, action) {
    const node = document.createElement('button'); node.type = 'button'; node.className = 'bsim-action-btn';
    node.id = id + '-' + key; node.textContent = tr(key); node.addEventListener('click', action); holder.append(node); return node;
  }
  function change(action, token = shownToken) {
    try { if (store.update(action, token)) render(); } catch { showAlert(tr('invalid')); }
  }
  function begin(state) {
    if (busy(state)) return;
    const opponents = editor.read();
    if (opponents.length !== 1) throw new RangeError('One aggregate encounter is required');
    const player = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, numeric(input)]));
    if (staged && opponents[0].steps) {
      const opponent = structuredClone(opponents[0]);
      opponent.steps.find(step => step.section === opponent.section).target = opponent.target;
      for (const [key, input] of Object.entries(modifiers)) player[key] = input.checked;
      state.fight = startStagedQuestFight(player, opponent, damageAcknowledged.checked);
    } else state.fight = startQuestFight(player, opponents[0]);
    return state;
  }
  function stop() {
    const token = shownToken;
    if (!token || !busy(token.state)) return;
    showConfirm(tr('cancelConfirm'), () => change(state => {
      state.fight = state.fight.rulesVersion === 2
        ? stagedQuestAction(state.fight, {kind:'cancel', expectedEvent:token.state.fight.events.length})
        : exitQuestFight(state.fight, 'cancelled', token.state.fight.events.length); return state;
    }, token));
  }
  function stagedControls(fight, token) {
    const count = fight.events.length;
    const act = action => change(next => {
      next.fight = stagedQuestAction(next.fight, {expectedEvent:count, ...action}); return next;
    }, token);
    if (fight.phase === 'continue') {
      const node = button(controls, 'continue', () => act({kind:'continue', destination:fight.pending}));
      node.textContent = tr('continueAt', {section:fight.pending}); return;
    }
    const step = fight.opponent.steps.find(step => step.section === fight.step);
    if (fight.phase === 'choice') {
      for (const target of step.choices) {
        const node = button(controls, 'choice-' + target.destination, () => act({kind:'choice', destination:target.destination}));
        node.textContent = tr(target.outcome === 'fled' ? 'leaveAt' : 'continueAt', {section:target.destination});
      }
      return;
    }
    const note = document.createElement('p');
    note.textContent = tr('checkNote', {section:step.section, dice:step.dice, skill:tr(step.skill), target:step.target}); controls.append(note);
    const spent = number(controls, 'spent', 0, fight.player.experience, 0);
    const dice = Array.from({length:step.dice}, (_, index) => number(controls, 'die' + (index + 1), 1, 6));
    for (const input of dice) input.placeholder = tr('automatic');
    button(controls, 'attack', () => {
      try {
        act({kind:'roll', spent:numeric(spent), ...(dice.some(input => input.value.trim()) ? {dice:dice.map(numeric)} : {})});
      } catch { showAlert(tr('invalid')); }
    });
  }
  function actionControls(state, token) {
    controls.replaceChildren();
    if (!busy(state)) return;
    const fight = state.fight, count = fight.events.length, save = fight.phase === 'save';
    if (fight.rulesVersion === 2) { stagedControls(fight, token); return; }
    const note = document.createElement('p'); note.textContent = tr(save ? 'saveNote' : 'attackNote'); controls.append(note);
    const spent = number(controls, 'spent', 0, fight.player.experience, 0);
    const d1 = number(controls, 'die1', 1, 6), d2 = number(controls, 'die2', 1, 6);
    d1.placeholder = d2.placeholder = tr('automatic');
    const roll = button(controls, save ? 'save' : 'attack', () => change(next => {
      const manual = Boolean(d1.value.trim() || d2.value.trim());
      next.fight = questRoll(next.fight, {expectedEvent:count, spent:numeric(spent),
        ...(manual ? {dice:[numeric(d1), numeric(d2)]} : {})}); return next;
    }, token));
    roll.disabled = !save && fight.player.hp < (fight.opponent.minimumHpToFight ?? 1);
    if (roll.disabled) {
      const weak = document.createElement('p'); weak.textContent = tr('tooWeak'); controls.append(weak);
    }
    if (save) return;
    for (const [key, route] of [['loss','loseSection'], ['fled','fleeSection'], ['surrendered','surrenderSection']]) {
      if (!fight.opponent[route]) continue;
      const node = button(controls, key, () => change(next => {
        next.fight = exitQuestFight(next.fight, key, count); return next;
      }, token));
      node.disabled = key === 'loss' && !fight.events.some(event => event.kind === 'attack' && !event.success)
        || key === 'fled' && fight.player.hp < (fight.opponent.minimumHpToFlee ?? 1);
    }
  }
  function report(state) {
    right.replaceChildren();
    const add = (holder, text, tag = 'p') => {
      const node = document.createElement(tag); node.textContent = text; holder.append(node); return node;
    };
    const fight = state.fight;
    add(right, tr(fight ? 'status.' + fight.status : 'ready'), 'h4').className = 'bsim-side-title';
    if (fight) {
      add(right, fight.opponent.name);
      add(right, tr('totals', {hp:fight.player.hp, maxHp:fight.player.maxHp, experience:fight.player.experience}));
      if (fight.destination) add(right, tr('destination', {section:fight.destination}));
      add(right, tr('manualStory'));
    }
    add(right, tr('log'), 'h4').className = 'bsim-side-title';
    const log = document.createElement('div'); log.className = 'bsim-log'; right.append(log);
    for (const event of (fight?.events ?? []).slice(-100).reverse()) {
      if (event.kind === 'exit') add(log, tr('status.' + event.action));
      else if (event.kind === 'cancel') add(log, tr('status.cancelled'));
      else if (event.kind === 'continue' || event.kind === 'choice') add(log, tr('continueAt', {section:event.destination}));
      else add(log, tr('rollLog', {kind:tr(event.kind), dice:event.dice.join(' + '), spent:event.spent,
        total:event.total, target:event.target, result:tr(event.success ? 'hit' : 'miss'), hp:event.hp}));
    }
    add(right, tr('history'), 'h4').className = 'bsim-side-title';
    for (const item of state.history.slice(-30).reverse()) add(right, item.enemy + ' · ' + tr('status.' + item.outcome));
  }
  function render() {
    if (!overlay) return;
    const token = store.snapshot();
    if (!token) { shownToken = null; mountedRun = mountedState = null; close(); return; }
    const state = token.state, locked = busy(state);
    if (mountedRun !== token.run || mountedState !== token.original) {
      for (const [key, input] of Object.entries(fields)) input.value = state.player?.[key] ?? (staged && key === 'agility' ? 1 : '');
      for (const [key, input] of Object.entries(modifiers)) input.checked = state.player?.[key] ?? false;
      if (damageAcknowledged) damageAcknowledged.checked = false;
      editor.set([state.opponent ?? {}]); mountedRun = token.run; mountedState = token.original;
    }
    shownToken = token;
    for (const input of Object.values(fields)) input.disabled = locked;
    for (const input of Object.values(modifiers)) input.disabled = locked;
    if (damageAcknowledged) damageAcknowledged.disabled = locked;
    editor.lock(locked); start.disabled = custom.disabled = locked; cancel.disabled = !locked;
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
    const note = document.createElement('p'); note.textContent = tr(staged ? 'stagedRules' : 'rules'); left.append(note);
    for (const key of ['maxHp', 'hp', 'fighting', 'experience']) fields[key] = number(left, key, key === 'experience' ? 0 : 1, 1000000);
    if (staged) {
      fields.agility = number(left, 'agility', 1, 1000000, 1);
      for (const key of ['sword','cloak','gem']) modifiers[key] = checkbox(left, key);
      damageAcknowledged = checkbox(left, 'damageAcknowledged');
    }
    editor = createOpponentEditor({document, id, t,
      fields:[{key:'target', label:tr('target'), min:2}, {key:'damageOnMiss', label:tr('damageOnMiss'), min:1}],
      presets:getRoster().map(entry => ({...entry, displayName:entry.name + ' (' + entry.section + ')'})),
      ...(staged ? {isStatUnavailable:(key, row) => key === 'damageOnMiss' && Boolean(row.steps)} : {})});
    editor.fixCount(true); left.append(editor.element);
    custom = button(left, 'custom', () => { if (!busy(shownToken?.state ?? {})) editor.set([{}]); });
    start = button(left, 'start', () => change(begin));
    controls = document.createElement('div'); controls.id = id + '-controls'; left.append(controls);
    cancel = button(left, 'cancel', stop);
    document.body.append(overlay);
    launch = document.createElement('button'); launch.id = id + '-btn'; launch.style.display = 'none';
    getButtonRow().append(launch); launch.addEventListener('click', open); registerShortcut({button:launch, overlay, open, close});
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
  }
  return {init, render, setVisible(visible) { if (launch) launch.style.display = visible ? '' : 'none'; if (!visible) close(); }};
}
