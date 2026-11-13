// Load Shadow Chaser encounter presets from the installed database.
import {createRosterLoader} from '../../roster-data.js';
import {normalizeEncounter} from './combat.js';

export const definition = Object.freeze({id:592, title:'Shadow Chaser',
  family:'usborne-adventure', stateKey:'sim592', i18nPrefix:'battlesim592'});
export const encounters = [];
export const loadRoster = createRosterLoader(592, 'CATALOG', rows => {
  const entries = rows.map(row => normalizeEncounter(row.spec));
  if (entries.length !== 34 || new Set(entries.map(entry => entry.key)).size !== 34) throw new Error('Incomplete Shadow Chaser roster');
  encounters.splice(0, encounters.length, ...entries);
});
