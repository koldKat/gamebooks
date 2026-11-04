// Load Trials of the First Moon identity, printed encounters and chart from the database.
import { loadRosterDataset } from '../../roster-data.js';
import { validateChart } from '../../engines/shinte/core.js';

export const definition = Object.freeze({id: 1566, title: 'Trials of the First Moon', family: 'shinte',
  stateKey: 'sim1566', i18nPrefix: 'battlesim1566'});
export let ENCOUNTERS = [];
export let RULES = null;
let pending;
export function loadRoster(fetcher) {
  if (RULES) return Promise.resolve();
  if (!pending) pending = Promise.all([
    loadRosterDataset(definition.id, 'ENCOUNTERS', fetcher),
    loadRosterDataset(definition.id, 'RULES', fetcher),
  ]).then(([encounters, rules]) => {
    if (!encounters.length || rules.length !== 1 || encounters.some(row => !row.section
        || ![row.cs, row.ds, row.pp].every(Number.isInteger) || row.pp < 1)) throw new RangeError('Invalid printed combat data.');
    validateChart(rules[0].chart);
    ENCOUNTERS = encounters;
    RULES = rules[0];
  }).finally(() => { pending = null; });
  return pending;
}
