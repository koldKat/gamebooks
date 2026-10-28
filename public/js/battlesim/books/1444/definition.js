import {createRosterLoader} from '../../roster-data.js';
export const definition=Object.freeze({id:1444,title:'Dueltrack',family:'car-wars',stateKey:'sim1444',i18nPrefix:'battlesim1444'});
let roster=[],vehicles=[],defaults,maintenance=[];
export const getRoster=()=>roster;
export const getVehicles=()=>vehicles;
export const getPlayerDefaults=()=>defaults;
export const getMaintenance=()=>maintenance;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  if(entries.length!==16||entries.some(e=>!e.section||!e.enemies?.length||!e.rules?.extendedCombat))throw new Error('Incomplete Car Wars roster');
  const profiles=entries.flatMap(e=>e.playerVehicles??[]),player=entries.find(e=>e.playerDefaults)?.playerDefaults;
  const repairs=entries.flatMap(e=>e.maintenance??[]);
  const expanded=entries.flatMap(entry=>[
    {...entry,baseSection:entry.section},
    ...(entry.variants??[]).map(variant=>({...entry,...variant,baseSection:entry.section,
      rules:{...entry.rules,...variant.rules},
      enemies:(variant.enemyIndices??entry.enemies.map((_,i)=>i)).map(i=>structuredClone(entry.enemies[i])),
    })),
  ]);
  if(profiles.length!==3||!player?.personalWeaponOptions?.length||repairs.length!==3
      ||expanded.length!==37||new Set(expanded.map(e=>e.section)).size!==37)throw new Error('Incomplete Car Wars profiles or variants');
  vehicles=profiles;defaults=player;maintenance=repairs;roster=expanded;
});
