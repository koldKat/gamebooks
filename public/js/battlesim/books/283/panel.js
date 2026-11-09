// Connect Beyond the Nightmare Gate's database rules to the shared Grey Star combat panel.
import {apiFetch} from '../../../core/state.js';
import {createGreyStarPanel} from '../../engines/grey-star/panel.js';
import {definition, getRules, loadRoster} from './definition.js';

const panel = createGreyStarPanel({definition, getRules});
export const loadData = () => loadRoster(apiFetch);
export const initSim283 = () => panel.init();
export const renderSim283 = () => panel.render();
export const setSim283Visible = value => panel.setVisible(value);
export {initSim283 as init, renderSim283 as render, setSim283Visible as setVisible};
