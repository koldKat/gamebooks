// Wire the book's optional numerical duels to the active run using shared simulator controls.
import {currentBookId, currentPlaythrough, saveState} from '../../run-context.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {createOpponentEditor} from '../../opponents.js';
import {createVikingDuelPanel} from '../../engines/viking-duel/panel.js';
import {definition, encounters, customEncounter} from './definition.js';
import * as combat from './combat.js';

function createSetup(left, ui, busy) {
  const strength = ui.field(left, 'strength', {type:'number', value:4, min:1});
  const energy = ui.field(left, 'energy', {type:'number', value:3, min:1});
  const strengthFactor = ui.field(left, 'strengthFactor', {type:'number', value:2, min:1, max:10});
  const energyFactor = ui.field(left, 'energyFactor', {type:'number', value:2, min:1, max:10});
  const method = ui.field(left, 'method', {value:'opposed', entries:[['opposed', ui.tr('opposed')],
    ['quick', ui.tr('quick')], ['extended', ui.tr('extended')]]});
  const isRagnar = () => method.value !== 'opposed';
  function layout() {
    for (const input of [strengthFactor, energyFactor]) input.parentElement.hidden = isRagnar();
    for (const input of editor.element.querySelectorAll('[data-stat]')) {
      input.closest('label').hidden = isRagnar() ? input.dataset.stat === 'enemyBase' : input.dataset.stat !== 'enemyBase';
    }
  }
  const editor = createOpponentEditor({document, id:definition.stateKey, t, language:'bg',
    fields:[{key:'enemyBase', label:ui.tr('enemyBase'), min:0},
      {key:'strength', label:ui.tr('strength'), min:1}, {key:'energy', label:ui.tr('energy'), min:1}],
    presets:encounters.map(entry => ({...entry, displayName:entry.name})),
    isStatUnavailable:(key, row) => row.kind === 'ragnar' ? key === 'enemyBase' : key !== 'enemyBase',
    onSelect(entry) {
      if (entry.kind === 'opposed') {
        method.value = 'opposed'; strengthFactor.value = entry.strengthFactor; energyFactor.value = entry.energyFactor;
      } else if (method.value === 'opposed') method.value = 'extended';
      method.dispatchEvent(new Event('change', {bubbles:true}));
      layout();
    }});
  editor.fixCount(true); left.append(editor.element);
  method.addEventListener('change', () => {
    if (busy()) return;
    const row = editor.snapshot()[0], kind = isRagnar() ? 'ragnar' : 'opposed';
    if (row.kind !== kind) {
      const source = kind === 'ragnar' ? encounters.find(entry => entry.kind === 'ragnar') : customEncounter;
      editor.set([{...source, displayName:row.displayName,
        ...(kind === 'opposed' ? {enemyBase:18} : {})}]);
    }
    layout();
  });
  return {
    read() {
      const row = editor.read()[0];
      const opponent = {...row, name:row.displayName.trim() || ui.tr('enemy'), kind:isRagnar() ? 'ragnar' : 'opposed'};
      if (!isRagnar()) {
        opponent.strengthFactor = ui.number(strengthFactor); opponent.energyFactor = ui.number(energyFactor);
      }
      return {player:{strength:ui.number(strength), energy:ui.number(energy)}, opponent,
        method:method.value === 'opposed' ? 'quick' : method.value};
    },
    restore(state) {
      strength.value = state.player?.strength ?? 4; energy.value = state.player?.energy ?? 3;
      const opponent = state.setup?.opponent ?? {...customEncounter, displayName:''};
      method.value = opponent.kind === 'ragnar' ? state.setup.method : 'opposed';
      strengthFactor.value = opponent.strengthFactor ?? 2; energyFactor.value = opponent.energyFactor ?? 2;
      editor.set([opponent]); method.dispatchEvent(new Event('change', {bubbles:true})); layout();
    },
    lock(locked) {
      for (const input of [strength, energy, strengthFactor, energyFactor, method]) input.disabled = locked;
      editor.lock(locked);
    },
  };
}

const panel = createVikingDuelPanel(() => ({bookId:currentBookId, run:currentPlaythrough(), saveState,
  getPlayBtnRow, showAlert, showConfirm, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS, t}),
{definition, combat, createSetup});
export const {init, render, setVisible} = panel;
export const initSim732 = init, renderSim732 = render, setSim732Visible = setVisible;
