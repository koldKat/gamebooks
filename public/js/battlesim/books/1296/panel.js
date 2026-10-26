import {currentBookId,currentPlaythrough,saveState,apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert,showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut,shortcutLabel,ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {definition,getRoster,loadRoster} from './definition.js';
import {createState} from './state.js';
import {createCrossroadsPanel} from '../../engines/crossroads/panel.js';

const state=createState(()=>({getRun:currentPlaythrough,getBookId:()=>currentBookId,saveState}));
const panel=createCrossroadsPanel({document,definition,state,getRoster,t,getRun:currentPlaythrough,getBookId:()=>currentBookId,saveState,
  getButtonRow:getPlayBtnRow,showAlert,showConfirm,registerShortcut({button,overlay,open,close}){
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  }});
export const loadData=()=>loadRoster(apiFetch);
export function initSim1296(){panel.init();}
export function renderSim1296(){panel.render();}
export function setSim1296Visible(value){panel.setVisible(value);}
export {initSim1296 as init,renderSim1296 as render,setSim1296Visible as setVisible};
