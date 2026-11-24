import { apiFetch } from '../../run-context.js';
import { createCthulhuPanel } from '../../engines/cthulhu-solo/panel.js';
import { definition, encounters, investigators, loadRoster } from './definition.js';

function createState(getContext) {
  return () => {
    const { currentBookId, currentPlaythrough } = getContext();
    const run = Number(currentBookId) === definition.id ? currentPlaythrough() : null;
    return run ? run[definition.stateKey] ??= { fight: null, history: [], setup: null } : null;
  };
}

export { definition };
export const loadData = () => loadRoster(apiFetch);
export const { init, render, setVisible } = createCthulhuPanel({
  definition,
  createState,
  getEncounters: () => encounters,
  getInvestigators: () => investigators,
  printedPercentile: true,
});
export { init as initSim1650, render as renderSim1650, setVisible as setSim1650Visible };
