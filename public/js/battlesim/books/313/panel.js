// Connect Overlord's database combat profiles to the shared encounter panel.
import { apiFetch } from '../../../core/state.js';
import { createTigerPanel } from '../../engines/way-of-the-tiger/panel.js';
import { definition, loadRoster, getEncounters } from './definition.js';

const panel = createTigerPanel({ definition, getEncounters });
export const loadData = () => loadRoster(apiFetch);
export const initSim313 = () => panel.init();
export const renderSim313 = () => panel.render();
export const setSim313Visible = value => panel.setVisible(value);
export { initSim313 as init, renderSim313 as render, setSim313Visible as setVisible };
