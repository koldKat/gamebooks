// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 231,
  "title": "Daggers of Darkness",
  "family": "fighting-fantasy",
  "stateKey": "sim231",
  "i18nPrefix": "battlesim231"
});

export const POTIONS = [
  ['skill',    'battlesim231.potion.skill'],
  ['strength', 'battlesim231.potion.strength'],
  ['fortune',  'battlesim231.potion.fortune'],
];

export const MAX_PROVISIONS = 10;

export const PROVISIONS_HEAL = 4;

export const SIDE_WOUND_DMG = 2;
