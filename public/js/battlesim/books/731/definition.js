// Identify the optional final duel and load its four source presets from the database.
import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({id:731, title:'Гневът на викингите',
  family:'viking-wrath', stateKey:'sim731', i18nPrefix:'battlesim731'});
export const encounters = [];
export const loadRoster = createRosterLoader(731, 'CATALOG', rows => {
  if (rows.length !== 4 || new Set(rows.map(row => row.key)).size !== 4
      || rows.some(row => !Number.isSafeInteger(row.strength) || row.strength < 1
        || !Number.isSafeInteger(row.energy) || row.energy < 1 || !row.name)) {
    throw new Error('Incomplete duel roster');
  }
  encounters.splice(0, encounters.length, ...rows);
});
