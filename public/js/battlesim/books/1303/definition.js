import {createRosterLoader} from '../../roster-data.js';

export const definition=Object.freeze({id:1303,title:"Fate’s Trick",family:'crossroads',stateKey:'sim1303',i18nPrefix:'battlesim1303',defaultHero:Object.freeze({strength:13,intelligence:15,wisdom:12,constitution:11,dexterity:15,charisma:11,hp:16,maxHp:16,attackBonus:0,defenceBonus:0})});
let encounters=[];
export const getRoster=()=>encounters;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  if(entries.length!==15||entries.some(entry=>!entry.section||!Array.isArray(entry.enemies)||!entry.enemies.length||!entry.rules.mechanics?.sequence))throw new Error('Incomplete Fate’s Trick roster');
  encounters=entries;
});
