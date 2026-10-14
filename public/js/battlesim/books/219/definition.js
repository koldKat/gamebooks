// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 219,
  "title": "Masks of Mayhem",
  "family": "fighting-fantasy",
  "stateKey": "sim219",
  "i18nPrefix": "battlesim219"
});

export const POTIONS = [
  ['skill',    'battlesim219.potion.skill'],
  ['strength', 'battlesim219.potion.strength'],
  ['fortune',  'battlesim219.potion.fortune'],
];

export const MAX_PROVISIONS = 10;

export const PROVISIONS_HEAL = 4;

export const SIDE_WOUND_DMG = 2;
