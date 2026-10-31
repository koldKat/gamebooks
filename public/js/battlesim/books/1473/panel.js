// Wire Lord of Lances' optional formation combat sheet to the active playthrough.
import { currentBookId,currentPlaythrough,saveState,apiFetch } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert,showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut,shortcutLabel,ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { definition,getRoster,getCharts,getPlayerDefaults,getUnitProfiles,loadRoster } from './definition.js';
import { createFormationPanel } from '../../engines/combat-command/formation-panel.js';

const panel=createFormationPanel({document,definition,getRoster,getCharts,getPlayerDefaults,getUnitProfiles,t,
  getRun:currentPlaythrough,getBookId:()=>currentBookId,saveState,getButtonRow:getPlayBtnRow,showAlert,showConfirm,
  registerShortcut({button,overlay,open,close}){
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  }});
export const loadData=()=>loadRoster(apiFetch);
export function initSim1473(){panel.init();}
export function renderSim1473(){panel.render();}
export function setSim1473Visible(value){panel.setVisible(value);}
export {initSim1473 as init,renderSim1473 as render,setSim1473Visible as setVisible};
