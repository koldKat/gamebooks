import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 400,
  "title": "Bloodfeud of Altheus",
  "family": "cretan",
  "stateKey": "sim400",
  "i18nPrefix": "battlesim400"
});

export let DIVINE_WEAPON_NAME_RULES = [];
export const loadRoster = createRosterLoader(400, 'DIVINE_WEAPON_NAME_RULES', entries => {
  DIVINE_WEAPON_NAME_RULES = entries.map(entry => new RegExp(entry.namePattern, entry.flags));
});
