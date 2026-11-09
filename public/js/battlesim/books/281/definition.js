// Load this edition's original combat table and encounter presets from its database roster.
import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({id: 281, title: 'Grey Star the Wizard', family: 'lone-wolf',
  stateKey: 'sim281', i18nPrefix: 'battlesim281', dateLocale: 'en-US',
  requireBookContext: true, roundWillpowerChoice: true, lockCombatSetup: true});

let COMBAT_TABLE = [], ENCOUNTER_RULES = {}, DEADLINES = {}, NEIJJIN = [], VICTORY_ROUTES = {};
export const loadRoster = createRosterLoader(281, 'ENCOUNTER_RULES', entries => {
  const table = entries.find(entry => entry.combatTable)?.combatTable;
  if (!Array.isArray(table) || table.length !== 10 || table.some(row => !Array.isArray(row) || row.length !== 13
      || row.some(cell => !Array.isArray(cell) || cell.length !== 2
        || cell.some(value => value !== 'K' && (!Number.isSafeInteger(value) || value < 0))))) {
    throw new Error('The original Grey Star combat table is missing or invalid');
  }
  const sequence = entries.find(entry => entry.rules?.sequence)?.rules.sequence;
  if (entries.length !== 26 || sequence?.profiles?.length !== 9) throw new Error('The Grey Star encounter roster is incomplete');
  COMBAT_TABLE = table;
  ENCOUNTER_RULES = Object.fromEntries(entries.map(entry => [entry.section, entry.rules]));
  DEADLINES = Object.fromEntries(entries.filter(entry => entry.rules.deadline).map(entry => [entry.section, entry.rules.deadline]));
  VICTORY_ROUTES = Object.fromEntries(entries.filter(entry => entry.rules.victoryRoutes).map(entry => [entry.section, entry.rules.victoryRoutes]));
  NEIJJIN = sequence.profiles;
});
export const getRules = () => ({COMBAT_TABLE, ENCOUNTER_RULES, DEADLINES, NEIJJIN, VICTORY_ROUTES});
