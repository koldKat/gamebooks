import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({id:1297, title:'A Warlock’s Blade', family:'crossroads', stateKey:'sim1297', i18nPrefix:'battlesim1297',getCustomRules:()=>encounters[0]?.customRules??{},extraCharacterFields:Object.freeze(['armourBonus','healingSpells','misdirectionSpells','shortSwordBonus','gauntletRounds','repulsionPotion']),
  defaultHero:Object.freeze({strength:15,intelligence:13,wisdom:17,constitution:14,dexterity:17,charisma:10,hp:30,maxHp:30,attackBonus:0,defenceBonus:0,armourBonus:2,healingSpells:2,misdirectionSpells:3,shortSwordBonus:0,gauntletRounds:0,repulsionPotion:0})});
let encounters = [];
export const getRoster = () => encounters;
export const loadRoster = createRosterLoader(definition.id,'CATALOG', entries => {
  if (entries.length !== 17 || entries.some(entry => !entry.section || !Array.isArray(entry.enemies) || !entry.enemies.length || !entry.rules)) {
    throw new Error('Incomplete A Warlock’s Blade roster');
  }
  encounters = entries;
});
