import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id:1456,title:'Herald of Oblivion',family:'warhammer',stateKey:'sim1456',i18nPrefix:'battlesim1456'});
let roster = [], defaults;
export const getRoster = () => roster;
export const getPlayerDefaults = () => defaults;
export const loadRoster = createRosterLoader(definition.id,'CATALOG',entries => {
  const player = entries.find(entry => entry.playerDefaults)?.playerDefaults;
  if (entries.length !== 73 || new Set(entries.map(entry => entry.section)).size !== 73
      || !player?.basic || !player?.advanced || !player?.weaponPresets || !player?.customEnemy
      || entries.some(entry => !entry.enemies?.length || (!entry.win && !entry.winByPhase) || !entry.loss)) throw new Error('Incomplete Herald of Oblivion roster');
  roster = entries; defaults = player;
});
