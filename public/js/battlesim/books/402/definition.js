import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 402,
  "title": "Return of the Wanderer",
  "family": "cretan",
  "stateKey": "sim402",
  "i18nPrefix": "battlesim402"
});

export let DIVINE_WEAPON_NAME_RULES = [];
export const loadRoster = createRosterLoader(402, 'DIVINE_WEAPON_NAME_RULES', entries => {
  DIVINE_WEAPON_NAME_RULES = entries.map(entry => new RegExp(entry.namePattern, entry.flags));
});
