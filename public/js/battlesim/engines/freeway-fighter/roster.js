import { createRosterLoader } from '../../roster-data.js';

export let FREEWAY_FIGHTS = [];
export let FREEWAY_CONTESTS = [];
export let FREEWAY_RACES = [];
export const FREEWAY_RULES = {};
export const loadRoster = createRosterLoader(663, 'FIGHTS', rows => {
  const support = rows.find(row => row.support)?.support;
  const rules = rows.find(row => row.support?.rules)?.support.rules;
  if (!rows.length || !support?.contests?.length || !support.races?.length || !rules) throw new Error('Incomplete Freeway catalog');
  Object.assign(FREEWAY_RULES, rules);
  FREEWAY_FIGHTS = rows.map(row => row.fight);
  FREEWAY_CONTESTS = support.contests;
  FREEWAY_RACES = support.races;
});
