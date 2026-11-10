// Connect this book's catalog and saved run to the shared Lone Wolf encounter panel.
import * as catalog from './definition.js';
import {createMagnakaiPanel} from '../../engines/lone-wolf/magnakai-panel.js';
import {currentBookId,currentPlaythrough,saveState,apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert,showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut,shortcutLabel,ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
export {createMagnakaiPanel};
const panel=createMagnakaiPanel(catalog,{document,t,getRun:currentPlaythrough,getBookId:()=>currentBookId,saveState,
  showAlert,showConfirm,fetcher:apiFetch,getButtonRow:getPlayBtnRow,registerShortcut({button,overlay,open,close}){
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  }});
export function initSim333(){panel.init();}
export function renderSim333(){panel.render();}
export function setSim333Visible(visible){panel.setVisible(visible);}
export {initSim333 as init,renderSim333 as render,setSim333Visible as setVisible};
