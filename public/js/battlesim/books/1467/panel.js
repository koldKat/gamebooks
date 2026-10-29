import { currentBookId, currentPlaythrough, saveState, apiFetch } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { definition, getRoster, getPlayerDefaults, getCharts, loadRoster } from './definition.js';
import { createCombatCommandPanel } from '../../engines/combat-command/panel.js';

const panel = createCombatCommandPanel({ document, definition, getRoster, getPlayerDefaults, getCharts, t,
  getRun:currentPlaythrough, getBookId:() => currentBookId, saveState, getButtonRow:getPlayBtnRow, showAlert, showConfirm,
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{ getButton:() => button, getOverlay:() => overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  },
});
export const loadData = () => loadRoster(apiFetch);
export function initSim1467() { panel.init(); }
export function renderSim1467() { panel.render(); }
export function setSim1467Visible(value) { panel.setVisible(value); }
export { initSim1467 as init, renderSim1467 as render, setSim1467Visible as setVisible };
