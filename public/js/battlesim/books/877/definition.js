// Book identity and declarative defaults; no DOM or saved-state access.
import { createRosterLoader } from '../../roster-data.js';
export const definition = Object.freeze({
  "id": 877,
  "title": "Галактическият гигант",
  "family": "galactic-giant",
  "stateKey": "sim877",
  "i18nPrefix": "battlesim877"
});
export let ROSTER = [];
export const loadRoster = createRosterLoader(877, 'ROSTER', rows => { ROSTER = rows; });
