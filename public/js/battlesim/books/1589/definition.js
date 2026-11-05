// Load Castle Quarras encounter entries and combat steps from the database catalog.
import {loadRosterDataset} from '../../roster-data.js';
import {normalizeStagedEncounter} from '../../engines/super-endless-quest/steps.js';

export const definition = Object.freeze({id:1589, title:'Escape from Castle Quarras',
  family:'super-endless-quest', combatMode:'staged', stateKey:'sim1589', i18nPrefix:'battlesim1589'});
export let ENCOUNTERS = [];
export let RULES = null;
let pending;
export function loadRoster(fetcher) {
  if (RULES) return Promise.resolve();
  if (!pending) pending = Promise.all(['ENCOUNTERS','COMBAT_STEPS','RULES']
    .map(key => loadRosterDataset(definition.id, key, fetcher)))
    .then(([entries, steps, rules]) => {
      if (!entries.length || rules.length !== 1 || steps.some(s => !s.sourcePdfPages?.length)
          || entries.some(e => !e.section || !e.sourcePdfPages?.length)) throw new RangeError('The printed combat data is unavailable.');
      const bySection = new Map(steps.map(step => [step.section, step]));
      if (bySection.size !== steps.length) throw new RangeError('Duplicate combat section');
      const encounters = entries.map(entry => {
        const seen = new Set(), queue = [entry.section];
        while (queue.length) {
          const section = queue.pop();
          if (seen.has(section)) continue;
          const step = bySection.get(section);
          if (!step) throw new RangeError('Missing combat continuation');
          seen.add(section);
          for (const route of step.choices ?? [step.success, step.failure]) if (route.next) queue.push(route.next);
        }
        const encounter = {...entry, steps:[...seen].map(section => bySection.get(section))};
        normalizeStagedEncounter(encounter); return encounter;
      });
      ENCOUNTERS = encounters; RULES = rules[0];
    }).finally(() => { pending = null; });
  return pending;
}
