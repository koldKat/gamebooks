// Connect the book's optional combat panel to the active application run.
import {currentBookId, currentPlaythrough, saveState} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {createRoundChecksPanel} from '../../engines/round-checks/panel.js';
import {definition, encounters, customRules} from './definition.js';

const flags = ['khopesh','ankh','eyeOfHorus'];
const panel = createRoundChecksPanel(() => ({bookId:currentBookId, run:currentPlaythrough(), saveState,
  getPlayBtnRow, showAlert, showConfirm, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS, t}), {
  definition, encounters, customRules, stats:['might','mystic','mind'], defaults:{might:3,mystic:3,mind:3},
  parameters:['unlocked','granted','eclipsed','awed','inTheHeights','abracadabra','sweetDreams','fearful',
    'knighted','feared','snakebite','darkPower','weaponBonus',...flags],
  parameterLimits:{weaponBonus:2}, booleanParameters:flags, itemKeys:[],
  roundAdjustment:true,
  combinations:['might','mystic','mind','might+mystic','might+mind','mind+mystic','might+mind+mystic',''],
});
export const initSim603 = panel.init, renderSim603 = panel.render, setSim603Visible = panel.setVisible;
export const {init, render, setVisible} = panel;
