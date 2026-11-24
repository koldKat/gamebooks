import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 1651,
  title: 'Alone Against the Flames',
  family: 'cthulhu-solo',
  stateKey: 'sim1651',
  i18nPrefix: 'battlesim1651',
});

export let encounters = [];

export const loadRoster = createRosterLoader(definition.id, 'ALONE_AGAINST_THE_FLAMES', rows => {
  if (!rows.length || rows.some(row => !row.id || !row.name || !row.enemies?.length)) {
    throw new Error('Incomplete combat catalog');
  }
  encounters = rows;
});
