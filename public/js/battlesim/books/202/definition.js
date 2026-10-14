// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 202,
  "title": "Deathtrap Dungeon",
  "family": "fighting-fantasy",
  "stateKey": "sim202",
  "i18nPrefix": "battlesim202"
});

export const POTIONS = [
  ['skill',    'battlesim202.potion.skill'],
  ['strength', 'battlesim202.potion.strength'],
  ['fortune',  'battlesim202.potion.fortune'],
];

export const MAX_PROVISIONS = 10;

export const PROVISIONS_HEAL = 4;

export const SIDE_WOUND_DMG = 2;
