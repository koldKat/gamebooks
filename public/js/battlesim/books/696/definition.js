import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 696,
  "title": "Вампирите на Флавия: Вкусът на кръвта",
  "family": "standalone",
  "stateKey": "sim696",
  "i18nPrefix": "battlesim696"
});

export let CREATURE_ATTRIBUTES = {};
export const loadRoster = createRosterLoader(696, 'CREATURE_ATTRIBUTES', entries => {
  CREATURE_ATTRIBUTES = Object.fromEntries(entries.map(entry => [entry.name, entry.attributes]));
});
