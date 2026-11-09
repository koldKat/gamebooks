// Connect Avenger's reviewed database encounters to the shared combat panel.
import { apiFetch } from '../../../core/state.js';
import { createTigerPanel } from '../../engines/way-of-the-tiger/panel.js';
import { definition, loadRoster, getEncounters } from './definition.js';

const panel = createTigerPanel({ definition, getEncounters });
export const loadData = () => loadRoster(apiFetch);
export const initSim310 = () => panel.init();
export const renderSim310 = () => panel.render();
export const setSim310Visible = value => panel.setVisible(value);
export { initSim310 as init, renderSim310 as render, setSim310Visible as setVisible };
