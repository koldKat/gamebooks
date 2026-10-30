// Wire the optional Black Road War combat sheet to the active playthrough.
import { currentBookId, currentPlaythrough, saveState, apiFetch } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { definition, getRoster, getPlayerDefaults, getCharts, loadRoster } from './definition.js';
import { createCombatCommandEncounterPanel } from '../../engines/combat-command/encounter-panel.js';

const panel=createCombatCommandEncounterPanel({document,definition,getRoster,getPlayerDefaults,getCharts,t,
  getRun:currentPlaythrough,getBookId:()=>currentBookId,saveState,getButtonRow:getPlayBtnRow,showAlert,showConfirm,
  registerShortcut({button,overlay,open,close}){
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  },
});
export const loadData=()=>loadRoster(apiFetch);
export function initSim1472(){panel.init();}
export function renderSim1472(){panel.render();}
export function setSim1472Visible(value){panel.setVisible(value);}
export { initSim1472 as init, renderSim1472 as render, setSim1472Visible as setVisible };
