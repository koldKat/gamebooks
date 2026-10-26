import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({id:1296, title:'Dzurlord', family:'crossroads', stateKey:'sim1296', i18nPrefix:'battlesim1296',extraCharacterFields:Object.freeze(['damageReduction']),
  defaultHero:Object.freeze({strength:14,intelligence:10,wisdom:8,constitution:15,dexterity:15,charisma:13,hp:18,maxHp:18,attackBonus:0,defenceBonus:0,damageReduction:0})});
let encounters = [];
export const getRoster = () => encounters;
export const loadRoster = createRosterLoader(definition.id,'CATALOG', entries => {
  if (entries.length !== 13 || entries.some(entry => !entry.section || !Array.isArray(entry.enemies) || !entry.enemies.length || !entry.rules)) {
    throw new Error('Incomplete Dzurlord roster');
  }
  encounters = entries;
});
