import {currentBookId,currentPlaythrough,saveState,apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert,showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut,shortcutLabel,ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {definition,getRoster,getSettings,loadRoster} from './definition.js';
import {createFantasyState} from '../../engines/fighting-fantasy/state.js';
import {createFantasyPanel} from '../../engines/fighting-fantasy/panel.js';

const state = createFantasyState(definition,()=>({getRun:currentPlaythrough,getBookId:()=>currentBookId,saveState}));
const panel = createFantasyPanel({document,definition,state,getRoster,getSettings,t,getRun:currentPlaythrough,getBookId:()=>currentBookId,
  getButtonRow:getPlayBtnRow,showAlert,showConfirm,registerShortcut({button,overlay,open,close}){
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  }});
export const loadData = () => loadRoster(apiFetch);
export function initSim1362(){panel.init();}
export function renderSim1362(){panel.render();}
export function setSim1362Visible(value){panel.setVisible(value);}
export {initSim1362 as init,renderSim1362 as render,setSim1362Visible as setVisible};
