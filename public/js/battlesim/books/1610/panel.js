import {definition, ENCOUNTERS, RULES, loadRoster} from './definition.js';
import {createKingfisherPanel} from '../../engines/kingfisher/panel.js';
import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../run-context.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

export const loadData = () => loadRoster(apiFetch);
const panel = createKingfisherPanel({
  document, definition, t, getRoster:() => ENCOUNTERS, getRules:() => RULES,
  getRun:currentPlaythrough, getBookId:() => currentBookId, saveState, getButtonRow:getPlayBtnRow, showAlert, showConfirm,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {
      getButton:() => button, getOverlay:() => overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close,
    });
  },
});

export const initSim1610 = () => panel.init();
export const renderSim1610 = () => panel.render();
export const setSim1610Visible = visible => panel.setVisible(visible);
export {initSim1610 as init, renderSim1610 as render, setSim1610Visible as setVisible};
