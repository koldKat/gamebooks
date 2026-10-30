// Identity and database-owned personnel combat profiles for Cold Cash Warrior.
import { createRosterLoader } from '../../roster-data.js';
export const definition=Object.freeze({id:1475,title:'Cold Cash Warrior',family:'combat-command',stateKey:'sim1475',i18nPrefix:'battlesim1475'});
let roster=[],charts,defaults;
export const getRoster=()=>roster;
export const getCharts=()=>charts;
export const getPlayerDefaults=()=>defaults;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  const first=entries.find(entry=>entry.charts&&entry.playerDefaults);
  if(entries.length!==36||new Set(entries.map(entry=>entry.section)).size!==36||!first
      ||first.playerDefaults.friendlyProfiles?.length!==5||Object.keys(first.charts).sort().join('')!=='ABCDEFG'
      ||entries.some(entry=>!Array.isArray(entry.enemies)||!entry.rules))throw new Error('Incomplete Cold Cash Warrior combat catalog');
  for(const matrix of Object.values(first.charts))if(matrix.length!==11||matrix.some(row=>!Array.isArray(row)||row.length!==11
      ||row.some(value=>!Number.isSafeInteger(value)||value<0)))throw new Error('Invalid Combat Command chart');
  roster=entries;charts=first.charts;defaults=first.playerDefaults;
});
