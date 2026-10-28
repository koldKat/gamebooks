import {currentBookId,currentPlaythrough,saveState,apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert,showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut,shortcutLabel,ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {definition,getRoster,getVehicles,getPlayerDefaults,getMaintenance,getLocalEquipment,loadRoster} from './definition.js';
import * as combat from '../../engines/car-wars/scenario-combat.js';
import {createCarWarsPanel} from '../../engines/car-wars/panel.js';
const panel=createCarWarsPanel({document,definition,getRoster,getVehicles,getPlayerDefaults,getMaintenance,getLocalEquipment,combat,t,scenarios:true,
  getRun:currentPlaythrough,getBookId:()=>currentBookId,saveState,getButtonRow:getPlayBtnRow,showAlert,showConfirm,
  registerShortcut({button,overlay,open,close}) {
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  },
});
export const loadData=()=>loadRoster(apiFetch);
export function initSim1445(){panel.init();}
export function renderSim1445(){panel.render();}
export function setSim1445Visible(value){panel.setVisible(value);}
export {initSim1445 as init,renderSim1445 as render,setSim1445Visible as setVisible};
