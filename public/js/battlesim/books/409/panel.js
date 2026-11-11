// Connect The Altimer's optional combat panel to the active application run.
import {definition, ENCOUNTERS, loadRoster} from './definition.js';
import {createAltimerPanel} from '../../engines/altimer/panel.js';
import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
export const loadData = () => loadRoster(apiFetch);
const panel = createAltimerPanel({document, definition, t, getRoster: () => ENCOUNTERS,
  getRun: currentPlaythrough, getBookId: () => currentBookId, saveState, getButtonRow: getPlayBtnRow, showAlert, showConfirm,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export const initSim409 = () => panel.init();
export const renderSim409 = () => panel.render();
export const setSim409Visible = value => panel.setVisible(value);
export {initSim409 as init, renderSim409 as render, setSim409Visible as setVisible};
