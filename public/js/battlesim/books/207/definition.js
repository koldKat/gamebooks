// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 207,
  "title": "Talisman of Death",
  "family": "fighting-fantasy",
  "stateKey": "sim207",
  "i18nPrefix": "battlesim207"
});

export const POTIONS = [
  ['skill',    'battlesim207.potion.skill'],
  ['strength', 'battlesim207.potion.strength'],
  ['fortune',  'battlesim207.potion.fortune'],
];

export const MAX_PROVISIONS = 10;

export const SIDE_WOUND_DMG = 2;

export const PROVISIONS_HEAL = 4;

export const FORTUNE_LUCK_BONUS = 1;
