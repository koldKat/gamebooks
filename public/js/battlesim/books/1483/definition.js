// Identify Fortress of Assassins and load its duel preset from the database.
import {createRosterLoader} from '../../roster-data.js';
import {validateKnightmareCatalog} from '../../engines/knightmare/catalog.js';

export const definition = Object.freeze({id:1483,title:'Fortress of Assassins',family:'knightmare',stateKey:'sim1483',i18nPrefix:'battlesim1483'});
let roster = [], defaults;
export const getRoster = () => roster;
export const getPlayerDefaults = () => defaults;
export const loadRoster = createRosterLoader(definition.id,'CATALOG',entries=>{
  if (entries.length !== 1) throw new RangeError('Incomplete Fortress of Assassins duel catalog');
  defaults = validateKnightmareCatalog(entries);
  roster = entries;
});
