// Connect the Lost Jedi combat panel to Jedi Dawn's current application run.
import {definition,ENCOUNTERS,RULES,loadRoster} from './definition.js';
import {createState} from './state.js';
import {createLostJediPanel} from '../../engines/lost-jedi/panel.js';
import {currentBookId,currentPlaythrough,saveState,apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert,showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut,shortcutLabel,ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

export const loadData=()=>loadRoster(apiFetch);
const store=createState(()=>({currentBookId,currentPlaythrough,saveState}));
const panel=createLostJediPanel({definition,document,t,store,getRun:currentPlaythrough,getBookId:()=>currentBookId,
  getEncounters:()=>ENCOUNTERS,getRules:()=>RULES,getButtonRow:getPlayBtnRow,showAlert,showConfirm,
  registerShortcut({button,overlay,open,close}) {
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  }});
export const initSim1577=()=>panel.init();
export const renderSim1577=()=>panel.render();
export const setSim1577Visible=visible=>panel.setVisible(visible);
export {initSim1577 as init,renderSim1577 as render,setSim1577Visible as setVisible};
