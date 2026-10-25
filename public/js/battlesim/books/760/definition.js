import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 760,
  "title": "Бойците на Европа",
  "family": "standalone",
  "stateKey": "sim760",
  "i18nPrefix": "battlesim760"
});

export let ROSTER = [];
export const loadRoster = createRosterLoader(760, 'ROSTER', entries => {
  ROSTER = entries;
});
