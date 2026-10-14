// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 232,
  "title": "Armies of Death",
  "family": "fighting-fantasy",
  "stateKey": "sim232",
  "i18nPrefix": "battlesim232"
});

export const POTIONS = [
  ['skill',    'battlesim232.potion.skill'],
  ['strength', 'battlesim232.potion.strength'],
  ['fortune',  'battlesim232.potion.fortune'],
];

export const MAX_PROVISIONS = 10;

export const PROVISIONS_HEAL = 4;

export const SIDE_WOUND_DMG = 2;
