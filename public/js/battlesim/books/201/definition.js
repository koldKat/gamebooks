// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 201,
  "title": "City of Thieves",
  "family": "fighting-fantasy",
  "stateKey": "sim201",
  "i18nPrefix": "battlesim201"
});

export const POTIONS = [
  ['skill',    'battlesim201.potion.skill'],
  ['strength', 'battlesim201.potion.strength'],
  ['fortune',  'battlesim201.potion.fortune'],
];

export const MAX_PROVISIONS = 10;

export const PROVISIONS_HEAL = 4;

export const SIDE_WOUND_DMG = 2;

export const HEALING_BROOCH_HEAL = 1;

export const LIZARDINE_FIRE_DMG = 1;
