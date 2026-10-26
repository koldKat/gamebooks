import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({id:1291, title:'Dragonharper', family:'crossroads', stateKey:'sim1291', i18nPrefix:'battlesim1291',
  defaultHero:Object.freeze({strength:13,intelligence:16,wisdom:13,constitution:15,dexterity:14,charisma:15,hp:21,maxHp:21,attackBonus:0,defenceBonus:0})});
let encounters = [];
export const getRoster = () => encounters;
export const loadRoster = createRosterLoader(definition.id,'CATALOG', entries => {
  if (entries.length !== 13 || entries.some(entry => !entry.section || !Array.isArray(entry.enemies) || !entry.enemies.length || !entry.rules)) {
    throw new Error('Incomplete Dragonharper roster');
  }
  encounters = entries;
});
