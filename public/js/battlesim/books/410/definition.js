// Load New Gaia's printed encounter presets from the database.
import {loadRosterDataset} from '../../roster-data.js';
import {startAltimerFight} from '../../engines/altimer/core.js';
export const definition = Object.freeze({id: 410, title: 'New Gaia', family: 'altimer',
  stateKey: 'sim410', i18nPrefix: 'battlesim410', equipment: true, firstBookTechniques: false});
export let ENCOUNTERS = [];
let pending, ready = false;
export function loadRoster(fetcher) {
  if (ready) return Promise.resolve();
  if (!pending) pending = loadRosterDataset(410, 'ENCOUNTERS', fetcher).then(rows => {
    if (rows.length !== 31 || new Set(rows.map(row => row.key)).size !== 31) throw RangeError('Incomplete combat roster');
    for (const row of rows) {
      if (!/^[1-9]\d*$/.test(row.section) || !Array.isArray(row.sourceNotes)
          || row.sourceNotes.some(note => typeof note !== 'string')) throw RangeError('Invalid encounter notes');
      startAltimerFight({name: 'Player', body: 2, hp: 1}, row,
        {sucker: row.options?.sucker, supportDamage: row.options?.supportDamage});
      for (const key of ['attackPenalty']) {
        const value = row.options?.[key] ?? 0;
        if (!Number.isSafeInteger(value) || Math.abs(value) > 1000) throw RangeError('Invalid printed modifier');
      }
    }
    ENCOUNTERS = structuredClone(rows); ready = true;
  }).finally(() => {pending = null;});
  return pending;
}
