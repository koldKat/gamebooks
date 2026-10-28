import {createRosterLoader} from '../../roster-data.js';

export const definition=Object.freeze({id:1436,title:'Night of the Nazgul',family:'tolkien-quest',stateKey:'sim1436',i18nPrefix:'battlesim1436'});
let roster=[];
export const getRoster=()=>roster;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  if(entries.length!==27||entries.some(e=>!e.section||!e.enemies?.length||!e.rules||e.enemies.some(enemy=>!Number.isSafeInteger(enemy.ob)||!Number.isSafeInteger(enemy.db)||!Number.isSafeInteger(enemy.endurance)||enemy.endurance<1)))throw new Error('Incomplete Tolkien Quest roster');
  roster=entries.flatMap(entry=>[entry,...(entry.derivedEncounters??[]).map(derived=>({...derived,enemies:structuredClone(entry.enemies)}))]);
  if(roster.length!==28)throw new Error('Incomplete Tolkien Quest encounter references');
});
