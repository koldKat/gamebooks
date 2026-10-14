import { currentBookId, currentPlaythrough, saveState } from '../core/state.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { showAlert, showConfirm } from '../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { createShamutantiPanel } from './engines/shamutanti/panel.js';

const panel = createShamutantiPanel({ document, t, getRun: currentPlaythrough,
  getBookId: () => currentBookId, saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  },
});

export function initSim671() { panel.init(); }
export function renderSim671() { panel.render(); }
export function setSim671Visible(visible) { panel.setVisible(visible); }
