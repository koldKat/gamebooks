import { createRosterLoader } from '../../roster-data.js';

export let WAR_TORN_FIGHTS = [];
export let FABLED_SEA_CHECKS = Object.freeze({});
export const WAR_TORN_RULES = {};
export const loadRoster = createRosterLoader(674, 'FIGHTS', rows => {
  const support = rows.find(row => row.support)?.support;
  if (!support?.seaChecks || !support.rules) throw new Error('Incomplete War-Torn Kingdom settings');
  WAR_TORN_FIGHTS = rows.map(({support, ...row}) => row);
  FABLED_SEA_CHECKS = Object.freeze(support.seaChecks);
  Object.assign(WAR_TORN_RULES, support.rules);
});
