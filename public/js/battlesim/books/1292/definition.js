import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({id:1292, title:'Storm of Dust', family:'crossroads', stateKey:'sim1292', i18nPrefix:'battlesim1292',
  defaultHero:Object.freeze({strength:15,intelligence:13,wisdom:12,constitution:14,dexterity:14,charisma:11,hp:19,maxHp:19,attackBonus:0,defenceBonus:0})});
let encounters = [];
export const getRoster = () => encounters;
export const loadRoster = createRosterLoader(definition.id,'CATALOG', entries => {
  if (entries.length !== 16 || entries.some(entry => !entry.section || !Array.isArray(entry.enemies) || !entry.enemies.length || !entry.rules)) {
    throw new Error('Incomplete Storm of Dust roster');
  }
  encounters = entries;
});
