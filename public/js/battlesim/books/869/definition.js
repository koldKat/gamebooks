import { createRosterLoader } from '../../roster-data.js';
// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 869,
  "title": "Тигрово око",
  "family": "tiger-eye",
  "stateKey": "sim869",
  "i18nPrefix": "battlesim869"
});

export let RIVALS = [];
export const loadRoster = createRosterLoader(869, 'RIVALS', rows => { RIVALS = rows; });

export const SPECIAL2 = ['tejbrun', 'matual'];
