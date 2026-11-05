// Connect the optional Castle Quarras encounter panel to the current application run.
import {definition, ENCOUNTERS, loadRoster} from './definition.js';
import {createQuestPanel} from '../../engines/super-endless-quest/panel.js';
import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

export const loadData = () => loadRoster(apiFetch);
const panel = createQuestPanel({document, definition, t, getRoster:() => ENCOUNTERS,
  getRun:currentPlaythrough, getBookId:() => currentBookId, saveState,
  getButtonRow:getPlayBtnRow, showAlert, showConfirm,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton:() => button, getOverlay:() => overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export const initSim1589 = () => panel.init();
export const renderSim1589 = () => panel.render();
export const setSim1589Visible = visible => panel.setVisible(visible);
export {initSim1589 as init, renderSim1589 as render, setSim1589Visible as setVisible};
