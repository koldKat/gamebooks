import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 468,
  "title": "Леговището на снежната вещица",
  "family": "fighting-fantasy",
  "stateKey": "sim468",
  "i18nPrefix": "battlesim468"
});

export let ENCOUNTER_RULES = {};
export const loadRoster = createRosterLoader(468, 'ENCOUNTER_RULES', entries => {
  ENCOUNTER_RULES = Object.fromEntries(entries.map(entry => [entry.section, entry.rules]));
});
