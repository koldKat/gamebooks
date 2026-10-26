import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({id:1295, title:'Prospero’s Isle', family:'crossroads', stateKey:'sim1295', i18nPrefix:'battlesim1295',extraCharacterFields:Object.freeze(['damageReduction']),
  defaultHero:Object.freeze({strength:11,intelligence:14,wisdom:11,constitution:13,dexterity:15,charisma:3,hp:17,maxHp:17,attackBonus:0,defenceBonus:0,damageReduction:0})});
let encounters = [];
export const getRoster = () => encounters;
export const loadRoster = createRosterLoader(definition.id,'CATALOG', entries => {
  if (entries.length !== 7 || entries.some(entry => !entry.section || !Array.isArray(entry.enemies) || !entry.enemies.length || !entry.rules)) {
    throw new Error('Incomplete Prospero’s Isle roster');
  }
  encounters = entries;
});
