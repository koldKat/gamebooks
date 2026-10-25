import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 464,
  "title": "Магьосникът от огнената планина",
  "family": "fighting-fantasy",
  "stateKey": "sim464",
  "i18nPrefix": "battlesim464"
});

export let ENCOUNTER_RULES = {};
export const loadRoster = createRosterLoader(464, 'ENCOUNTER_RULES', entries => {
  ENCOUNTER_RULES = Object.fromEntries(entries.map(entry => [entry.section, entry.rules]));
});
