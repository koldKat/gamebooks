import { createRosterLoader } from '../../roster-data.js';
// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 412,
  "title": "Принцът на Алкирия",
  "family": "alkiria",
  "stateKey": "sim412",
  "i18nPrefix": "battlesim412"
});

export let ROSTER = [];
export const loadRoster = createRosterLoader(412, 'ROSTER', rows => { ROSTER = rows; });
