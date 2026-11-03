// Bind Star Bastards' combat panel to live application and playthrough dependencies.
import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {definition, getRoster, getSupport, loadRoster} from './definition.js';
import {createTwoFistedPanel} from '../../engines/two-fisted/panel.js';

const panel = createTwoFistedPanel({document, definition, t, getRoster, getSupport, getRun: currentPlaythrough,
  getBookId: () => currentBookId, saveState, getButtonRow: getPlayBtnRow, showAlert, showConfirm,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export const loadData = () => loadRoster(apiFetch);
export function initSim1527() {panel.init();}
export function renderSim1527() {panel.render();}
export function setSim1527Visible(value) {panel.setVisible(value);}
export {initSim1527 as init, renderSim1527 as render, setSim1527Visible as setVisible};
