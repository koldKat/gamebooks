// Bind Green Hydra combat to the current book and live playthrough dependencies.
import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {definition, getRoster, loadRoster} from './definition.js';
import {createSagardPanel} from '../../engines/sagard/panel.js';

const panel = createSagardPanel({document, definition, t, getRoster, getRun: currentPlaythrough,
  getBookId: () => currentBookId, saveState, getButtonRow: getPlayBtnRow, showAlert, showConfirm,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export const loadData = () => loadRoster(apiFetch);
export function initSim1542() {panel.init();}
export function renderSim1542() {panel.render();}
export function setSim1542Visible(value) {panel.setVisible(value);}
export {initSim1542 as init, renderSim1542 as render, setSim1542Visible as setVisible};
