import { createRosterLoader } from '../../roster-data.js';

export let VOYAGE_ENCOUNTERS = Object.freeze([]);
export let VOYAGE_DREAMS = Object.freeze([]);
export let VOYAGE_NAVIGATION = Object.freeze([]);
export let VOYAGE_ARGONAUTS = Object.freeze([]);
export let VOYAGE_SUPPORT = Object.freeze({});
export const loadRoster = createRosterLoader(529, 'CATALOG', rows => {
  const catalogs = ['VOYAGE_ENCOUNTERS', 'VOYAGE_DREAMS', 'VOYAGE_NAVIGATION']
    .map(name => rows.filter(row => row.catalog === name).map(row => row.spec));
  const support = rows.find(row => row.support)?.support;
  if (catalogs.some(rows => !rows.length) || !support?.argonauts?.length || !support.dragonTooth || !support.gnurlbash) throw new Error('Incomplete encounter catalogs');
  VOYAGE_ENCOUNTERS = Object.freeze(catalogs[0]);
  VOYAGE_DREAMS = Object.freeze(catalogs[1]);
  VOYAGE_NAVIGATION = Object.freeze(catalogs[2]);
  VOYAGE_ARGONAUTS = Object.freeze(support.argonauts);
  VOYAGE_SUPPORT = Object.freeze(support);
});
