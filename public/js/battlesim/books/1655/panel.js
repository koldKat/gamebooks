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

function encounterParty(encounter, previous) {
  if (!encounter?.partyRoles) return null;
  return encounter.partyRoles.map(role => {
    const profile = investigators.find(actor => actor.role === role);
    const prior = previous.find(actor => actor.role === role);
    const actor = { ...profile, ...prior, name: prior?.displayName || profile.name };
    for (const key of ['fled', 'waiting', 'unconscious', 'canFireOpening', 'openingShots']) delete actor[key];
    return actor;
  });
}

export { definition };
export const loadData = () => loadRoster(apiFetch);
export const { init, render, setVisible } = createCthulhuPanel({
  definition,
  createState,
  getEncounters: () => encounters,
  getInvestigators: () => investigators,
  getEncounterParty: encounterParty,
  printedPercentile: true,
  expedition: true,
  classicRules: true,
});
export { init as initSim1655, render as renderSim1655, setVisible as setSim1655Visible };
