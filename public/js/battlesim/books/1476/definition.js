// Identity and database-owned Fatemaster encounter setup for Treachery in Drakenwood.
import {createRosterLoader} from '../../roster-data.js';
import {validateFatemasterCatalog} from '../../engines/fatemaster/catalog.js';

export const definition = Object.freeze({id:1476,title:'Treachery in Drakenwood',family:'fatemaster',stateKey:'sim1476',i18nPrefix:'battlesim1476'});
let roster = [], defaults;
export const getRoster = () => roster;
export const getPlayerDefaults = () => defaults;
export const loadRoster = createRosterLoader(definition.id,'CATALOG',entries=>{
  if (entries.length !== 27) throw new Error('Incomplete Treachery in Drakenwood encounter catalog');
  defaults = validateFatemasterCatalog(entries);
  roster = entries;
});
