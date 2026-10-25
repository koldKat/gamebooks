import { createRosterLoader } from '../../roster-data.js';

export let SHAMUTANTI_FIGHTS = [];
export let SHAMUTANTI_NIGHT_ENEMIES = [];
export const SHAMUTANTI_RULES = {};
export const loadRoster = createRosterLoader(671, 'CATALOG', rows => {
  const night = rows.find(row => row.kind === 'night');
  const rules = rows.find(row => row.support?.rules)?.support.rules;
  if (!night?.table?.length || !rows.some(row => row.kind === 'fight') || !rules) throw new Error('Incomplete Shamutanti catalog');
  Object.assign(SHAMUTANTI_RULES, rules);
  SHAMUTANTI_FIGHTS = rows.map(row => row.spec).sort((a,b) => a.section-b.section);
  SHAMUTANTI_NIGHT_ENEMIES = night.table;
});
