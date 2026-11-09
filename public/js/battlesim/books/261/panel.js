// Wire this book's optional combat tool to the shared Fighting Fantasy panel.
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
export function initSim261(){panel.init();}
export function renderSim261(){panel.render();}
export function setSim261Visible(value){panel.setVisible(value);}
export {initSim261 as init,renderSim261 as render,setSim261Visible as setVisible};
