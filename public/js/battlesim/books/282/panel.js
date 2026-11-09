// Connect The Forbidden City's database rules and identity to the shared Grey Star combat panel.
import {apiFetch} from '../../../core/state.js';
import {createGreyStarPanel} from '../../engines/grey-star/panel.js';
import {definition, getRules, loadRoster} from './definition.js';

const panel = createGreyStarPanel({definition, getRules});
export const loadData = () => loadRoster(apiFetch);
export const initSim282 = () => panel.init();
export const renderSim282 = () => panel.render();
export const setSim282Visible = value => panel.setVisible(value);
export {initSim282 as init, renderSim282 as render, setSim282Visible as setVisible};
