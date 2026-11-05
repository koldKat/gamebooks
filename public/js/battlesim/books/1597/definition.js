// Load Clash of the Sorcerers's combat procedures and custom encounter templates from the database.
import {loadRosterDataset} from '../../roster-data.js';
import {normalizeProcedure} from '../../engines/procedural-quest/core.js';

export const definition = Object.freeze({id:1597, title:'Clash of the Sorcerers',
  family:'procedural-quest', stateKey:'sim1597', i18nPrefix:'battlesim1597'});
export let ENCOUNTERS = [];
export let RULES = null;
let pending;
export function loadRoster(fetcher) {
  if (RULES) return Promise.resolve();
  if (!pending) {
    const source = Promise.resolve().then(() => fetcher(`/api/books/${definition.id}/enemies`))
      .then(response => {
        if (!response.ok) throw new Error('Could not load the book roster');
        return response.json();
      });
    const cachedFetch = async () => ({ok:true, json:() => source});
    pending = Promise.all(['ENCOUNTERS', 'COMBAT_STEPS', 'RULES']
    .map(key => loadRosterDataset(definition.id, key, cachedFetch)))
    .then(([entries, steps, rules]) => {
      if (!entries.length || rules.length !== 1 || !rules[0].customProfiles
          || !Array.isArray(rules[0].customOpponentFields)
          || steps.some(step => !step.sourcePdfPages?.length)
          || entries.some(entry => !entry.sourcePdfPages?.length)) throw new RangeError('The printed combat data is unavailable.');
      const byId = new Map(steps.map(step => [step.id, step]));
      if (byId.size !== steps.length || new Set(entries.map(entry => entry.key)).size !== entries.length) {
        throw new RangeError('Duplicate combat entry');
      }
      const encounters = entries.map(entry => {
        const seen = new Set(), queue = [entry.entry];
        while (queue.length) {
          const id = queue.pop();
          if (seen.has(id)) continue;
          const step = byId.get(id);
          if (!step) throw new RangeError('Missing combat action');
          seen.add(id);
          for (const route of step.routes ?? step.choices ?? []) queue.push(route.to);
        }
        const encounter = {...entry, steps:[...seen].map(id => byId.get(id))};
        normalizeProcedure(encounter);
        return encounter;
      });
      ENCOUNTERS = encounters; RULES = rules[0];
    }).finally(() => { pending = null; });
  }
  return pending;
}
