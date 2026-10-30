// Identify The Legion at War and load its reviewed fleet catalog from the database.
import { createRosterLoader } from '../../roster-data.js';
import { combatCommandHits } from '../../engines/combat-command/core.js';

export const definition = Object.freeze({ id: 1471, title: 'The Legion at War', family: 'combat-command-fleet',
  stateKey: 'sim1471', i18nPrefix: 'battlesim1471' });
let roster = [], defaults, charts;
export const getRoster = () => roster;
export const getPlayerDefaults = () => defaults;
export const getCharts = () => charts;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  const first = entries.find(entry => entry.playerDefaults && entry.charts);
  if (entries.length !== 52 || new Set(entries.map(entry => entry.key)).size !== 52
      || new Set(entries.map(entry => entry.section)).size !== 10
      || first?.playerDefaults?.playerUnits?.length !== 2 || !first.playerDefaults.fortress
      || !first.playerDefaults.customPlayer || !first.playerDefaults.customEnemy
      || Object.keys(first.charts).sort().join('') !== 'ABCDEFG'
      || entries.some(entry => entry.family !== definition.family || !entry.combatOnly || entry.storyNavigation !== false)) {
    throw new Error('Incomplete Legion at War fleet roster');
  }
  for (const chart of Object.keys(first.charts)) combatCommandHits(first.charts, chart, 1, 2);
  roster = entries; defaults = first.playerDefaults; charts = first.charts;
});
