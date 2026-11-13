// Declare this book's identity and load its reviewed encounter presets from the database.
import {createRosterLoader} from '../../roster-data.js';
import {normalizeEncounter} from '../../engines/dungeons-to-dominions/combat.js';

export const definition = Object.freeze({id:551, title:'The Castle of Blackwood Moors',
  family:'dungeons-to-dominions', stateKey:'sim551', i18nPrefix:'battlesim551'});
export const encounters = [];
export const loadRoster = createRosterLoader(551, 'CATALOG', rows => {
  const source = rows.map(row => normalizeEncounter(row.spec));
  if (source.length !== 72 || new Set(source.map(row => row.section)).size !== 72) throw new Error('Incomplete Blackwood Moors roster');
  encounters.splice(0, encounters.length, ...source);
});
