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

export const FIRE_WHIP_DMG = 1;
