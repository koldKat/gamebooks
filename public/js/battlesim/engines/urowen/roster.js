import { createRosterLoader } from '../../roster-data.js';

export let UROWEN_SOURCE;
export const UROWEN_RULES = {};
export const loadRoster = createRosterLoader(550, 'CATALOG', rows => {
  const encounters = rows.filter(row => row.catalog === 'encounters').map(row => row.spec);
  const animals = rows.filter(row => row.catalog === 'animals').map(row => row.spec);
  const rules = rows.find(row => row.support)?.support.rules;
  if (encounters.length !== 82 || animals.length !== 4 || !rules) throw new Error('Incomplete Urowen catalog');
  Object.assign(UROWEN_RULES, rules);
  UROWEN_SOURCE = {bookId: 550, encounters, animals};
});
