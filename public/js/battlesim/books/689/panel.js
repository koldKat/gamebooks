import { currentBookId, currentPlaythrough, saveState } from "../../../core/state.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { showAlert, showConfirm } from "../../../ui-helpers/confirm.js";
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { createLegendaryPanel } from "../.././engines/legendary-kingdoms/panel.js";
import { VALLEY_SETTINGS } from "../.././engines/legendary-kingdoms/valley-roster.js";

const panel=createLegendaryPanel({document,t,getRun:currentPlaythrough,getBookId:()=>currentBookId,
  saveState,showAlert,showConfirm,getButtonRow:getPlayBtnRow,
  registerShortcut({button,overlay,open,close}) {
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  },
},{slaveDamageSettings:VALLEY_SETTINGS.slaves});
export function initSim689() {panel.init();}
export function renderSim689() {panel.render();}
export function setSim689Visible(visible) {panel.setVisible(visible);}

export { initSim689 as init, renderSim689 as render, setSim689Visible as setVisible };
