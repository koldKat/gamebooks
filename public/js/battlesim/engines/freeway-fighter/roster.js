import { createRosterLoader } from '../../roster-data.js';

export let FREEWAY_FIGHTS = [];
export let FREEWAY_CONTESTS = [];
export let FREEWAY_RACES = [];
export const loadRoster = createRosterLoader(663, 'FIGHTS', rows => {
  const support = rows.find(row => row.support)?.support;
  if (!rows.length || !support?.contests?.length || !support.races?.length) throw new Error('Incomplete Freeway catalog');
  FREEWAY_FIGHTS = rows.map(row => row.fight);
  FREEWAY_CONTESTS = support.contests;
  FREEWAY_RACES = support.races;
});
