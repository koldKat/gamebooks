import {createRosterLoader} from '../../roster-data.js';

export const definition=Object.freeze({id:1300,title:'Deryni Challenge',family:'crossroads',stateKey:'sim1300',i18nPrefix:'battlesim1300',defaultHero:Object.freeze({strength:13,intelligence:12,wisdom:11,constitution:13,dexterity:13,charisma:13,hp:19,maxHp:19,attackBonus:0,defenceBonus:0})});
let encounters=[];
export const getRoster=()=>encounters;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  if(entries.length!==2||entries.some(entry=>!entry.section||!Array.isArray(entry.enemies)||!entry.enemies.length||!entry.rules))throw new Error('Incomplete Deryni Challenge roster');
  encounters=entries;
});
