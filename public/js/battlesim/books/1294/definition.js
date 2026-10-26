import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({id:1294, title:'Witchfires of Leth', family:'crossroads', stateKey:'sim1294', i18nPrefix:'battlesim1294',
  defaultHero:Object.freeze({strength:14,intelligence:12,wisdom:8,constitution:13,dexterity:15,charisma:7,hp:24,maxHp:24,attackBonus:0,defenceBonus:0})});
let encounters = [];
export const getRoster = () => encounters;
export const loadRoster = createRosterLoader(definition.id,'CATALOG', entries => {
  if (entries.length !== 21 || entries.some(entry => !entry.section || !Array.isArray(entry.enemies) || !entry.enemies.length || !entry.rules)) {
    throw new Error('Incomplete Witchfires of Leth roster');
  }
  encounters = entries;
});
