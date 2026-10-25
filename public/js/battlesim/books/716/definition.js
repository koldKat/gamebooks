import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 716,
  "title": "Арена 3",
  "family": "standalone",
  "stateKey": "sim716",
  "i18nPrefix": "battlesim716"
});

export let ENCOUNTER_RULES = {};
export const loadRoster = createRosterLoader(716, 'ENCOUNTER_RULES', entries => {
  ENCOUNTER_RULES = Object.fromEntries(entries.map(entry => [entry.enemyName, entry]));
});
