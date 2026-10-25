import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 208,
  "title": "Space Assassin",
  "family": "fighting-fantasy",
  "stateKey": "sim208",
  "i18nPrefix": "battlesim208"
});

export let DEITY_WEAPONS = [];
export const loadRoster = createRosterLoader(208, 'DEITY_TABLE', entries => { DEITY_WEAPONS = entries[0].weapons; });

export const HAND_WOUND_DMG = 2;

export const LASH_DMG = 2;

export const UNARMED_DMG = 1;
