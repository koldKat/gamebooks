import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 200,
  "title": "The Forest of Doom",
  "family": "fighting-fantasy",
  "stateKey": "sim200",
  "i18nPrefix": "battlesim200"
});

export const POTIONS = [
  ['skill',    'battlesim200.potion.skill'],
  ['strength', 'battlesim200.potion.strength'],
  ['fortune',  'battlesim200.potion.fortune'],
];

export const SIDE_WOUND_DMG = 2;

export let FIRE_WHIP_DMG;
export const FOREST_RULES = {};
export const loadRoster = createRosterLoader(200, 'FOREST_RULES', entries => {
  if (entries.length !== 1 || !Number.isSafeInteger(entries[0].whipDamage) || !Number.isSafeInteger(entries[0].whipHitMax)) throw new Error('Incomplete Forest of Doom settings');
  Object.assign(FOREST_RULES, entries[0]);
  FIRE_WHIP_DMG = FOREST_RULES.whipDamage;
});
