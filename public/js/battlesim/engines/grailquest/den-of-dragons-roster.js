import { createRosterLoader } from '../../roster-data.js';

export let DEN_ENCOUNTERS = Object.freeze([]);
export let DEN_DREAM_FIGHTS = Object.freeze([]);
export const loadRoster = createRosterLoader(527, 'CATALOG', rows => {
  const catalogs = ['DEN_ENCOUNTERS', 'DEN_DREAM_FIGHTS'].map(name => rows.filter(row => row.catalog === name).map(row => row.spec));
  if (catalogs.some(rows => !rows.length)) throw new Error('Incomplete encounter catalogs');
  DEN_ENCOUNTERS = Object.freeze(catalogs[0]);
  DEN_DREAM_FIGHTS = Object.freeze(catalogs[1]);
});
