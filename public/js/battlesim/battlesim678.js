import { currentBookId, currentPlaythrough, saveState } from '../core/state.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { showAlert, showConfirm } from '../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { createFabledPanel } from './engines/fabled-lands/panel.js';
import { HIDDEN_FIGHTS, HIDDEN_DEFAULTS, HIDDEN_SEA_CHECKS, hiddenSeaCheck,
  startHiddenFight, hiddenRound, fleeHiddenFight, cancelHiddenFight } from './engines/fabled-lands/hidden-faces.js';

const panel = createFabledPanel({ document, t, getRun: currentPlaythrough,
  getBookId: () => currentBookId, saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  bookId:678, fights:HIDDEN_FIGHTS, characterDefaults:HIDDEN_DEFAULTS,
  seaChecks:HIDDEN_SEA_CHECKS, seaCheck:hiddenSeaCheck, startFight:startHiddenFight,
  roundFight:hiddenRound, fleeFight:fleeHiddenFight, cancelFight:cancelHiddenFight,
  extraFlags:['defenceThroughFaith'],
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  },
});
export function initSim678() { panel.init(); }
export function renderSim678() { panel.render(); }
export function setSim678Visible(visible) { panel.setVisible(visible); }
