// Identity and database-owned combat catalog for Slammers Down!.
import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id:1470, title:'Slammers Down!', family:'combat-command',
  stateKey:'sim1470', i18nPrefix:'battlesim1470', preservePlayerForce:true,
  forceTypes:[{value:'infantry',label:'Infantry squads'},{value:'tanks',label:'Armoured vehicles'}],
  customNote:'Enter your current surviving force. Mixed-force casualties alternate by type, infantry first. Choose which platoon takes losses first within each type. Leave dice blank to roll automatically.'});
let roster = [], defaults, charts;
export const getRoster = () => roster;
export const getPlayerDefaults = () => defaults;
export const getCharts = () => charts;
export const loadRoster = createRosterLoader(definition.id,'CATALOG',entries => {
  const first=entries.find(entry=>entry.playerDefaults&&entry.charts);
  if(entries.length!==56 || new Set(entries.map(entry=>entry.section)).size!==56
      || first?.playerDefaults?.playerUnits?.length!==5 || !first.playerDefaults.customPlayer
      || !first.playerDefaults.customEnemy || entries.some(entry=>!entry.enemies?.length)
      || Object.keys(first.charts).sort().join('')!=='ABCDEFG') throw new Error('Incomplete Slammers Down roster');
  for(const matrix of Object.values(first.charts))if(matrix.length!==11 || matrix.some(row=>row.length!==11
      || row.some(value=>!Number.isSafeInteger(value)||value<0))) throw new Error('Incomplete Combat Command chart');
  roster=entries;defaults=first.playerDefaults;charts=first.charts;
});
