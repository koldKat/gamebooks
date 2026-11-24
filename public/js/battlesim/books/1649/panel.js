import { apiFetch } from '../../run-context.js';
import { createCthulhuPanel } from '../../engines/cthulhu-solo/panel.js';
import { definition, ENCOUNTERS, loadRoster } from './definition.js';
import { createState } from './state.js';

export { definition };
export const loadData = () => loadRoster(apiFetch);
export const { init, render, setVisible } = createCthulhuPanel({
  definition, getEncounters: () => ENCOUNTERS, createState,
});
export { init as initSim1649, render as renderSim1649, setVisible as setSim1649Visible };
