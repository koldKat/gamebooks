// Load this edition's combat table and encounter presets from its database roster.
import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({id: 283, title: 'Beyond the Nightmare Gate', family: 'lone-wolf',
  stateKey: 'sim283', i18nPrefix: 'battlesim283', dateLocale: 'en-US',
  requireBookContext: true, roundWillpowerChoice: true, lockCombatSetup: true,
  itemModifiers: Object.freeze(['dagger']), daggerBonus: 0, companionOption: true, ceaseOption: true});

let COMBAT_TABLE = [], ENCOUNTER_RULES = {}, DEADLINES = {}, VICTORY_ROUTES = {};
export const loadRoster = createRosterLoader(283, 'ENCOUNTER_RULES', entries => {
  const table = entries.find(entry => entry.combatTable)?.combatTable;
  if (!Array.isArray(table) || table.length !== 10 || table.some(row => !Array.isArray(row) || row.length !== 13
      || row.some(cell => !Array.isArray(cell) || cell.length !== 2
        || cell.some(value => value !== 'K' && (!Number.isSafeInteger(value) || value < 0))))) {
    throw new Error('The original Nightmare Gate combat table is missing or invalid');
  }
  if (entries.length !== 14) throw new Error('The Nightmare Gate encounter roster is incomplete');
  COMBAT_TABLE = table;
  ENCOUNTER_RULES = Object.fromEntries(entries.map(entry => [entry.section, entry.rules]));
  DEADLINES = Object.fromEntries(entries.filter(entry => entry.rules.deadline).map(entry => [entry.section, entry.rules.deadline]));
  VICTORY_ROUTES = Object.fromEntries(entries.filter(entry => entry.rules.victoryRoutes).map(entry => [entry.section, entry.rules.victoryRoutes]));
});
export const getRules = () => ({COMBAT_TABLE, ENCOUNTER_RULES, DEADLINES, VICTORY_ROUTES, NEIJJIN: []});
