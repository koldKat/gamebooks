import { createRosterLoader } from '../../roster-data.js';
export const definition = Object.freeze({
  id: 807,
  title: 'Извън времето',
  family: 'opposed-dice',
  stateKey: 'sim807',
  i18nPrefix: 'battlesim807',
});

export const RULES_REVISION = 1;
export let ENCOUNTERS = [];
export const OUTCOME_RULES = {};
export const loadRoster = createRosterLoader(807, 'ENCOUNTERS', rows => {
  const rules = rows.find(row => row.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Out of Time settings');
  Object.assign(OUTCOME_RULES, rules);
  ENCOUNTERS = rows.map(({support,...entry}) => entry);
});
