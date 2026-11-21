import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({
  id: 265, title: 'Secrets of Salamonis', family: 'fighting-fantasy',
  stateKey: 'sim265', i18nPrefix: 'battlesim265',
});
let roster = [];
export const getRoster = () => roster;
export const getSettings = () => roster[0]?.support;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  if (entries.length !== 37 || !entries[0]?.support?.defaults?.fixedScores ||
      entries.some(entry => !entry.section || !entry.enemies?.length || !entry.printedRules?.length)) {
    throw new Error('Incomplete Secrets of Salamonis roster');
  }
  roster = entries;
});
