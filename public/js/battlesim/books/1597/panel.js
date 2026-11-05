// Connect Clash of the Sorcerers's optional combat procedures to the current application run.
import {definition, ENCOUNTERS, RULES, loadRoster} from './definition.js';
import {createProcedurePanel} from '../../engines/procedural-quest/panel.js';
import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

export const loadData = () => loadRoster(apiFetch);
const panel = createProcedurePanel({document, definition, t, getRoster:() => ENCOUNTERS, getRules:() => RULES,
  getRun:currentPlaythrough, getBookId:() => currentBookId, saveState,
  getButtonRow:getPlayBtnRow, showAlert, showConfirm,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton:() => button, getOverlay:() => overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export const initSim1597 = () => panel.init();
export const renderSim1597 = () => panel.render();
export const setSim1597Visible = visible => panel.setVisible(visible);
export {initSim1597 as init, renderSim1597 as render, setSim1597Visible as setVisible};
