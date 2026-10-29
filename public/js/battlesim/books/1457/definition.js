import { createRosterLoader } from '../../roster-data.js';
export const definition = Object.freeze({id:1457,title:'Shadows over Sylvania',family:'warhammer',stateKey:'sim1457',i18nPrefix:'battlesim1457'});
let roster=[], defaults;
export const getRoster=()=>roster;
export const getPlayerDefaults=()=>defaults;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  const player=entries.find(entry=>entry.playerDefaults)?.playerDefaults;
  if(entries.length!==99||new Set(entries.map(entry=>entry.section)).size!==99
    ||player?.bloodlines?.length!==3||!player?.localEquipment?.length||!player?.continuations?.length
    ||entries.some(entry=>!entry.enemies?.length||!entry.initiative||!entry.win))throw new Error('Incomplete Shadows over Sylvania roster');
  roster=entries;defaults=player;
});
