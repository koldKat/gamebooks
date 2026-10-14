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

export const ICE_DEMON_GAS_DMG = 1;

export const WHITE_DRAGON_BREATH_DMG = 2;

export const SIDE_WOUND_DMG = 2;
