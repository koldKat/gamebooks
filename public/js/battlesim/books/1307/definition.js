// Identify Mochila and load its reviewed optional encounter presets from the database.
import {createRosterLoader} from '../../roster-data.js';
import {parseRange} from './combat.js';

export const definition = Object.freeze({id:1307, title:'Мочила', family:'mochila', stateKey:'sim1307', i18nPrefix:'battlesim1307'});
export const encounters = [];
export const loadRoster = createRosterLoader(1307, 'ENCOUNTERS', rows => {
  if (rows.length !== 10 || new Set(rows.map(row => row.key)).size !== 10) throw new Error('Incomplete Mochila roster');
  for (const row of rows) parseRange(row.range);
  encounters.splice(0, encounters.length, ...rows);
});
