import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id:1454,title:'Hive of the Dead',family:'warhammer',stateKey:'sim1454',i18nPrefix:'battlesim1454'});
let roster = [], defaults;
export const getRoster = () => roster;
export const getPlayerDefaults = () => defaults;
export const loadRoster = createRosterLoader(definition.id,'CATALOG',entries => {
  const player = entries.find(entry => entry.playerDefaults)?.playerDefaults;
  if (entries.length !== 46 || new Set(entries.map(entry => entry.section)).size !== 46
      || !player?.basic || !player?.advanced || !player?.weaponPresets || !player?.customEnemy
      || entries.some(entry => !entry.enemies?.length || !entry.win || !entry.loss)) throw new Error('Incomplete Hive of the Dead roster');
  roster = entries; defaults = player;
});
