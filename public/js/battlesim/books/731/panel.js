// Wire Erik's final duel to the active run through the shared Viking duel panel.
import {currentBookId, currentPlaythrough, saveState} from '../../run-context.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {createOpponentEditor} from '../../opponents.js';
import {createVikingDuelPanel} from '../../engines/viking-duel/panel.js';
import {definition, encounters} from './definition.js';
import * as combat from './combat.js';

function createSetup(left, ui) {
  const strength = ui.field(left, 'strength', {type:'number', value:10, min:1});
  const energy = ui.field(left, 'energy', {type:'number', value:5, min:1});
  const method = ui.field(left, 'method', {value:'extended', entries:[['extended', ui.tr('extended')], ['quick', ui.tr('quick')]]});
  const editor = createOpponentEditor({document, id:definition.stateKey, t, language:'bg',
    fields:[{key:'strength', label:ui.tr('strength'), min:1}, {key:'energy', label:ui.tr('energy'), min:1}],
    presets:encounters.map(entry => ({...entry, displayName:entry.name}))});
  editor.fixCount(true); editor.set([{strength:10, energy:5}]); left.append(editor.element);
  return {
    read() {
      const row = editor.read()[0];
      return {player:{strength:ui.number(strength), energy:ui.number(energy)},
        opponent:{...row, name:row.displayName.trim() || ui.tr('enemy')}, method:method.value};
    },
    restore(state) {
      strength.value = state.player?.strength ?? 10; energy.value = state.player?.energy ?? 5;
      method.value = state.setup?.method ?? 'extended';
      editor.set([state.setup?.opponent ?? {strength:10, energy:5}]);
      method.dispatchEvent(new Event('change', {bubbles:true}));
    },
    lock(locked) {for (const input of [strength, energy, method]) input.disabled = locked; editor.lock(locked);},
  };
}

const panel = createVikingDuelPanel(() => ({bookId:currentBookId, run:currentPlaythrough(), saveState,
  getPlayBtnRow, showAlert, showConfirm, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS, t}),
{definition, combat, createSetup});
export const {init, render, setVisible} = panel;
export const initSim731 = init, renderSim731 = render, setSim731Visible = setVisible;
