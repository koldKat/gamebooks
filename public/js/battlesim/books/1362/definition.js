import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({id:1362,title:'Tomb of the Golden Skull',family:'fighting-fantasy',stateKey:'sim1362',i18nPrefix:'battlesim1362'});
let roster = [];
export const getRoster = () => roster;
export const getSettings = () => roster[0]?.support;
export const loadRoster = createRosterLoader(definition.id,'CATALOG',entries => {
  if (entries.length !== 33 || !entries[0]?.support?.items || !entries[0]?.support?.defaults ||
      entries.some(entry => !entry.section || !entry.enemies?.length || !entry.printedRules?.length)) throw new Error('Incomplete Golden Skull roster');
  roster = entries;
});
