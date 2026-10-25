import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 462,
  "title": "Гората на обречените",
  "family": "fighting-fantasy",
  "stateKey": "sim462",
  "i18nPrefix": "battlesim462"
});

export let ENCOUNTER_RULES = {};
export const loadRoster = createRosterLoader(462, 'ENCOUNTER_RULES', entries => {
  ENCOUNTER_RULES = Object.fromEntries(entries.map(entry => [entry.section, entry.rules]));
});
