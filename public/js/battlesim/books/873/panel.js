import {definition, ENCOUNTERS} from './definition.js';
import {createDoubleAgentPanel as createSharedPanel} from '../../engines/lucas-grey/panel.js';
import {currentBookId, currentPlaythrough, saveState} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

export function createDoubleAgentPanel(dependencies) {
  return createSharedPanel({...dependencies, definition, encounters: ENCOUNTERS});
}

const panel = createDoubleAgentPanel({document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {getButton: () => button, getOverlay: () => overlay, otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  }});
export function initSim873() {panel.init();}
export function renderSim873() {panel.render();}
export function setSim873Visible(visible) {panel.setVisible(visible);}
export { initSim873 as init, renderSim873 as render, setSim873Visible as setVisible };
