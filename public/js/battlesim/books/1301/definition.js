import {createRosterLoader} from '../../roster-data.js';

export const definition=Object.freeze({id:1301,title:'Dragonfire',family:'crossroads',stateKey:'sim1301',i18nPrefix:'battlesim1301',defaultHero:Object.freeze({strength:14,intelligence:13,wisdom:13,constitution:15,dexterity:14,charisma:11,hp:21,maxHp:21,attackBonus:0,defenceBonus:0})});
let encounters=[];
export const getRoster=()=>encounters;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  if(entries.length!==4||entries.some(entry=>!entry.section||!Array.isArray(entry.enemies)||!entry.enemies.length||!entry.rules))throw new Error('Incomplete Dragonfire roster');
  encounters=entries;
});
