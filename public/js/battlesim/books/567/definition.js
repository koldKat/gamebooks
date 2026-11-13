// Load Craven Manor's reviewed combat encounters from the installed database.
import {createRosterLoader} from '../../roster-data.js';
import {normalizeEncounter} from './combat.js';

export const definition = Object.freeze({id:567, title:'The Ghosts of Craven Manor',
  family:'craven-manor', stateKey:'sim567', i18nPrefix:'battlesim567'});
export const encounters = [];
export const loadRoster = createRosterLoader(567, 'CATALOG', rows => {
  const entries = rows.map(row => normalizeEncounter(row.spec));
  if (entries.length !== 19 || new Set(entries.map(row => row.section)).size !== 19) throw new Error('Incomplete Craven Manor roster');
  encounters.splice(0, encounters.length, ...entries);
});
