// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 211,
  "title": "The Rings of Kether",
  "family": "fighting-fantasy",
  "stateKey": "sim211",
  "i18nPrefix": "battlesim211"
});

export const MODES = [
  ['handtohand', 'battlesim211.mode.handtohand'],
  ['blaster',    'battlesim211.mode.blaster'],
  ['ship',       'battlesim211.mode.ship'],
];

export const MAX_ENERGY_TABLETS = 4;

export const MAX_SMART_MISSILES = 2;

export const ENERGY_TABLET_RESTORE = 6;

export const DEFAULT_MISSILE_DAMAGE = 99;
