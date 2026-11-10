// Connect Warbringer's database combat profiles to the shared encounter panel.
import { apiFetch } from '../../../core/state.js';
import { createTigerPanel } from '../../engines/way-of-the-tiger/panel.js';
import { definition, loadRoster, getEncounters } from './definition.js';

const panel = createTigerPanel({ definition, getEncounters });
export const loadData = () => loadRoster(apiFetch);
export const initSim314 = () => panel.init();
export const renderSim314 = () => panel.render();
export const setSim314Visible = value => panel.setVisible(value);
export { initSim314 as init, renderSim314 as render, setSim314Visible as setVisible };
