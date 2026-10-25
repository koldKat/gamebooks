import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 399,
  "title": "Роди се сянка",
  "family": "chronicles-of-orm",
  "stateKey": "sim399",
  "i18nPrefix": "battlesim399"
});

export const MODES = ['unarmed', 'melee', 'gunfight', 'cyber', 'vehicle'];

export let ENEMY_MODE = {}, ENEMY_STATS = {}, ENEMY_STOP_RULES = {};
export const loadRoster = createRosterLoader(399, 'ENEMY_PROFILES', entries => {
  ENEMY_MODE = Object.fromEntries(entries.map(entry => [entry.name, entry.mode]));
  ENEMY_STATS = Object.fromEntries(entries.map(entry => [entry.name, entry.stats]));
  ENEMY_STOP_RULES = Object.fromEntries(entries.filter(entry => entry.stopRule).map(entry => [entry.name, entry.stopRule]));
});
