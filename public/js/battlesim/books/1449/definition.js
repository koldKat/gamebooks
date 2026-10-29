import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({ id: 1449, title: 'Zone Rangers', family: 'sonic-dual', stateKey: 'sim1449', i18nPrefix: 'battlesim1449' });
let roster = [], defaults;
export const getRoster = () => roster;
export const getPlayerDefaults = () => defaults;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  const player = entries.find(entry => entry.playerDefaults)?.playerDefaults;
  if (entries.length !== 21 || new Set(entries.map(entry => entry.section)).size !== 21
      || Object.keys(player?.heroes ?? {}).length !== 2 || !player?.abilityNames
      || entries.some(entry => !entry.enemies?.length || !entry.rules)) throw new Error('Incomplete dual-hero roster');
  roster = entries; defaults = player;
});
