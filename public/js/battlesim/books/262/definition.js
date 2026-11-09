// Identity and database-backed encounter loading for The Gates of Death.
import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({id:262,title:'The Gates of Death',family:'fighting-fantasy',stateKey:'sim262',i18nPrefix:'battlesim262'});
let roster = [];
export const getRoster = () => roster;
export const getSettings = () => roster[0]?.support;
export const loadRoster = createRosterLoader(definition.id,'CATALOG',entries => {
  if (entries.length !== 25 || !entries[0]?.support?.items || !entries[0]?.support?.defaults ||
      entries.some(entry => !entry.section || !entry.enemies?.length || !entry.printedRules?.length)) throw new Error('Incomplete Gates of Death roster');
  roster = entries;
});
