// Load Test of the Ninja's reviewed combat procedures from the database catalog.
import {loadRosterDataset} from '../../roster-data.js';
import {normalizeMartialEncounter} from '../../engines/martial-quest/core.js';

export const definition = Object.freeze({id:1591, title:'Test of the Ninja',
  family:'martial-quest', stateKey:'sim1591', i18nPrefix:'battlesim1591'});
export let ENCOUNTERS = [];
export let RULES = null;
let pending;

export function loadRoster(fetcher) {
  if (RULES) return Promise.resolve();
  if (!pending) pending = Promise.all(['ENCOUNTERS','COMBAT_STEPS','RULES']
    .map(key => loadRosterDataset(definition.id, key, fetcher)))
    .then(([entries, steps, rules]) => {
      if (!entries.length || rules.length !== 1 || steps.some(step => !step.sourcePdfPages?.length)
          || entries.some(entry => !entry.sourcePdfPages?.length)) throw new RangeError('The printed combat data is unavailable.');
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
          for (const key of ['pass','fail','next','low','high']) if (step[key]) queue.push(step[key]);
          for (const choice of step.choices ?? []) queue.push(choice.to);
          if (step.hpGate) queue.push(step.hpGate.low);
        }
        const encounter = {...entry, steps:[...seen].map(section => bySection.get(section))};
        normalizeMartialEncounter(encounter);
        return encounter;
      });
      ENCOUNTERS = encounters;
      RULES = rules[0];
    }).finally(() => { pending = null; });
  return pending;
}
