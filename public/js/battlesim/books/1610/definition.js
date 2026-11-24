import {loadRosterDataset} from '../../roster-data.js';
import {normalizeKingfisherEncounter} from '../../engines/kingfisher/core.js';

const bookId = 1610;
export const definition = Object.freeze({
  id:bookId, title:'Roman Quest', family:'kingfisher', stateKey:'sim1610', i18nPrefix:'battlesim1610',
});

export let ENCOUNTERS = [];
export let RULES = null;
let pending;

export function loadRoster(fetcher) {
  if (RULES) return Promise.resolve();
  if (!pending) {
    const data = Promise.resolve().then(() => fetcher(`/api/books/${bookId}/enemies`)).then(response => {
      if (!response.ok) throw new Error('Could not load the book roster');
      return response.json();
    });
    const cached = async () => ({ok:true, json:() => data});
    pending = Promise.all(['ENCOUNTERS','RULES'].map(dataset => loadRosterDataset(bookId, dataset, cached)))
      .then(([entries, rules]) => {
        if (rules.length !== 1 || !Array.isArray(rules[0].contextOptions) || !entries.length
            || entries.some(entry => !entry.sourcePdfPages?.length)
            || new Set(entries.map(entry => entry.section)).size !== entries.length) {
          throw new RangeError('Incomplete combat roster');
        }
        ENCOUNTERS = entries.map(normalizeKingfisherEncounter);
        RULES = rules[0];
      }).finally(() => { pending = null; });
  }
  return pending;
}
