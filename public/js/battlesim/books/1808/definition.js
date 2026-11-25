import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 1808,
  title: 'What Lies Beneath',
  family: 'what-lies-beneath',
  stateKey: 'sim1808',
  i18nPrefix: 'battlesim1808',
});

export const defaultPlayer = Object.freeze({
  hit: 2, dex: 1, vigor: 8, ward: 0, fierySpirit: 0, silverTongue: 0,
  gnomeFood: 0, cleanser: 0,
  weapon: false, ranged: false, brassknuckles: false, crystal: false,
  shield: false, pixiePowder: false, soup: false, starving: false,
});

export const encounters = [];
export const loadRoster = createRosterLoader(definition.id, definition.family, rows => {
  encounters.splice(0, encounters.length, ...rows);
});
