import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 706,
  title: 'Синът на пустинята',
  family: 'son-of-the-desert',
  stateKey: 'sim706',
  i18nPrefix: 'battlesim706',
});

export let POSITIONS = Object.freeze({});
export const DESERT_RULES = {};
export const loadRoster = createRosterLoader(706, 'POSITIONS', entries => {
  const rules = entries.find(entry=>entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Son of the Desert settings');
  POSITIONS = Object.freeze(Object.fromEntries(entries.map(({key, rule}) => [key, rule])));
  Object.assign(DESERT_RULES,rules);
});
