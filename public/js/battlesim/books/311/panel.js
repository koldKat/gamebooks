// Connect Assassin's database encounters to the shared combat panel.
import { apiFetch } from '../../../core/state.js';
import { createTigerPanel } from '../../engines/way-of-the-tiger/panel.js';
import { definition, loadRoster, getEncounters } from './definition.js';

const panel = createTigerPanel({ definition, getEncounters });
export const loadData = () => loadRoster(apiFetch);
export const initSim311 = () => panel.init();
export const renderSim311 = () => panel.render();
export const setSim311Visible = value => panel.setVisible(value);
export { initSim311 as init, renderSim311 as render, setSim311Visible as setVisible };
