// Define the book's combat defaults and load reviewed presets from the roster database.
import {createRosterLoader} from '../../roster-data.js';
import {normalizeEncounter} from './combat.js';

export const definition = Object.freeze({id:603, title:'Moon Knight: Age of Anubis',
  family:'marvel-multiverse-missions', stateKey:'sim603', i18nPrefix:'battlesim603'});
export const customRules = {goal:{kind:'manual'}};
export const encounters = [];
export const loadRoster = createRosterLoader(603, 'CATALOG', rows => {
  const entries = rows.map(row => normalizeEncounter(row.spec));
  if (entries.length !== 36 || new Set(entries.map(entry => entry.key)).size !== 36) throw new Error('Incomplete combat roster');
  encounters.splice(0, encounters.length, ...entries);
});
