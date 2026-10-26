import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({id:1290, title:'Encyclopedia of Xanth', family:'crossroads', stateKey:'sim1290', i18nPrefix:'battlesim1290',
  defaultHero:Object.freeze({strength:14,intelligence:12,wisdom:13,constitution:16,dexterity:11,charisma:14,hp:21,maxHp:21,attackBonus:0,defenceBonus:0})});
let encounters = [];
export const getRoster = () => encounters;
export const loadRoster = createRosterLoader(definition.id,'CATALOG', entries => {
  if (entries.length !== 10 || entries.some(entry => !entry.section || !Array.isArray(entry.enemies) || !entry.enemies.length || !entry.rules)) {
    throw new Error('Incomplete Encyclopedia of Xanth roster');
  }
  encounters = entries;
});
