// Identity and database-backed encounter loading for The Port of Peril.
import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({id:261,title:'The Port of Peril',family:'fighting-fantasy',stateKey:'sim261',i18nPrefix:'battlesim261'});
let roster = [];
export const getRoster = () => roster;
export const getSettings = () => roster[0]?.support;
export const loadRoster = createRosterLoader(definition.id,'CATALOG',entries => {
  if (entries.length !== 34 || !entries[0]?.support?.items || !entries[0]?.support?.defaults ||
      entries.some(entry => !entry.section || !entry.enemies?.length || !entry.printedRules?.length)) throw new Error('Incomplete Port of Peril roster');
  roster = entries;
});
