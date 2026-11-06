// Connect Darkmoon's Curse encounter controls to the current application run.
import {definition,OPPONENTS,RULES,loadRoster} from './definition.js';
import {createFirstHitPanel} from '../../engines/first-hit/panel.js';
import {currentBookId,currentPlaythrough,saveState,apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert,showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut,shortcutLabel,ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
export const loadData=()=>loadRoster(apiFetch);
const panel=createFirstHitPanel({document,definition,t,getRoster:()=>OPPONENTS,getRules:()=>RULES,
  getRun:currentPlaythrough,getBookId:()=>currentBookId,saveState,getButtonRow:getPlayBtnRow,showAlert,showConfirm,
  registerShortcut({button,overlay,open,close}){
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  }});
export const initSim1622=()=>panel.init();
export const renderSim1622=()=>panel.render();
export const setSim1622Visible=value=>panel.setVisible(value);
export {initSim1622 as init,renderSim1622 as render,setSim1622Visible as setVisible};
