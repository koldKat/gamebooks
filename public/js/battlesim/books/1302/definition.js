import {createRosterLoader} from '../../roster-data.js';

export const definition=Object.freeze({id:1302,title:'Ghost of a Chance',family:'crossroads',stateKey:'sim1302',i18nPrefix:'battlesim1302',extraCharacterFields:Object.freeze(['age']),defaultHero:Object.freeze({strength:14,intelligence:13,wisdom:13,constitution:12,dexterity:11,charisma:14,hp:23,maxHp:23,age:25,attackBonus:0,defenceBonus:0})});
let encounters=[];
export const getRoster=()=>encounters;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  if(entries.length!==9||entries.some(entry=>!entry.section||!Array.isArray(entry.enemies)||!entry.enemies.length||!entry.rules))throw new Error('Incomplete Ghost of a Chance roster');
  encounters=entries;
});
