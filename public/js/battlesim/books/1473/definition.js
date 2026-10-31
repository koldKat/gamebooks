// Identify Lord of Lances and load its formation combat rules from the database.
import { createRosterLoader } from '../../roster-data.js';
import { combatCommandHits } from '../../engines/combat-command/core.js';

export const definition = Object.freeze({id:1473,title:'Lord of Lances',family:'combat-command',
  combatMode:'formation',stateKey:'sim1473',i18nPrefix:'battlesim1473'});
let roster = [], defaults, charts, profiles = [];
export const getRoster = () => roster;
export const getPlayerDefaults = () => defaults;
export const getCharts = () => charts;
export const getUnitProfiles = () => profiles;
export const loadRoster = createRosterLoader(definition.id,'CATALOG',entries => {
  const first = entries.find(entry => entry.charts && entry.playerDefaults && entry.sourceUnitProfiles);
  if (entries.length !== 27 || new Set(entries.map(entry => entry.section)).size !== 27
      || !first?.playerDefaults.customPlayer || !first.playerDefaults.customEnemy
      || first.sourceUnitProfiles.length !== 29
      || Object.keys(first.charts).sort().join('') !== 'ABCDEFG'
      || entries.some(entry => entry.combatMode !== definition.combatMode || entry.combatOnly !== true
        || entry.automaticStoryNavigation !== false || !Array.isArray(entry.playerUnits)
        || !Array.isArray(entry.enemies) || !Array.isArray(entry.rounds))) {
    throw new Error('Incomplete Lord of Lances combat catalog');
  }
  for (const chart of 'ABCDEFG') combatCommandHits(first.charts,chart,1,2);
  roster = entries;defaults = first.playerDefaults;charts = first.charts;profiles = first.sourceUnitProfiles;
});
