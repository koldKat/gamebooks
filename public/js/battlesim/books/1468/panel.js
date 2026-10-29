import { currentBookId, currentPlaythrough, saveState, apiFetch } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { definition, getRoster, getPlayerDefaults, getCharts, loadRoster } from './definition.js';
import { createCombatCommandEncounterPanel } from '../../engines/combat-command/encounter-panel.js';

const panel = createCombatCommandEncounterPanel({ document, definition, getRoster, getPlayerDefaults, getCharts, t,
  getRun:currentPlaythrough, getBookId:() => currentBookId, saveState, getButtonRow:getPlayBtnRow, showAlert, showConfirm,
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{ getButton:() => button, getOverlay:() => overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  },
});
export const loadData = () => loadRoster(apiFetch);
export function initSim1468() { panel.init(); }
export function renderSim1468() { panel.render(); }
export function setSim1468Visible(value) { panel.setVisible(value); }
export { initSim1468 as init, renderSim1468 as render, setSim1468Visible as setVisible };
