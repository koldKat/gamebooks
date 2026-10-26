import {createRosterLoader} from '../../roster-data.js';

export const definition=Object.freeze({id:1299,title:'Seven No-Trump',family:'crossroads',stateKey:'sim1299',i18nPrefix:'battlesim1299',defaultHero:Object.freeze({strength:11,intelligence:13,wisdom:9,constitution:14,dexterity:13,charisma:11,hp:23,maxHp:23,attackBonus:0,defenceBonus:0})});
let encounters=[];
export const getRoster=()=>encounters;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  if(entries.length!==6||entries.some(entry=>!entry.section||!Array.isArray(entry.enemies)||!entry.enemies.length||!entry.rules))throw new Error('Incomplete Seven No-Trump roster');
  encounters=entries;
});
