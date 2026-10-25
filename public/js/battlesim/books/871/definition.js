import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 871,
  "title": "Сага за Ринглас",
  "family": "ringlas-saga",
  "stateKey": "sim871",
  "i18nPrefix": "battlesim871"
});

export let ROSTER = [];
export const loadRoster = createRosterLoader(871, 'ROSTER', entries => { ROSTER = entries; });
