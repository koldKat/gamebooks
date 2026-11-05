// Connect the optional Test of the Ninja combat panel to the current application run.
import {definition, ENCOUNTERS, loadRoster} from './definition.js';
import {createMartialPanel} from '../../engines/martial-quest/panel.js';
import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

export const loadData = () => loadRoster(apiFetch);
const panel = createMartialPanel({document, definition, t, getRoster:() => ENCOUNTERS,
  getRun:currentPlaythrough, getBookId:() => currentBookId, saveState,
  getButtonRow:getPlayBtnRow, showAlert, showConfirm,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton:() => button, getOverlay:() => overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export const initSim1591 = () => panel.init();
export const renderSim1591 = () => panel.render();
export const setSim1591Visible = visible => panel.setVisible(visible);
export {initSim1591 as init, renderSim1591 as render, setSim1591Visible as setVisible};
