import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 1414,
  title: 'Калоян и златният печат',
  family: 'kaloyan',
  stateKey: 'sim1414',
  i18nPrefix: 'battlesim1414',
});

export let encounters = [];
export const loadRoster = createRosterLoader(definition.id, 'ENCOUNTERS', entries => {
  encounters = Object.freeze(entries);
});
