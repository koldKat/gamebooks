// Load Balance of Fate encounter presets from the installed database.
import {createRosterLoader} from '../../roster-data.js';
import {normalizeEncounter} from './combat.js';

export const definition = Object.freeze({id:581, title:'Balance of Fate: The Legorian Kings Saga',
  family:'savage-realms', stateKey:'sim581', i18nPrefix:'battlesim581'});
export const encounters = [];
export const loadRoster = createRosterLoader(581, 'CATALOG', rows => {
  const entries = rows.map(row => ({...normalizeEncounter(row.spec),
    companionSuggestion:row.spec.companionSuggestion, tableRoll:row.spec.tableRoll}));
  if (entries.length !== 168 || new Set(entries.map(entry => entry.key)).size !== 168) {
    throw new Error('Incomplete Balance of Fate roster');
  }
  encounters.splice(0, encounters.length, ...entries);
});
