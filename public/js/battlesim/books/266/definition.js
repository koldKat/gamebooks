import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({
  id: 266, title: 'Shadow of the Giants', family: 'fighting-fantasy',
  stateKey: 'sim266', i18nPrefix: 'battlesim266',
});
let roster = [];
export const getRoster = () => roster;
export const getSettings = () => roster[0]?.support;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  if (entries.length !== 31 || entries[0]?.support?.defaults?.provisions !== 10 ||
      entries.some(entry => !entry.section || !entry.enemies?.length || !entry.printedRules?.length)) {
    throw new Error('Incomplete Shadow of the Giants roster');
  }
  roster = entries;
});
