import { createRosterLoader } from '../../roster-data.js';

export let DEN_ENCOUNTERS = Object.freeze([]);
export let DEN_DREAM_FIGHTS = Object.freeze([]);
export const DEN_RULES = {};
export const loadRoster = createRosterLoader(527, 'CATALOG', rows => {
  const rules = rows.find(row => row.spec.bookRules)?.spec.bookRules;
  const catalogs = ['DEN_ENCOUNTERS', 'DEN_DREAM_FIGHTS'].map(name => rows.filter(row => row.catalog === name).map(row => {
    const { bookRules, ...spec } = row.spec;
    return spec;
  }));
  if (catalogs.some(rows => !rows.length)) throw new Error('Incomplete encounter catalogs');
  if (!rules) throw new Error('Missing encounter settings');
  Object.assign(DEN_RULES, rules);
  DEN_ENCOUNTERS = Object.freeze(catalogs[0]);
  DEN_DREAM_FIGHTS = Object.freeze(catalogs[1]);
});
