import { currentBookId, currentPlaythrough, saveState } from '../core/state.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { showAlert, showConfirm } from '../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { createFabledPanel } from './engines/fabled-lands/panel.js';
import { BLOOD_DARK_FIGHTS, BLOOD_DARK_DEFAULTS, BLOOD_DARK_SEA_CHECKS, bloodDarkSeaCheck }
  from './engines/fabled-lands/blood-dark-sea.js';

const panel = createFabledPanel({ document, t, getRun: currentPlaythrough,
  getBookId: () => currentBookId, saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  bookId: 676, fights: BLOOD_DARK_FIGHTS, characterDefaults: BLOOD_DARK_DEFAULTS,
  seaChecks: BLOOD_DARK_SEA_CHECKS, seaCheck: bloodDarkSeaCheck, extraFlags: ['abilityCurse', 'hasCargo', 'copperOre'],
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  },
});

export function initSim676() { panel.init(); }
export function renderSim676() { panel.render(); }
export function setSim676Visible(visible) { panel.setVisible(visible); }
