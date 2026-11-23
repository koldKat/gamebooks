import {loadRosterDataset} from '../../roster-data.js';
import {normalizeKingfisherEncounter} from '../../engines/kingfisher/core.js';

const bookId = 1609;
export const definition = Object.freeze({
  id:bookId, title:'Greek Quest', family:'kingfisher', stateKey:'sim1609',
  i18nPrefix:'battlesim1609', sectionVariants:true,
});

export let ENCOUNTERS = [];
export let RULES = null;
let pending;

export function loadRoster(fetcher) {
  if (RULES) return Promise.resolve();
  if (!pending) {
    const source = Promise.resolve().then(() => fetcher(`/api/books/${bookId}/enemies`));
    const cached = async () => {
      const response = await source;
      if (!response.ok) throw new Error('Could not load the book roster');
      data ??= response.json();
      return {ok:true, json:() => data};
    };
    let data;
    pending = Promise.all(['ENCOUNTERS','RULES'].map(dataset => loadRosterDataset(bookId, dataset, cached)))
      .then(([entries, rules]) => {
        if (rules.length !== 1 || !Array.isArray(rules[0].contextOptions) || !entries.length
            || entries.some(entry => !entry.key || !entry.sourcePdfPages?.length)
            || new Set(entries.map(entry => entry.key)).size !== entries.length) {
          throw new RangeError('Incomplete combat roster');
        }
        ENCOUNTERS = entries.map(normalizeKingfisherEncounter);
        RULES = rules[0];
      }).finally(() => { pending = null; });
  }
  return pending;
}
