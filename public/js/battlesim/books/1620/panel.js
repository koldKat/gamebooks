// Connect Tgozur's optional encounter panel to the current application run.
import {definition,OPPONENTS,ENCOUNTERS,RULES,loadRoster} from './definition.js';
import {createD20Panel} from '../../engines/d20/panel.js';
import {currentBookId,currentPlaythrough,saveState,apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert,showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut,shortcutLabel,ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
export const loadData=()=>loadRoster(apiFetch);
const panel=createD20Panel({document,definition,t,getRoster:()=>ENCOUNTERS,getOpponents:()=>OPPONENTS,getRules:()=>RULES,
  getRun:currentPlaythrough,getBookId:()=>currentBookId,saveState,getButtonRow:getPlayBtnRow,showAlert,showConfirm,
  registerShortcut({button,overlay,open,close}){
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  }});
export const initSim1620=()=>panel.init();
export const renderSim1620=()=>panel.render();
export const setSim1620Visible=value=>panel.setVisible(value);
export {initSim1620 as init,renderSim1620 as render,setSim1620Visible as setVisible};
