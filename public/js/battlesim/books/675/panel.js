import { currentBookId, currentPlaythrough, saveState } from "../../../core/state.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { showAlert, showConfirm } from "../../../ui-helpers/confirm.js";
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { createFabledPanel } from "../.././engines/fabled-lands/panel.js";
import { CITIES_OF_GOLD_FIGHTS, CITIES_OF_GOLD_SEA_CHECKS, citiesOfGoldSeaCheck }
  from "../.././engines/fabled-lands/cities-of-gold.js";

const panel = createFabledPanel({ document, t, getRun: currentPlaythrough,
  getBookId: () => currentBookId, saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  bookId: 675, fights: CITIES_OF_GOLD_FIGHTS, seaChecks: CITIES_OF_GOLD_SEA_CHECKS,
  seaCheck: citiesOfGoldSeaCheck, characterDefaults: { rank: 2, stamina: 13 },
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  },
});

export function initSim675() { panel.init(); }
export function renderSim675() { panel.render(); }
export function setSim675Visible(visible) { panel.setVisible(visible); }

export { initSim675 as init, renderSim675 as render, setSim675Visible as setVisible };
