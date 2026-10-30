// Wire The Legion at War's optional fleet battle panel to the current playthrough.
import { currentBookId, currentPlaythrough, saveState, apiFetch } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { definition, getRoster, getPlayerDefaults, getCharts, loadRoster } from './definition.js';
import { createFleetPanel } from '../../engines/combat-command/fleet-panel.js';

const panel = createFleetPanel({ document, definition, getRoster, getPlayerDefaults, getCharts, t,
  getRun: currentPlaythrough, getBookId: () => currentBookId, saveState, getButtonRow: getPlayBtnRow, showAlert,
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  },
});
export const loadData = () => loadRoster(apiFetch);
export function initSim1471() { panel.init(); }
export function renderSim1471() { panel.render(); }
export function setSim1471Visible(value) { panel.setVisible(value); }
export { initSim1471 as init, renderSim1471 as render, setSim1471Visible as setVisible };
