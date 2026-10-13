import { currentBookId, currentPlaythrough, saveState } from '../core/state.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { showAlert, showConfirm } from '../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { createOrcPowerPanel } from './engines/orc-power/panel.js';

const panel = createOrcPowerPanel({ document, t, getRun:currentPlaythrough,
  getBookId:() => currentBookId, saveState, showAlert, showConfirm, getButtonRow:getPlayBtnRow,
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton:() => button, getOverlay:() => overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  },
});

export function initSim654() { panel.init(); }
export function renderSim654() { panel.render(); }
export function setSim654Visible(visible) { panel.setVisible(visible); }
