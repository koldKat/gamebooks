// Wire Dorsai’s optional personnel combat sheet to the current playthrough.
import { currentBookId,currentPlaythrough,saveState,apiFetch } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert,showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut,shortcutLabel,ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { definition,getRoster,getCharts,getPlayerDefaults,loadRoster } from './definition.js';
import { createPersonnelPanel } from '../../engines/combat-command/personnel-panel.js';

const panel=createPersonnelPanel({document,definition,getRoster,getCharts,getPlayerDefaults,t,
  getRun:currentPlaythrough,getBookId:()=>currentBookId,saveState,getButtonRow:getPlayBtnRow,showAlert,showConfirm,
  registerShortcut({button,overlay,open,close}){
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  }});
export const loadData=()=>loadRoster(apiFetch);
export function initSim1474(){panel.init();}
export function renderSim1474(){panel.render();}
export function setSim1474Visible(value){panel.setVisible(value);}
export {initSim1474 as init,renderSim1474 as render,setSim1474Visible as setVisible};
