// Identity and database-owned combat catalog for The Black Road War.
import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id:1472,title:'The Black Road War',family:'combat-command',
  stateKey:'sim1472',i18nPrefix:'battlesim1472',preservePlayerForce:true,
  customNote:'Enter your current surviving force and combat value. Choose the charts for this encounter. Leave dice blank to roll automatically.'});
let roster=[],defaults,charts;
export const getRoster=()=>roster;
export const getPlayerDefaults=()=>defaults;
export const getCharts=()=>charts;
export const loadRoster=createRosterLoader(definition.id,'CATALOG',entries=>{
  const first=entries.find(entry=>entry.playerDefaults&&entry.charts);
  if(entries.length!==18||new Set(entries.map(entry=>entry.section)).size!==18
      ||!first?.playerDefaults?.customPlayer||!first.playerDefaults.customEnemy
      ||entries.some(entry=>!entry.enemies?.length||entry.manualBlankChartResults!==true)
      ||Object.keys(first.charts).sort().join('')!=='ABCDEFG')throw new Error('Incomplete Black Road War roster');
  const blanks=[];
  for(const [chart,matrix]of Object.entries(first.charts)){
    if(matrix.length!==11||matrix.some(row=>!Array.isArray(row)||row.length!==11))throw new Error('Incomplete Combat Command chart');
    for(const [r,row]of matrix.entries())for(const [c,value]of row.entries()){
      if(value===null)blanks.push(`${chart}:${r}:${c}`);
      else if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid Combat Command chart');
    }
  }
  if(blanks.sort().join(',')!==['A:10:0','A:10:1','A:6:5'].join(','))throw new Error('Original chart blanks were changed');
  roster=entries;defaults=first.playerDefaults;charts=first.charts;
});
