// Identity and database-owned Fatemaster encounters for Fortress of the Firelord.
import {createRosterLoader} from '../../roster-data.js';
import {validateFatemasterCatalog} from '../../engines/fatemaster/catalog.js';

export const definition = Object.freeze({id:1477,title:'Fortress of the Firelord',family:'fatemaster',stateKey:'sim1477',i18nPrefix:'battlesim1477'});
let roster = [], defaults;
export const getRoster = () => roster;
export const getPlayerDefaults = () => defaults;
export const loadRoster = createRosterLoader(definition.id,'CATALOG',entries=>{
  if (entries.length !== 16) throw new Error('Incomplete Fortress of the Firelord encounter catalog');
  defaults = validateFatemasterCatalog(entries);
  roster = entries;
});
