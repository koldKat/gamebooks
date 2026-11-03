// Identity and database-backed encounter loading for The Crystal Maze.
import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id: 1555, title: 'The Crystal Maze', family: 'crystal-maze',
  stateKey: 'sim1555', i18nPrefix: 'battlesim1555'});
export let ENCOUNTERS = [];
export const loadRoster = createRosterLoader(definition.id, 'ENCOUNTERS', rows => {
  if (!rows.length || rows.some(row => !['opposed', 'crossbow'].includes(row.mode)
      || !Number.isInteger(row.rating))) throw new Error('Invalid Crystal Maze encounters');
  ENCOUNTERS = rows;
});
