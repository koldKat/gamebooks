import { currentBookId, currentPlaythrough, saveState } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { createCrownPanel } from '../../engines/legendary-kingdoms/crown-panel.js';

const panel = createCrownPanel({document,t,getRun:currentPlaythrough,getBookId:() => currentBookId,
  saveState,showAlert,showConfirm,getButtonRow:getPlayBtnRow,
  registerShortcut({button,overlay,open,close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:() => button,getOverlay:() => overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id),open,close});
  },
});

export function initSim690() {panel.init();}
export function renderSim690() {panel.render();}
export function setSim690Visible(visible) {panel.setVisible(visible);}
export { initSim690 as init, renderSim690 as render, setSim690Visible as setVisible };
