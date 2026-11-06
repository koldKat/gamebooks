// Load Darkmoon's Curse opponent SKILL and printed combat notes from the database.
import {loadRosterDataset} from '../../roster-data.js';
import {normalizeFirstHitActor} from '../../engines/first-hit/core.js';
export const definition=Object.freeze({id:1622,title:"Darkmoon's Curse",family:'first-hit',stateKey:'sim1622',i18nPrefix:'battlesim1622'});
export let OPPONENTS=[],RULES=null;
let pending;
export function loadRoster(fetcher){
  if(RULES)return Promise.resolve();
  if(!pending){
    const source=Promise.resolve().then(()=>fetcher('/api/books/1622/enemies')).then(response=>{
      if(!response.ok)throw Error('Could not load the book roster');return response.json();
    });
    const cached=async()=>({ok:true,json:()=>source});
    pending=Promise.all(['OPPONENTS','RULES'].map(key=>loadRosterDataset(1622,key,cached))).then(([profiles,rules])=>{
      if(profiles.length!==8||rules.length!==1||rules[0].dice!==2||rules[0].diceSides!==6
        ||rules[0].firstAttacker!=='player'||rules[0].initialSkill!==8||rules[0].fightEndsOnFirstHit!==true
        ||rules[0].hitCondition!=='total>=defender.skill'||rules[0].singleOpponent!==true)throw RangeError('Incomplete combat roster');
      const opponents=profiles.map(normalizeFirstHitActor);
      if(new Set(opponents.map(row=>row.key)).size!==8||opponents.some(row=>!row.section||!row.sourcePdfPages?.length||!Array.isArray(row.sourceNotes)))throw RangeError('Invalid source opponent');
      OPPONENTS=opponents;RULES=rules[0];
    }).finally(()=>{pending=null;});
  }
  return pending;
}
