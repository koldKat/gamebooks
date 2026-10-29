import { currentBookId, currentPlaythrough, saveState, apiFetch } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { definition, getRoster, getPlayerDefaults, loadRoster } from './definition.js';
import { createWarhammerPanel } from '../../engines/warhammer/panel.js';

const panel = createWarhammerPanel({document,definition,getRoster,getPlayerDefaults,t,
  getRun:currentPlaythrough,getBookId:() => currentBookId,saveState,getButtonRow:getPlayBtnRow,showAlert,showConfirm,
  registerShortcut({button,overlay,open,close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:() => button,getOverlay:() => overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id),open,close});
  },
});
export const loadData = () => loadRoster(apiFetch);
export function initSim1454() { panel.init(); }
export function renderSim1454() { panel.render(); }
export function setSim1454Visible(value) { panel.setVisible(value); }
export { initSim1454 as init, renderSim1454 as render, setSim1454Visible as setVisible };
