import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 267,
  "title": "The Dungeon on Blood Island",
  "family": "fighting-fantasy",
  "stateKey": "sim267",
  "i18nPrefix": "battlesim267"
});

export const MAX_PROVISIONS = 10;

export const PROVISIONS_HEAL = 4;

export let ENCOUNTER_RULES = {};
export let CALDWELL_NAME_RULES = [];
export let CALDWELL_RULE = {};
export const loadRoster = createRosterLoader(267, 'ENCOUNTER_RULES', entries => {
  ENCOUNTER_RULES = Object.fromEntries(entries.map(entry => [entry.enemy, entry]));
  CALDWELL_NAME_RULES = entries.filter(entry => entry.namePattern)
    .map(entry => new RegExp(entry.namePattern, entry.flags));
  CALDWELL_RULE = entries.find(entry => entry.doublesDamage !== undefined) || {};
});
