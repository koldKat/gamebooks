// Identity and database-owned personnel combat profiles for Dorsai’s Command.
import { createRosterLoader } from '../../roster-data.js';

export const definition=Object.freeze({id:1474,title:'Dorsai’s Command',family:'combat-command',
  stateKey:'sim1474',i18nPrefix:'battlesim1474'});
let roster=[],charts,defaults;
export const getRoster=()=>roster;
export const getCharts=()=>charts;
export const getPlayerDefaults=()=>defaults;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  const first=entries.find(e=>e.charts&&e.playerDefaults);
  if(entries.length!==43||new Set(entries.map(e=>e.section)).size!==43||!first
      ||first.playerDefaults.friendlyProfiles?.length!==21
      ||Object.keys(first.charts).sort().join('')!=='ABCDEFG'
      ||entries.some(e=>!Array.isArray(e.enemies)||!e.rules))throw new Error('Incomplete Dorsai combat catalog');
  for(const matrix of Object.values(first.charts))if(matrix.length!==11||matrix.some(row=>!Array.isArray(row)
      ||row.length!==11||row.some(value=>!Number.isSafeInteger(value)||value<0)))throw new Error('Invalid Combat Command chart');
  roster=entries;charts=first.charts;defaults=first.playerDefaults;
});
