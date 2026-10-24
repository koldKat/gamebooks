import { createRosterLoader } from '../../roster-data.js';

export let SHAMUTANTI_FIGHTS = [];
export let SHAMUTANTI_NIGHT_ENEMIES = [];
export const loadRoster = createRosterLoader(671, 'CATALOG', rows => {
  const night = rows.find(row => row.kind === 'night');
  if (!night?.table?.length || !rows.some(row => row.kind === 'fight')) throw new Error('Incomplete Shamutanti catalog');
  SHAMUTANTI_FIGHTS = rows.map(row => row.spec).sort((a,b) => a.section-b.section);
  SHAMUTANTI_NIGHT_ENEMIES = night.table;
});
