// Connect the Blackwood Moors combat panel to the current book and run.
import {currentBookId, currentPlaythrough, saveState} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {definition, encounters} from './definition.js';
import {createDominionsPanel} from '../../engines/dungeons-to-dominions/panel.js';

const panel = createDominionsPanel({document, definition, t, getRoster:() => encounters,
  getRun:currentPlaythrough, getBookId:() => currentBookId, saveState,
  getButtonRow:getPlayBtnRow, showAlert, showConfirm,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    button.setAttribute('aria-keyshortcuts', 'S');
    registerPanelShortcut('KeyS', {getButton:() => button, getOverlay:() => overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close});
  },
});
export function initSim551() {panel.init();}
export function renderSim551() {panel.render();}
export function setSim551Visible(visible) {panel.setVisible(visible);}
export {initSim551 as init, renderSim551 as render, setSim551Visible as setVisible};
