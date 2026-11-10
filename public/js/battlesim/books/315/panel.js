// Connect Inferno's database combat profiles to the shared encounter panel.
import { apiFetch } from '../../../core/state.js';
import { createTigerPanel } from '../../engines/way-of-the-tiger/panel.js';
import { definition, loadRoster, getEncounters } from './definition.js';

const panel = createTigerPanel({ definition, getEncounters });
export const loadData = () => loadRoster(apiFetch);
export const initSim315 = () => panel.init();
export const renderSim315 = () => panel.render();
export const setSim315Visible = value => panel.setVisible(value);
export { initSim315 as init, renderSim315 as render, setSim315Visible as setVisible };
