import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 205,
  "title": "Caverns of the Snow Witch",
  "family": "fighting-fantasy",
  "stateKey": "sim205",
  "i18nPrefix": "battlesim205"
});

export const POTIONS = [
  ['skill',    'battlesim205.potion.skill'],
  ['strength', 'battlesim205.potion.strength'],
  ['fortune',  'battlesim205.potion.fortune'],
];

export const MAX_PROVISIONS = 10;

export const PROVISIONS_HEAL = 4;

export let ICE_DEMON_GAS_DMG;

export let WHITE_DRAGON_BREATH_DMG;

export const SIDE_WOUND_DMG = 2;

export const SNOW_RULES = {};
export const loadRoster = createRosterLoader(205, 'SNOW_RULES', entries => {
  if (entries.length !== 1 || !['gasDamage', 'gasHitMax', 'breathDamage', 'breathHitMax'].every(key => Number.isSafeInteger(entries[0][key]))) throw new Error('Incomplete Snow Witch settings');
  Object.assign(SNOW_RULES, entries[0]);
  ICE_DEMON_GAS_DMG = SNOW_RULES.gasDamage;
  WHITE_DRAGON_BREATH_DMG = SNOW_RULES.breathDamage;
});
