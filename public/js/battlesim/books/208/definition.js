// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 208,
  "title": "Space Assassin",
  "family": "fighting-fantasy",
  "stateKey": "sim208",
  "i18nPrefix": "battlesim208"
});

export const DEITY_WEAPONS = [
  { name: 'battlesim208.weapon.whip',       skill: 10, dmg: 3,        instant: false },
  { name: 'battlesim208.weapon.bolas',      skill: 9,  dmg: 2,        instant: false },
  { name: 'battlesim208.weapon.spear',      skill: 7,  dmg: 1,        instant: false },
  { name: 'battlesim208.weapon.lash',       skill: 8,  dmg: 2,        instant: false },
  { name: 'battlesim208.weapon.blaster',    skill: 6,  dmg: null,     instant: false }, // 1d6
  { name: 'battlesim208.weapon.disintegrator', skill: 5, dmg: null,   instant: true  },
];

export const HAND_WOUND_DMG = 2;

export const LASH_DMG = 2;

export const UNARMED_DMG = 1;
