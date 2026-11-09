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
export function initSim262(){panel.init();}
export function renderSim262(){panel.render();}
export function setSim262Visible(value){panel.setVisible(value);}
export {initSim262 as init,renderSim262 as render,setSim262Visible as setVisible};
