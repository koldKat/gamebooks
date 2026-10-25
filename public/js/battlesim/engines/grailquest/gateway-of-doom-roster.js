import { createRosterLoader } from '../../roster-data.js';

export let GATEWAY_ENCOUNTERS = Object.freeze([]);
export let GATEWAY_WANDERING = Object.freeze([]);
export let GATEWAY_DREAMS = Object.freeze([]);
export const GATEWAY_RULES = {};
export const loadRoster = createRosterLoader(528, 'CATALOG', rows => {
  const rules = rows.find(row => row.spec.bookRules)?.spec.bookRules;
  const catalogs = ['GATEWAY_ENCOUNTERS', 'GATEWAY_WANDERING', 'GATEWAY_DREAMS'].map(name => rows.filter(row => row.catalog === name).map(row => {
    const { bookRules, ...spec } = row.spec;
    return spec;
  }));
  if (catalogs.some(rows => !rows.length)) throw new Error('Incomplete encounter catalogs');
  if (!rules) throw new Error('Missing encounter settings');
  Object.assign(GATEWAY_RULES, rules);
  GATEWAY_ENCOUNTERS = Object.freeze(catalogs[0]);
  GATEWAY_WANDERING = Object.freeze(catalogs[1]);
  GATEWAY_DREAMS = Object.freeze(catalogs[2]);
});
