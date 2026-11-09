// Connect Usurper's database combat profiles to the shared encounter panel.
import { apiFetch } from '../../../core/state.js';
import { createTigerPanel } from '../../engines/way-of-the-tiger/panel.js';
import { definition, loadRoster, getEncounters } from './definition.js';

const panel = createTigerPanel({ definition, getEncounters });
export const loadData = () => loadRoster(apiFetch);
export const initSim312 = () => panel.init();
export const renderSim312 = () => panel.render();
export const setSim312Visible = value => panel.setVisible(value);
export { initSim312 as init, renderSim312 as render, setSim312Visible as setVisible };
