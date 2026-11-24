import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 1686,
  title: 'Gnomes-100, Dragons-0',
  family: 'catacombs',
  stateKey: 'sim1686',
  i18nPrefix: 'battlesim1686',
});

export let encounters = [];

export const loadRoster = createRosterLoader(definition.id, 'GNOMES_100_DRAGONS_0', rows => {
  if (!rows.length || rows.some(entry => !entry.key || !entry.name || !entry.profiles?.length)) {
    throw new Error('Incomplete Gnomes-100, Dragons-0 roster');
  }
  encounters = rows;
});
