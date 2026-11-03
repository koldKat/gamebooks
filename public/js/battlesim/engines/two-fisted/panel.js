// Connect optional Two-Fisted encounters and recovery to the active book's saved playthrough.
import {createTwoFistedState, twoFistedFightActive} from './state.js';
import {startGroundFight} from './ground.js';
import {startSpaceFight, spacePlayer} from './space.js';
import {createTwoFistedSetup} from './setup-panel.js';
import {renderTwoFistedActions} from './actions-panel.js';
import {renderTwoFistedReport} from './report.js';
import {twoFistedFields} from './panel-fields.js';

export function createTwoFistedPanel({document, definition, t, getRoster, getSupport, getRun, getBookId,
  saveState, getButtonRow, showAlert, showConfirm, registerShortcut = () => {}}) {
  const id = definition.stateKey, ui = twoFistedFields(document, id);
  const store = createTwoFistedState(() => ({definition, run: getRun(), bookId: getBookId(), saveState}));
  let overlay, launch, setupRoot, setup, controls, right, start, save, shown, mountedRun, mountedState;
  const close = () => overlay?.classList.remove('active');
  function change(update, token = shown) {
    try {if (store.update(update, token)) render();}
    catch (error) {showAlert(error instanceof RangeError ? error.message : 'Check the combat values and printed conditions for this action.');}
  }
  function begin(state) {
    if (twoFistedFightActive(state.fight)) return false;
    const player = setup.readPlayer(state.player ?? undefined), combat = setup.readEncounter();
    state.fight = combat.mode === 'space' ? startSpaceFight(player, combat) : startGroundFight(player, combat);
    state.encounter = combat.section; state.setup = setup.snapshot(); state.opponentSetup = state.setup.opponents;
    return state;
  }
  function render() {
    if (!overlay) return;
    let token;
    try {token = store.snapshot();} catch {showAlert('The saved encounter could not be read. Its data has been retained.'); return;}
    if (!token) {close(); return;}
    shown = token;
    const state = token.state, active = twoFistedFightActive(state.fight);
    if (mountedRun !== token.run) {
      setup.restore(state.setup);
      setup.fillPlayer(state.player ?? spacePlayer({...getSupport().playerDefaults, inventory: {}, ship: getSupport().shipDefaults[0]}));
      mountedRun = token.run; mountedState = token.original;
    } else if (mountedState !== token.original) {
      setup.fillPlayer(state.player); mountedState = token.original;
    }
    setup.lock(active); start.disabled = active; save.disabled = active;
    renderTwoFistedActions({document, root: controls, id, state, getSupport, readPlayer: setup.readPlayer,
      change: update => change(update, token),
      confirmCancel(action) {showConfirm('Cancel this encounter? Current combat costs and injuries will be kept.', action);}});
    renderTwoFistedReport(document, right, state);
  }
  function open() {
    if (!store.snapshot()) {showAlert(t('battlesim.no_active_playthrough')); return;}
    render(); overlay.classList.add('active');
  }
  function init() {
    if (overlay) return;
    overlay = document.createElement('div'); overlay.id = id + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent = definition.title;
    const exit = overlay.querySelector('.inv-close-btn'); exit.setAttribute('aria-label', t('btn.close')); exit.addEventListener('click', close);
    const left = overlay.querySelector('.bsim-col-left'); right = overlay.querySelector('.bsim-col-right');
    setupRoot = document.createElement('div'); left.append(setupRoot);
    setup = createTwoFistedSetup({document, root: setupRoot, id, t, getRoster, getSupport});
    ui.text(left, 'An optional combat tool. Read and apply story choices and noncombat consequences yourself.');
    start = ui.button(left, 'Start encounter', () => change(begin), 'start');
    save = ui.button(left, 'Save current combat stats', () => change(state => {
      if (twoFistedFightActive(state.fight)) return false;
      state.player = setup.readPlayer(state.player ?? undefined); state.setup = setup.snapshot(); state.opponentSetup = state.setup.opponents; return state;
    }), 'save-stats');
    controls = document.createElement('div'); controls.id = id + '-actions'; left.append(controls); document.body.append(overlay);
    launch = document.createElement('button'); launch.id = id + '-btn'; launch.type = 'button'; launch.className = 'btn btn-secondary';
    launch.textContent = t('battlesim.title'); launch.addEventListener('click', open); getButtonRow()?.append(launch);
    registerShortcut({button: launch, overlay, open, close});
    let backdrop = false;
    overlay.addEventListener('mousedown', event => {backdrop = event.target === overlay;});
    overlay.addEventListener('click', event => {if (backdrop && event.target === overlay) close();});
    overlay.addEventListener('keydown', event => {if (event.key === 'Escape') {event.stopPropagation(); close();}});
  }
  return {init, render, setVisible(value) {if (launch) launch.style.display = value ? '' : 'none'; if (!value) close();}};
}
