// Bind Fortress of the Firelord's optional combat sheet to the current playthrough.
import {currentBookId,currentPlaythrough,saveState,apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert,showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut,shortcutLabel,ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {definition,getRoster,getPlayerDefaults,loadRoster} from './definition.js';
import {createFatemasterPanel} from '../../engines/fatemaster/panel.js';

const panel=createFatemasterPanel({document,definition,t,getRoster,getPlayerDefaults,getRun:currentPlaythrough,getBookId:()=>currentBookId,saveState,getButtonRow:getPlayBtnRow,showAlert,showConfirm,
  registerShortcut({button,overlay,open,close}){
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  }});
export const loadData=()=>loadRoster(apiFetch);
export function initSim1477(){panel.init();}
export function renderSim1477(){panel.render();}
export function setSim1477Visible(value){panel.setVisible(value);}
export {initSim1477 as init,renderSim1477 as render,setSim1477Visible as setVisible};
