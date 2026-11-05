// Load The Bounty Hunter's identity and combat presets from the protected catalog.
import {loadRosterDataset} from '../../roster-data.js';

export const definition=Object.freeze({id:1578,title:'Star Wars: The Bounty Hunter',family:'lost-jedi',stateKey:'sim1578',i18nPrefix:'battlesim1578'});
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
