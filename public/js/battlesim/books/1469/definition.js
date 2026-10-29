// Identity and database-owned encounter catalog for The Omega Rebellion.
import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({ id:1469, title:'The Omega Rebellion', family:'combat-command',
  stateKey:'sim1469', i18nPrefix:'battlesim1469',
  customNote:'Enter the forces currently engaged and their Ordnance or Melee values. Casualties immediately reduce attack strength. Leave dice blank to roll automatically.' });
let roster = [], defaults, charts;
export const getRoster = () => roster;
export const getPlayerDefaults = () => defaults;
export const getCharts = () => charts;
export const loadRoster = createRosterLoader(definition.id,'CATALOG',entries => {
  const first = entries.find(entry => entry.playerDefaults && entry.charts);
  if (entries.length !== 45 || new Set(entries.map(entry => entry.section)).size !== 45
      || !first?.playerDefaults?.customPlayer || !first.playerDefaults.customEnemy
      || entries.some(entry => !entry.enemies?.length)
      || Object.keys(first.charts).sort().join('') !== 'ABCDEFG') throw new Error('Incomplete Omega Rebellion roster');
  for (const matrix of Object.values(first.charts)) if (matrix.length !== 11 || matrix.some(row => row.length !== 11
      || row.some(value => !Number.isSafeInteger(value) || value < 0))) throw new Error('Incomplete Combat Command chart');
  roster = entries; defaults = first.playerDefaults; charts = first.charts;
});
