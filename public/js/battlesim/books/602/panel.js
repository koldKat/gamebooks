// Connect the book's optional combat panel to the active application run.
import {currentBookId, currentPlaythrough, saveState} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {createRoundChecksPanel} from '../../engines/round-checks/panel.js';
import {definition, encounters, customRules} from './definition.js';

const flags = ['experimentalGauntlet','spikedKnuckles','stainedMachete','oddHelmets','terribleStake','evilCowbell','glop','gammaInfusion'];
const panel = createRoundChecksPanel(() => ({bookId:currentBookId, run:currentPlaythrough(), saveState,
  getPlayBtnRow, showAlert, showConfirm, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS, t}), {
  definition, encounters, customRules, stats:['power','charm','concentration'], defaults:{power:3,charm:3,concentration:3},
  parameters:['wobbly','transformed','penalty','delayed','litUp','spaceAlert','troublesome','nobbled','droned','weirdVibes','bitten',...flags],
  parameterLimits:{penalty:3}, booleanParameters:flags,
  itemKeys:['crystal','pepperSpray'], consumableKeys:['crystal','pepperSpray'],
  roundAdjustment:true, persistBattleParameters:true,
  combinations:['power','charm','concentration','power+charm','power+concentration','charm+concentration','power+power','charm+charm','concentration+concentration',''],
});
export const initSim602 = panel.init, renderSim602 = panel.render, setSim602Visible = panel.setVisible;
export const {init, render, setVisible} = panel;
