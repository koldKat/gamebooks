// Wire Dracula's Castle's shared combat panel to the current application run.
import {definition, ENCOUNTERS, ALLIES, RULES, loadRoster} from './definition.js';
import {createState} from './state.js';
import {createHorrorPanel} from '../../engines/horror-classic/panel.js';
import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

export const loadData = ()=>loadRoster(apiFetch);
const store=createState(()=>({currentBookId,currentPlaythrough,saveState}));
const panel=createHorrorPanel({definition,document,t,store,getRun:currentPlaythrough,getBookId:()=>currentBookId,
  getEncounters:()=>ENCOUNTERS,getAllies:()=>ALLIES,getRules:()=>RULES,getButtonRow:getPlayBtnRow,showAlert,showConfirm,
  registerShortcut({button,overlay,open,close}) {
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  }});
export function initSim1575() {panel.init();}
export function renderSim1575() {panel.render();}
export function setSim1575Visible(visible) {panel.setVisible(visible);}
export {initSim1575 as init,renderSim1575 as render,setSim1575Visible as setVisible};
