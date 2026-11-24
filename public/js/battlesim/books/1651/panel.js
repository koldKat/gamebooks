import { apiFetch } from '../../run-context.js';
import { createCthulhuPanel } from '../../engines/cthulhu-solo/panel.js';
import { definition, encounters, loadRoster } from './definition.js';

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
  printedPercentile: true,
  brawlWeapons: true,
});
export { init as initSim1651, render as renderSim1651, setVisible as setSim1651Visible };
