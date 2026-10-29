import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id:1455,title:'Beneath the City of the White Wolf',family:'warhammer',stateKey:'sim1455',i18nPrefix:'battlesim1455'});
let roster=[],defaults;
export const getRoster=()=>roster;
export const getPlayerDefaults=()=>defaults;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  const player=entries.find(entry=>entry.playerDefaults)?.playerDefaults;
  if(entries.length!==71||new Set(entries.map(entry=>entry.section)).size!==71
      ||!player?.character||!player?.customEnemy||!player?.specialWeapon||!player?.interrogation
      ||entries.some(entry=>!entry.enemies?.length||!entry.initiative||!entry.taintLimit||!Array.isArray(entry.variants))) throw new Error('Incomplete Beneath the City of the White Wolf roster');
  roster=entries;defaults=player;
});
