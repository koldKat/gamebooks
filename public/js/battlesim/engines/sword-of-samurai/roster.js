import { createRosterLoader } from '../../roster-data.js';

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export let SAMURAI_SOURCE_ROSTERS = freeze({});
export let SAMURAI_FIGHTS = freeze([]);
export const loadRoster = createRosterLoader(672, 'CATALOG', rows => {
  const rosters = Object.fromEntries(rows.map(row => [row.section, row.roster]));
  const records = rows.flatMap(row => row.fights).sort((a,b) => a.index-b.index);
  if (!rows.length || !records.length || new Set(records.map(row => row.index)).size !== records.length) throw new Error('Incomplete Samurai catalog');
  const fights = records.map(({spec}) => {
    const enemies = rosters[spec.continuation ?? spec.section];
    if (!enemies || JSON.stringify(enemies) !== JSON.stringify(spec.enemies)) throw new Error('Conflicting Samurai source group');
    return {...spec, enemies};
  });
  SAMURAI_SOURCE_ROSTERS = freeze(rosters);
  SAMURAI_FIGHTS = freeze(fights);
});
