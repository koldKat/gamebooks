// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 203,
  "title": "Island of the Lizard King",
  "family": "fighting-fantasy",
  "stateKey": "sim203",
  "i18nPrefix": "battlesim203"
});

export const POTIONS = [
  ['skill',    'battlesim203.potion.skill'],
  ['strength', 'battlesim203.potion.strength'],
  ['fortune',  'battlesim203.potion.fortune'],
];

export const MAX_PROVISIONS = 10;

export const PROVISIONS_HEAL = 4;

export const SIDE_WOUND_DMG = 2;
