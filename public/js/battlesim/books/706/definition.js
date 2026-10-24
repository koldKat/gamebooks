import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 706,
  title: 'Синът на пустинята',
  family: 'son-of-the-desert',
  stateKey: 'sim706',
  i18nPrefix: 'battlesim706',
});

export let POSITIONS = Object.freeze({});
export const loadRoster = createRosterLoader(706, 'POSITIONS', entries => {
  POSITIONS = Object.freeze(Object.fromEntries(entries.map(({key, rule}) => [key, rule])));
});
