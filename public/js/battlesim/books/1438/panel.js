import {currentBookId,currentPlaythrough,saveState,apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert,showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut,shortcutLabel,ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {definition,getRoster,loadRoster} from './definition.js';
import {createTolkienQuestPanel} from '../../engines/tolkien-quest/panel.js';
const panel=createTolkienQuestPanel({document,definition,getRoster,t,getRun:currentPlaythrough,getBookId:()=>currentBookId,saveState,getButtonRow:getPlayBtnRow,showAlert,showConfirm,registerShortcut({button,overlay,open,close}){
  button.innerHTML=shortcutLabel(t('battlesim.title'));
  registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
}});
export const loadData=()=>loadRoster(apiFetch);
export function initSim1438(){panel.init();}
export function renderSim1438(){panel.render();}
export function setSim1438Visible(value){panel.setVisible(value);}
export {initSim1438 as init,renderSim1438 as render,setSim1438Visible as setVisible};
