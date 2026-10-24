import { createRosterLoader } from '../../roster-data.js';
// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 882,
  "title": "Тайната на Зоро",
  "family": "zorro",
  "stateKey": "sim882",
  "i18nPrefix": "battlesim882"
});

export let ROSTER = [];
export const loadRoster = createRosterLoader(882, 'ROSTER', rows => { ROSTER = rows; });

export const PLAYER_DEFAULTS = { sila: 3, barzina: 5, srachnost: 1, izdr: 2, strast: 4,
  zhivot: 50, rb: 3, fehtovka: 5, pronizvasht: 0, sechasht: 0, blok: 0, fint: 0, trikove: 0 };
