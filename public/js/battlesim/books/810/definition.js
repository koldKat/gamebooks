import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 810,
  title: 'Пътят на Пъдпъдъка - промо',
  family: 'opposed-attack',
  stateKey: 'sim810',
  i18nPrefix: 'battlesim810',
});
export const RULES_REVISION = 1;
export let ENCOUNTERS = [];
export const ESCAPE_RULES = {};
export const loadRoster = createRosterLoader(810, 'ENCOUNTERS', entries => {
  const rules = entries.find(entry => entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Quail escape settings');
  Object.assign(ESCAPE_RULES, rules);
  ENCOUNTERS = entries.map(({support,...entry}) => entry);
});
