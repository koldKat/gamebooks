import {currentBookId,currentPlaythrough,saveState,apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert,showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut,shortcutLabel,ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {definition,getRoster,getVehicles,loadRoster} from './definition.js';
import {createCarWarsPanel} from '../../engines/car-wars/panel.js';
const panel=createCarWarsPanel({document,definition,getRoster,getVehicles,t,getRun:currentPlaythrough,getBookId:()=>currentBookId,saveState,getButtonRow:getPlayBtnRow,showAlert,showConfirm,
  registerShortcut({button,overlay,open,close}) {
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  },
});
export const loadData=()=>loadRoster(apiFetch);
export function initSim1442(){panel.init();}
export function renderSim1442(){panel.render();}
export function setSim1442Visible(value){panel.setVisible(value);}
export {initSim1442 as init,renderSim1442 as render,setSim1442Visible as setVisible};
