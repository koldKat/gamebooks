// Load Egyptian Quest's printed combat presets and rule parameters from the database.
import {loadRosterDataset} from '../../roster-data.js';
import {normalizeKingfisherEncounter} from '../../engines/kingfisher/core.js';
export const definition = Object.freeze({id:1608, title:'Egyptian Quest', family:'kingfisher', stateKey:'sim1608', i18nPrefix:'battlesim1608'});
export let ENCOUNTERS = [];
export let RULES = null;
let pending;
export function loadRoster(fetcher) {
  if (RULES) return Promise.resolve();
  if (!pending) {
    const source = Promise.resolve().then(() => fetcher('/api/books/1608/enemies')).then(response => {
      if (!response.ok) throw new Error('Could not load the book roster');
      return response.json();
    });
    const cached = async () => ({ok:true, json:() => source});
    pending = Promise.all(['ENCOUNTERS','RULES'].map(key => loadRosterDataset(1608, key, cached))).then(([entries,rules]) => {
      if (!entries.length || rules.length !== 1 || !Array.isArray(rules[0].contextOptions)
          || entries.some(entry => !entry.sourcePdfPages?.length)
          || new Set(entries.map(entry => entry.section)).size !== entries.length) throw new RangeError('Incomplete combat roster');
      ENCOUNTERS = entries.map(normalizeKingfisherEncounter); RULES = rules[0];
    }).finally(() => { pending = null; });
  }
  return pending;
}
