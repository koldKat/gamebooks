import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({ id: 1453, title: "Stormin' Sonic", family: 'sonic', stateKey: 'sim1453', i18nPrefix: 'battlesim1453' });
let roster = [], defaults;
export const getRoster = () => roster;
export const getPlayerDefaults = () => defaults;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  const player = entries.find(entry => entry.playerDefaults)?.playerDefaults;
  if (entries.length !== 60 || new Set(entries.map(entry => entry.section)).size !== 60
      || !player?.abilities || !player?.abilityNames || !player?.customEnemyDefaults
      || entries.some(entry => !entry.enemies?.length || !entry.ability || !entry.enemyCounterThreshold)) throw new Error('Incomplete Sonic roster');
  roster = entries; defaults = player;
});
