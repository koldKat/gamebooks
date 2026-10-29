import { currentBookId, currentPlaythrough, saveState, apiFetch } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { definition, getRoster, getPlayerDefaults, loadRoster } from './definition.js';
import { createDualSonicPanel } from '../../engines/sonic/dual-panel.js';

const panel = createDualSonicPanel({ document, definition, getRoster, getPlayerDefaults, t,
  getRun: currentPlaythrough, getBookId: () => currentBookId, saveState, getButtonRow: getPlayBtnRow, showAlert, showConfirm,
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  },
});
export const loadData = () => loadRoster(apiFetch);
export function initSim1449() { panel.init(); }
export function renderSim1449() { panel.render(); }
export function setSim1449Visible(value) { panel.setVisible(value); }
export { initSim1449 as init, renderSim1449 as render, setSim1449Visible as setVisible };
