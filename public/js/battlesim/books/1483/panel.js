// Connect Fortress of Assassins' optional duel to live playthrough bindings.
import {currentBookId,currentPlaythrough,saveState,apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert,showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut,shortcutLabel,ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {definition,getRoster,getPlayerDefaults,loadRoster} from './definition.js';
import {createKnightmarePanel} from '../../engines/knightmare/panel.js';

const panel=createKnightmarePanel({document,definition,t,getRoster,getPlayerDefaults,getRun:currentPlaythrough,
  getBookId:()=>currentBookId,saveState,getButtonRow:getPlayBtnRow,showAlert,showConfirm,
  registerShortcut({button,overlay,open,close}){
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  }});
export const loadData=()=>loadRoster(apiFetch);
export function initSim1483(){panel.init();}
export function renderSim1483(){panel.render();}
export function setSim1483Visible(value){panel.setVisible(value);}
export {initSim1483 as init,renderSim1483 as render,setSim1483Visible as setVisible};
