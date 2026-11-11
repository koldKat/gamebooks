// Connect Curse of the Pharaoh's encounter controls to the current application run.
import {definition, ENCOUNTERS, loadRoster} from './definition.js';
import {createDragonPanel} from '../../engines/golden-dragon/panel.js';
import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
export const loadData = () => loadRoster(apiFetch);
const panel = createDragonPanel({document, definition, t, getRoster:() => ENCOUNTERS,
  getRun:currentPlaythrough, getBookId:() => currentBookId, saveState, getButtonRow:getPlayBtnRow, showAlert, showConfirm,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton:() => button, getOverlay:() => overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export const initSim390 = () => panel.init();
export const renderSim390 = () => panel.render();
export const setSim390Visible = value => panel.setVisible(value);
export {initSim390 as init, renderSim390 as render, setSim390Visible as setVisible};
