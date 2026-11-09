// Connect War of the Wizards' database rules to the shared Grey Star combat panel.
import {apiFetch} from '../../../core/state.js';
import {createGreyStarPanel} from '../../engines/grey-star/panel.js';
import {definition, getRules, loadRoster} from './definition.js';

const panel = createGreyStarPanel({definition, getRules, potionHeal: definition.potionHeal});
export const loadData = () => loadRoster(apiFetch);
export const initSim284 = () => panel.init();
export const renderSim284 = () => panel.render();
export const setSim284Visible = value => panel.setVisible(value);
export {initSim284 as init, renderSim284 as render, setSim284Visible as setVisible};
