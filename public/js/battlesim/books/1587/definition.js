// Load Prisoners of Pax Tharkas combat presets from the protected database catalog.
import {loadRosterDataset} from '../../roster-data.js';
import {normalizeEncounter} from '../../engines/super-endless-quest/core.js';

export const definition = Object.freeze({id:1587, title:'Prisoners of Pax Tharkas',
  family:'super-endless-quest', stateKey:'sim1587', i18nPrefix:'battlesim1587'});
export let ENCOUNTERS = [];
export let RULES = null;
let pending;
export function loadRoster(fetcher) {
  if (RULES) return Promise.resolve();
  if (!pending) pending = Promise.all(['ENCOUNTERS', 'RULES'].map(key => loadRosterDataset(definition.id, key, fetcher)))
    .then(([encounters, rules]) => {
      if (!encounters.length || rules.length !== 1 || encounters.some(entry => !entry.section || !entry.sourcePdfPages?.length)) {
        throw new RangeError('The printed combat data is unavailable.');
      }
      encounters.forEach(normalizeEncounter);
      ENCOUNTERS = encounters; RULES = rules[0];
    }).finally(() => { pending = null; });
  return pending;
}
