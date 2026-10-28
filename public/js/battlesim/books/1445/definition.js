import {createRosterLoader} from '../../roster-data.js';
export const definition=Object.freeze({id:1445,title:'Badlands Run',family:'car-wars',stateKey:'sim1445',i18nPrefix:'battlesim1445'});
let roster=[],vehicles=[],defaults,maintenance=[],equipment;
export const getRoster=()=>roster;
export const getVehicles=()=>vehicles;
export const getPlayerDefaults=()=>defaults;
export const getMaintenance=()=>maintenance;
export const getLocalEquipment=()=>equipment;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  if(entries.length!==17||entries.some(entry=>!entry.section||!entry.enemies?.length||!entry.rules?.scenarioCombat))
    throw new Error('Incomplete Car Wars scenario roster');
  const profiles=entries.flatMap(entry=>entry.playerVehicles??[]);
  const player=entries.find(entry=>entry.playerDefaults)?.playerDefaults;
  const local=entries.find(entry=>entry.localEquipment)?.localEquipment;
  const repairs=entries.flatMap(entry=>entry.maintenance??[]);
  const expanded=entries.flatMap(entry=>[
    {...entry,baseSection:entry.rules.carryChaseStateFrom??entry.section},
    ...(entry.variants??[]).map(variant=>({...entry,...variant,baseSection:entry.section,
      rules:{...entry.rules,...variant.rules},enemies:structuredClone(entry.enemies)})),
  ]);
  if(profiles.length!==2||!player?.personalWeaponOptions?.length||!local?.items?.length
      ||expanded.length!==22||new Set(expanded.map(entry=>entry.section)).size!==22)
    throw new Error('Incomplete scenario profiles or variants');
  roster=expanded;vehicles=profiles;defaults=player;maintenance=repairs;equipment=local;
});
