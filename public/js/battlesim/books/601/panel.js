// Wire the book's finite-round combat panel to the currently active application run.
import {currentBookId, currentPlaythrough, saveState} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {createRoundChecksPanel} from '../../engines/round-checks/panel.js';
import {definition, encounters} from './definition.js';

const panel = createRoundChecksPanel(() => ({bookId:currentBookId, run:currentPlaythrough(), saveState,
  getPlayBtnRow, showAlert, showConfirm, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS, t}), {
  definition, encounters, stats:['merc','mouth','focus'], defaults:{merc:2,mouth:2,focus:3},
  parameterLimits:{pointyStick:1,penalty:4},
  parameters:['cashDown','weaponsDown','namesDown','warned','dragonfire','chaos','guardsGuards','penalty','pointyStick','casinoOutrage','rollingStone'],
  combinations:['merc','mouth','focus','merc+mouth','merc+focus','mouth+merc','focus+mouth','focus+merc','merc+merc','mouth+mouth','focus+focus','', 'max:focus+mouth','min:focus+merc'],
});
export const initSim601 = panel.init, renderSim601 = panel.render, setSim601Visible = panel.setVisible;
export const {init, render, setVisible} = panel;
