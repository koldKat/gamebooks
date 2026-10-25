import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 809,
  title: 'Зората на Мрачните Лордове',
  family: 'lone-wolf',
  stateKey: 'sim809',
  i18nPrefix: 'battlesim809',
});
export const RULES_REVISION = 1;
export let ENCOUNTERS = [];
export const loadRoster = createRosterLoader(809, 'ENCOUNTERS', entries => {
  ENCOUNTERS = entries;
});
