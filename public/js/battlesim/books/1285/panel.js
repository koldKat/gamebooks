import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {definition, getRoster, loadRoster} from './definition.js';
import {createState} from './state.js';
import {createDestinyPanel} from '../../engines/destinyquest/panel.js';

const state = createState(() => ({getRun:currentPlaythrough, getBookId:()=>currentBookId, saveState}));
const panel = createDestinyPanel({document, definition, state, getRoster, t, showAlert, showConfirm, getButtonRow:getPlayBtnRow,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  }});
export const loadData = () => loadRoster(apiFetch);
export function initSim1285(){panel.init();}
export function renderSim1285(){panel.render();}
export function setSim1285Visible(value){panel.setVisible(value);}
export {initSim1285 as init, renderSim1285 as render, setSim1285Visible as setVisible};
