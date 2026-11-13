// Load the book's reviewed combat encounters from the installed roster database.
import {createRosterLoader} from '../../roster-data.js';
import {normalizeEncounter} from './combat.js';

export const definition = Object.freeze({id:601, title:'You Are (Not) Deadpool',
  family:'marvel-multiverse-missions', stateKey:'sim601', i18nPrefix:'battlesim601'});
export const encounters = [];
export const loadRoster = createRosterLoader(601, 'CATALOG', rows => {
  const entries = rows.map(row => normalizeEncounter(row.spec));
  if (entries.length !== 42 || new Set(entries.map(entry => entry.key)).size !== 42) throw new Error('Incomplete combat roster');
  encounters.splice(0, encounters.length, ...entries);
});
