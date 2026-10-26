import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {definition, getRoster, loadRoster} from './definition.js';
import {createState} from './state.js';
import {createDestinyPanel} from '../../engines/destinyquest/panel.js';
import {createHeartBookControls} from '../../engines/destinyquest/heart-panel.js';
import {createHeartFight} from '../../engines/destinyquest/heart.js';
import {useLegionAction} from '../../engines/destinyquest/legion.js';

const state = createState(() => ({getRun:currentPlaythrough, getBookId:()=>currentBookId, saveState}));
const itemNames=new Map(),pendingNames=new Map();
async function prepareSharedItemLabels(choices){
  let changed=false;
  await Promise.all([...new Set(choices.filter(choice=>!choice.label).map(choice=>choice.itemId))].map(async itemId=>{
    if(itemNames.has(itemId))return;
    if(!pendingNames.has(itemId))pendingNames.set(itemId,(async()=>{
      const response=await apiFetch(`/api/items/${itemId}`);if(!response.ok)return false;
      const item=await response.json();if(!item.name)return false;
      if(itemNames.size>=128)itemNames.clear();itemNames.set(itemId,item.name);return true;
    })().finally(()=>pendingNames.delete(itemId)));
    if(await pendingNames.get(itemId))changed=true;
  }));return changed;
}
const panel = createDestinyPanel({document, definition, state, getRoster, t, showAlert, showConfirm, getButtonRow:getPlayBtnRow,
  getSharedItemLabel:choice=>itemNames.get(choice.itemId),prepareSharedItemLabels,
  createFight:createHeartFight,useBookAction:useLegionAction,createBookControls:createHeartBookControls,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  }});
export const loadData = () => loadRoster(apiFetch);
export function initSim1287(){panel.init();}
export function renderSim1287(){panel.render();}
export function setSim1287Visible(value){panel.setVisible(value);}
export {initSim1287 as init, renderSim1287 as render, setSim1287Visible as setVisible};
