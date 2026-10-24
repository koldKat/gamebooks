import { createRosterLoader } from '../../roster-data.js';
export const definition = Object.freeze({
  id: 807,
  title: 'Извън времето',
  family: 'opposed-dice',
  stateKey: 'sim807',
  i18nPrefix: 'battlesim807',
});

export const RULES_REVISION = 1;
export let ENCOUNTERS = [];
export const loadRoster = createRosterLoader(807, 'ENCOUNTERS', rows => { ENCOUNTERS = rows; });
