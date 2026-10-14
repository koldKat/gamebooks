// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 212,
  "title": "Seas of Blood",
  "family": "fighting-fantasy",
  "stateKey": "sim212",
  "i18nPrefix": "battlesim212"
});

export const MODES = [
  ['person', 'battlesim212.mode.person'],
  ['crew',   'battlesim212.mode.crew'],
];

export const ESCAPE_CREW_COST = 2;
