// Connect optional Black Sun encounters to the active book and playthrough.
import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {definition, getRoster, getSupport, loadRoster} from './definition.js';
import {createBlackSunPanel} from '../../engines/black-sun/panel.js';

const panel = createBlackSunPanel({document, definition, t, getRoster, getSupport, getRun: currentPlaythrough,
  getBookId: () => currentBookId, saveState, getButtonRow: getPlayBtnRow, showAlert, showConfirm,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export const loadData = () => loadRoster(apiFetch);
export function initSim1525() {panel.init();}
export function renderSim1525() {panel.render();}
export function setSim1525Visible(value) {panel.setVisible(value);}
export {initSim1525 as init, renderSim1525 as render, setSim1525Visible as setVisible};
