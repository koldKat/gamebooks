import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 401,
  "title": "At the Court of King Minos",
  "family": "cretan",
  "stateKey": "sim401",
  "i18nPrefix": "battlesim401"
});

export let DIVINE_WEAPON_NAME_RULES = [];
export const loadRoster = createRosterLoader(401, 'DIVINE_WEAPON_NAME_RULES', entries => {
  DIVINE_WEAPON_NAME_RULES = entries.map(entry => new RegExp(entry.namePattern, entry.flags));
});
