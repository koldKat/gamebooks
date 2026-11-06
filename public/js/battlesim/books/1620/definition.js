// Load The Dread Vault of Tgozur's opponents and encounter rules from the database.
import {loadRosterDataset} from '../../roster-data.js';
import {normalizeD20Actor} from '../../engines/d20/core.js';

export const definition=Object.freeze({id:1620,title:'The Dread Vault of Tgozur',family:'d20',stateKey:'sim1620',i18nPrefix:'battlesim1620'});
export let OPPONENTS=[],ENCOUNTERS=[],RULES=null;
let pending;
export function loadRoster(fetcher){
  if(RULES)return Promise.resolve();
  if(!pending){
    const source=Promise.resolve().then(()=>fetcher('/api/books/1620/enemies')).then(response=>{
      if(!response.ok)throw Error('Could not load the book roster');return response.json();
    });
    const cached=async()=>({ok:true,json:()=>source});
    pending=Promise.all(['OPPONENTS','ENCOUNTERS','RULES'].map(key=>loadRosterDataset(1620,key,cached))).then(([profiles,entries,rules])=>{
      if(profiles.length!==11||entries.length!==18||rules.length!==1||!rules[0].arena||!rules[0].quicksand)throw RangeError('Incomplete combat roster');
      const opponents=profiles.map(normalizeD20Actor),byKey=new Map(opponents.map(row=>[row.key,row]));
      if(byKey.size!==profiles.length||new Set(entries.map(row=>row.key)).size!==entries.length)throw RangeError('Duplicate combat entry');
      const encounters=entries.map(entry=>{
        const profile=byKey.get(entry.opponentKey);
        if(!profile||!entry.sourcePdfPages?.length||!Number.isSafeInteger(entry.count)||entry.count<1||entry.count>30)throw RangeError('Invalid combat preset');
        return{...entry,profiles:[{...structuredClone(profile),count:entry.count}],contextRules:rules[0]};
      });
      OPPONENTS=opponents;ENCOUNTERS=encounters;RULES=rules[0];
    }).finally(()=>{pending=null;});
  }
  return pending;
}
