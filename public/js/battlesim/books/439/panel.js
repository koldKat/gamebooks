// Connect the Bulgarian edition to the shared Grey Star combat panel.
import {createGreyStarPanel} from '../../engines/grey-star/panel.js';
import {definition, HEALING_POTION_HEAL, COMBAT_TABLE, NEIJJIN, VICTORY_ROUTES, DEADLINES, ENCOUNTER_RULES} from './definition.js';

const panel = createGreyStarPanel({definition, potionHeal: HEALING_POTION_HEAL,
  getRules: () => ({COMBAT_TABLE, NEIJJIN, VICTORY_ROUTES, DEADLINES, ENCOUNTER_RULES})});
export const initSim439 = () => panel.init();
export const renderSim439 = () => panel.render();
export const setSim439Visible = value => panel.setVisible(value);
export {initSim439 as init, renderSim439 as render, setSim439Visible as setVisible};
