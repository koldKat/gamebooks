// Connect the English edition's database rules and identity to the shared Grey Star combat panel.
import {apiFetch} from '../../../core/state.js';
import {createGreyStarPanel} from '../../engines/grey-star/panel.js';
import {definition, getRules, loadRoster} from './definition.js';

const panel = createGreyStarPanel({definition, getRules});
export const loadData = () => loadRoster(apiFetch);
export const initSim281 = () => panel.init();
export const renderSim281 = () => panel.render();
export const setSim281Visible = value => panel.setVisible(value);
export {initSim281 as init, renderSim281 as render, setSim281Visible as setVisible};
