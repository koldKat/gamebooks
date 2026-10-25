import { createRosterLoader } from '../../roster-data.js';

export let WONDERLAND_ENCOUNTERS = [];
export const WONDERLAND_RULES = {};
export const isWonderlandTeapot = section => section === WONDERLAND_RULES.teapotSection;
export const loadRoster = createRosterLoader(636, 'ENCOUNTERS', rows => {
  const rules = rows.find(row => row.support)?.support.rules;
  if (!rules) throw new Error('Missing Wonderland encounter settings');
  Object.assign(WONDERLAND_RULES, rules);
  WONDERLAND_ENCOUNTERS = rows.map(({support, ...spec}) => spec);
});
