import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 413,
  title: 'Призрачният вятър',
  family: 'magic-of-darkness',
  stateKey: 'sim413',
  i18nPrefix: 'battlesim413',
});

export let encounters = [];
export const loadRoster = createRosterLoader(definition.id, 'ENCOUNTERS', entries => {
  encounters = Object.freeze(entries);
});
