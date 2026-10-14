import { currentBookId, currentPlaythrough, saveState } from "../../../core/state.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { showAlert, showConfirm } from "../../../ui-helpers/confirm.js";
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { createFabledPanel } from "../.././engines/fabled-lands/panel.js";
import { HOWLING_FIGHTS, HOWLING_DEFAULTS, HOWLING_SEA_CHECKS, howlingSeaCheck }
  from "../.././engines/fabled-lands/howling-darkness.js";

const panel = createFabledPanel({ document, t, getRun: currentPlaythrough,
  getBookId: () => currentBookId, saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  bookId: 677, fights: HOWLING_FIGHTS, characterDefaults: HOWLING_DEFAULTS,
  seaChecks: HOWLING_SEA_CHECKS, seaCheck: howlingSeaCheck,
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  },
});

export function initSim677() { panel.init(); }
export function renderSim677() { panel.render(); }
export function setSim677Visible(visible) { panel.setVisible(visible); }

export { initSim677 as init, renderSim677 as render, setSim677Visible as setVisible };
