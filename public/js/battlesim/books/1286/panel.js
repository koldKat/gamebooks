import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {definition, getRoster, loadRoster} from './definition.js';
import {createState} from './state.js';
import {createDestinyPanel} from '../../engines/destinyquest/panel.js';
import {createLegionBookControls} from '../../engines/destinyquest/legion-panel.js';
import {createLegionFight,useLegionAction} from '../../engines/destinyquest/legion.js';

const state = createState(() => ({getRun:currentPlaythrough, getBookId:()=>currentBookId, saveState}));
const panel = createDestinyPanel({document, definition, state, getRoster, t, showAlert, showConfirm, getButtonRow:getPlayBtnRow,
  createFight:createLegionFight,useBookAction:useLegionAction,createBookControls:createLegionBookControls,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  }});
export const loadData = () => loadRoster(apiFetch);
export function initSim1286(){panel.init();}
export function renderSim1286(){panel.render();}
export function setSim1286Visible(value){panel.setVisible(value);}
export {initSim1286 as init, renderSim1286 as render, setSim1286Visible as setVisible};
