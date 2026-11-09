// Load this edition's original combat table and encounter rules from its database roster.
import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({id: 284, title: 'War of the Wizards', family: 'lone-wolf',
  stateKey: 'sim284', i18nPrefix: 'battlesim284', dateLocale: 'en-US',
  requireBookContext: true, roundWillpowerChoice: true, lockCombatSetup: true,
  itemModifiers: Object.freeze([]), daggerBonus: 0, invulnerabilityOption: true,
  initialWillpower: 50, initialEndurance: 30, potionHeal: 6, refillablePotions: true});

let COMBAT_TABLE = [], ENCOUNTER_RULES = {}, DEADLINES = {}, VICTORY_ROUTES = {};
export const loadRoster = createRosterLoader(284, 'ENCOUNTER_RULES', entries => {
  const table = entries.find(entry => entry.combatTable)?.combatTable;
  if (!Array.isArray(table) || table.length !== 10 || table.some(row => !Array.isArray(row) || row.length !== 13
      || row.some(cell => !Array.isArray(cell) || cell.length !== 2
        || cell.some(value => value !== 'K' && (!Number.isSafeInteger(value) || value < 0))))) {
    throw new Error('The original War of the Wizards combat table is missing or invalid');
  }
  if (entries.length !== 36) throw new Error('The War of the Wizards encounter roster is incomplete');
  COMBAT_TABLE = table;
  ENCOUNTER_RULES = Object.fromEntries(entries.map(entry => [entry.section, entry.rules]));
  DEADLINES = Object.fromEntries(entries.filter(entry => entry.rules.deadline).map(entry => [entry.section, entry.rules.deadline]));
  VICTORY_ROUTES = Object.fromEntries(entries.filter(entry => entry.rules.victoryRoutes).map(entry => [entry.section, entry.rules.victoryRoutes]));
});
export const getRules = () => ({COMBAT_TABLE, ENCOUNTER_RULES, DEADLINES, VICTORY_ROUTES, NEIJJIN: []});
