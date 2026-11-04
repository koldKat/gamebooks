// Load Jedi Dawn's identity and combat presets from the protected database catalog.
import {loadRosterDataset} from '../../roster-data.js';

export const definition=Object.freeze({id:1577,title:'Star Wars: Jedi Dawn',family:'lost-jedi',stateKey:'sim1577',i18nPrefix:'battlesim1577'});
export let ENCOUNTERS=[];
export let RULES=null;
let pending;
export function loadRoster(fetcher) {
  if (RULES) return Promise.resolve();
  if (!pending) pending=Promise.all(['ENCOUNTERS','RULES'].map(dataset=>loadRosterDataset(definition.id,dataset,fetcher)))
    .then(([encounters,rules])=>{
      if (!encounters.length || rules.length!==1 || encounters.some(row=>!row.section || !row.name
          || !Array.isArray(row.actors) || !row.rules || !row.sourcePdfPages?.length)) throw new RangeError('The printed combat data is unavailable.');
      ENCOUNTERS=encounters;RULES=rules[0];
    }).finally(()=>{pending=null;});
  return pending;
}
