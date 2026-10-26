import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({id:1293, title:'Revolt on Majipoor', family:'crossroads', stateKey:'sim1293', i18nPrefix:'battlesim1293',
  defaultHero:Object.freeze({strength:16,intelligence:14,wisdom:11,constitution:13,dexterity:14,charisma:12,hp:18,maxHp:18,attackBonus:0,defenceBonus:0})});
let encounters = [];
export const getRoster = () => encounters;
export const loadRoster = createRosterLoader(definition.id,'CATALOG', entries => {
  if (entries.length !== 12 || entries.some(entry => !entry.section || !Array.isArray(entry.enemies) || !entry.enemies.length || !entry.rules)) {
    throw new Error('Incomplete Revolt on Majipoor roster');
  }
  encounters = entries;
});
