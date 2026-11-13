// Define the book's combat defaults and load reviewed presets from the roster database.
import {createRosterLoader} from '../../roster-data.js';
import {normalizeEncounter} from './combat.js';

export const definition = Object.freeze({id:602, title:'She-Hulk Goes to Murderworld',
  family:'marvel-multiverse-missions', stateKey:'sim602', i18nPrefix:'battlesim602'});
export const customRules = {goal:{kind:'manual'}, automaticWinParameter:'gammaInfusion', consumables:{
  crystal:{changes:{power:-1,charm:-1,concentration:-1},
    note:'Crystal Dodecahedron shatters. Its +1 bonus has been removed from all three combat stats. Remove it from your inventory yourself.'},
  pepperSpray:{rounds:[0], note:'Illegal Pepper Spray is used up. Remove it from your inventory yourself.'},
}};
export const encounters = [];
export const loadRoster = createRosterLoader(602, 'CATALOG', rows => {
  const entries = rows.map(row => normalizeEncounter(row.spec));
  if (entries.length !== 35 || new Set(entries.map(entry => entry.key)).size !== 35) throw new Error('Incomplete combat roster');
  encounters.splice(0, encounters.length, ...entries);
});
