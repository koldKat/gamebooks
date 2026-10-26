import {createRosterLoader} from '../../roster-data.js';

export const definition=Object.freeze({id:1298,title:'Warhorn',family:'crossroads',stateKey:'sim1298',i18nPrefix:'battlesim1298',getCustomRules:()=>encounters[0]?.customRules??{},extraCharacterFields:Object.freeze(['healingSips']),characterLimits:Object.freeze({healingSips:5}),defaultHero:Object.freeze({strength:13,intelligence:12,wisdom:14,constitution:15,dexterity:12,charisma:12,hp:20,maxHp:20,attackBonus:0,defenceBonus:0,healingSips:0})});
let encounters=[];
export const getRoster=()=>encounters;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  if(entries.length!==15||entries.some(entry=>!entry.section||!Array.isArray(entry.enemies)||!entry.enemies.length||!entry.rules))throw new Error('Incomplete Warhorn roster');
  encounters=entries;
});
