// Load Dracula's Castle identity and reviewed encounter presets from the database.
import {loadRosterDataset} from '../../roster-data.js';

export const definition = Object.freeze({id:1575, title:"Dracula's Castle", family:'horror-classic',
  stateKey:'sim1575', i18nPrefix:'battlesim1575'});
export let ENCOUNTERS = [];
export let ALLIES = [];
export let RULES = null;
let pending;
export function loadRoster(fetcher) {
  if (RULES) return Promise.resolve();
  if (!pending) pending = Promise.all([
    loadRosterDataset(definition.id,'ENCOUNTERS',fetcher),
    loadRosterDataset(definition.id,'RULES',fetcher),
    loadRosterDataset(definition.id,'ALLIES',fetcher),
  ]).then(([encounters,rules,allies]) => {
    if (!encounters.length || rules.length !== 1 || encounters.some(row => !row.section || !row.name
        || !row.rules || !row.mode || !row.sourcePdfPages?.length)) {
      throw new RangeError('The printed combat data is unavailable.');
    }
    ENCOUNTERS = encounters;
    ALLIES = allies;
    RULES = rules[0];
  }).finally(() => {pending = null;});
  return pending;
}
