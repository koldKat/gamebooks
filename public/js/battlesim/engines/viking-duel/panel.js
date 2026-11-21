// Connect optional Viking duel setup and saved combat to the shared simulator dialog.
import {createQuestState} from '../super-endless-quest/state.js';
import {createD20Forms} from '../d20/forms.js';
import {decorateOutcome} from '../../outcome.js';

export function createVikingDuelPanel(getContext, {definition, combat, createSetup}) {
  const ctx = () => getContext();
  const ui = createD20Forms(document, definition.stateKey, key => ctx().t(definition.i18nPrefix + '.' + key));
  const store = createQuestState(() => ({...ctx(), definition}), {validateFight:combat.validateFight});
  let overlay, launch, right, controls, setup, start, cancel, token, mountedRun, mountedOriginal;
  const close = () => overlay?.classList.remove('active');
  const busy = state => state?.fight?.status === 'fighting';
  function change(callback, expected = token) {
    try {if (store.update(callback, expected)) render();}
    catch {ctx().showAlert(ui.tr('invalid'));}
  }
  function report(state) {
    right.replaceChildren();
    const fight = state.fight;
    if (fight) {
      ui.text(right, ui.tr('player') + ': ' + fight.player.energy + ' · ' + fight.opponent.name + ': '
        + (fight.opponent.energy ?? fight.opponent.base), 'h4').className = 'bsim-side-title';
      const log = document.createElement('div'); log.className = 'bsim-log'; right.append(log);
      for (const event of fight.events.slice().reverse()) {
        const line = event.kind === 'adjustment'
          ? ui.tr('adjustment') + ': ' + ui.tr('player') + ' ' + event.playerEnergy + ', ' + fight.opponent.name + ' ' + event.enemyEnergy
          : event.kind === 'choice' ? ui.tr('section') + ' ' + event.section + ' · ' + ui.tr('damage') + ' ' + event.playerDamage
          : ui.tr('round') + ' ' + event.round + ': ' + event.playerTotal + ' (' + event.playerDie + ') / '
            + event.enemyTotal + ' (' + event.enemyDie + ') · ' + ui.tr('damage') + ' ' + event.playerDamage + ' / ' + event.enemyDamage;
        ui.text(log, line).className = event.playerDamage ? 'bsim-log-danger'
          : event.enemyDamage ? 'bsim-log-success' : 'bsim-log-accent';
      }
      if (fight.result) {
        decorateOutcome(ui.text(right, ui.tr(fight.result) + (fight.rescued ? ' · ' + ui.tr('rescued') : fight.dead ? ' · ' + ui.tr('dead') : '')
          + (fight.destination ? ' · ' + ui.tr('section') + ' ' + fight.destination : '')), fight.result);
        ui.text(right, ui.tr('continueReader'));
      }
    } else ui.text(right, ui.tr('ready'));
    if (state.history.length) {
      const history = ui.group(right, 'history');
      for (const item of state.history.slice().reverse()) {
        decorateOutcome(ui.text(history, item.enemy + ' · ' + ui.tr(item.outcome) + ' · ' + item.rounds + ' ' + ui.tr('round')), item.outcome);
      }
    }
    for (const child of right.children) child.classList.add('bsim-report');
  }
  function render() {
    if (!overlay) return;
    const snapshot = store.snapshot();
    if (!snapshot) {token = null; mountedRun = mountedOriginal = null; close(); return;}
    if (mountedRun !== snapshot.run || mountedOriginal !== snapshot.original) {
      setup.restore(snapshot.state);
      mountedRun = snapshot.run; mountedOriginal = snapshot.original;
    }
    token = snapshot;
    const locked = busy(snapshot.state);
    setup.lock(locked); start.disabled = locked; cancel.disabled = !locked;
    controls.replaceChildren();
    if (locked) {
      const fight = snapshot.state.fight, revision = fight.revision;
      const send = values => change(state => {
        state.fight = combat.combatAction(state.fight, {expectedRevision:revision, ...values}); return state;
      }, snapshot);
      if (fight.pending) {
        ui.text(controls, ui.tr('ambiguous'));
        for (const choice of fight.pending) {
          const button = ui.button(controls, 'choose', () => send({kind:'choose', section:choice.section}));
          button.textContent = ui.tr('section') + ' ' + choice.section + ' · '
            + (choice.fatal ? ui.tr('dead') : ui.tr('damage') + ' ' + choice.damage);
          button.dataset.section = choice.section;
        }
      } else ui.button(controls, 'roll', () => send({kind:'round'}));
    }
    report(snapshot.state);
  }
  function init() {
    if (overlay) return;
    overlay = document.createElement('div'); overlay.id = definition.stateKey + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent = ui.tr('title');
    const closer = overlay.querySelector('.inv-close-btn'); closer.setAttribute('aria-label', ctx().t('btn.close')); closer.addEventListener('click', close);
    const left = overlay.querySelector('.bsim-col-left'); right = overlay.querySelector('.bsim-col-right');
    ui.text(left, ui.tr('rules')); setup = createSetup(left, ui, () => busy(store.snapshot()?.state));
    start = ui.button(left, 'start', () => change(state => {
      if (busy(state)) return null;
      const input = setup.read(); state.fight = combat.startFight(input.player, input.opponent, input.method);
      state.setup = {method:input.method, opponent:input.opponent}; state.history = state.history.slice(-199);
      return state;
    }));
    controls = document.createElement('div'); controls.id = definition.stateKey + '-controls'; left.append(controls);
    cancel = ui.button(left, 'cancel', () => {
      const expected = token;
      if (busy(expected?.state)) ctx().showConfirm(ui.tr('cancelConfirm'), () => change(state => {state.fight = null; return state;}, expected));
    });
    document.body.append(overlay);
    launch = document.createElement('button'); launch.id = definition.stateKey + '-btn'; launch.style.display = 'none';
    launch.innerHTML = ctx().shortcutLabel(ctx().t('battlesim.title')); ctx().getPlayBtnRow().append(launch);
    launch.addEventListener('click', () => {if (store.snapshot()) {render(); overlay.classList.add('active');}});
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
