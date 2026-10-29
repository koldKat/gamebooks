import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({ id:1467, title:'Cut by Emerald', family:'combat-command',
  stateKey:'sim1467', i18nPrefix:'battlesim1467' });
let roster = [], defaults, charts;
export const getRoster = () => roster;
export const getPlayerDefaults = () => defaults;
export const getCharts = () => charts;
export const loadRoster = createRosterLoader(definition.id,'CATALOG',entries => {
  const first = entries.find(entry => entry.playerDefaults && entry.charts);
  if (entries.length !== 26 || new Set(entries.map(entry => entry.section)).size !== 26
      || !first?.playerDefaults?.fleet?.length || !first.playerDefaults.instructions || !first.playerDefaults.customEnemy
      || entries.some(entry => !entry.enemies?.length)
      || Object.keys(first.charts).sort().join('') !== 'ABCDEFG') throw new Error('Incomplete Cut by Emerald roster');
  for (const matrix of Object.values(first.charts)) if (matrix.length !== 11 || matrix.some(row => row.length !== 11
      || row.some(value => !Number.isSafeInteger(value) || value < 0))) throw new Error('Incomplete Combat Command chart');
  roster = entries; defaults = first.playerDefaults; charts = first.charts;
});
