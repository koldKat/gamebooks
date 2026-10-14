// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 209,
  "title": "Freeway Fighter",
  "family": "fighting-fantasy",
  "stateKey": "sim209",
  "i18nPrefix": "battlesim209"
});

export const MODES = [
  ['hand',    'battlesim209.mode.hand'],
  ['shoot',   'battlesim209.mode.shoot'],
  ['vehicle', 'battlesim209.mode.vehicle'],
];

export const MAX_MEDKIT = 10;

export const MAX_ROCKETS = 4;

export const MAX_SPIKES = 3;

export const MAX_OIL = 2;

export const MEDKIT_HEAL = 4;

export const HAND_KO_THRESHOLD = 6;
