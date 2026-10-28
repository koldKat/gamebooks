import {createRosterLoader} from '../../roster-data.js';
export const definition=Object.freeze({id:1437,title:'The Legend of Weathertop',family:'tolkien-quest',stateKey:'sim1437',i18nPrefix:'battlesim1437',itemModifiers:[
  {key:'mithrilBelt',bonuses:{ob:1,db:1}},
  {key:'enchantedCloak',bonuses:{db:1,trickery:1}},
  {key:'purpleBerries',bonuses:{ob:-1,db:-1,running:-1,trickery:-1,magic:-1}},
]});
let roster=[];
export const getRoster=()=>roster;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  if(entries.length!==20||entries.some(e=>!e.section||!e.enemies?.length||!e.rules||e.enemies.some(enemy=>!Number.isSafeInteger(enemy.ob)||!Number.isSafeInteger(enemy.db)||!Number.isSafeInteger(enemy.endurance)||enemy.endurance<1)))throw new Error('Incomplete Tolkien Quest roster');
  roster=entries.flatMap(entry=>[entry,...(entry.derivedEncounters??[]).map(derived=>({...entry,...derived,rules:{...entry.rules,...derived.rules},enemies:structuredClone(entry.enemies.slice(0,derived.enemyCount??entry.enemies.length))}))]);
  if(roster.length!==37||new Set(roster.map(e=>e.section)).size!==37)throw new Error('Incomplete Tolkien Quest encounter references');
});
