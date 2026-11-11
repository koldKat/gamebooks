// Load The Altimer's printed encounter presets from the database.
import {loadRosterDataset} from '../../roster-data.js';
import {startAltimerFight} from '../../engines/altimer/core.js';
export const definition = Object.freeze({id: 409, title: 'The Altimer', family: 'altimer',
  stateKey: 'sim409', i18nPrefix: 'battlesim409'});
export let ENCOUNTERS = [];
let pending, ready = false;
export function loadRoster(fetcher) {
  if (ready) return Promise.resolve();
  if (!pending) pending = loadRosterDataset(409, 'ENCOUNTERS', fetcher).then(rows => {
    if (rows.length !== 17 || new Set(rows.map(row => row.key)).size !== 17) throw RangeError('Incomplete combat roster');
    for (const row of rows) {
      if (!/^[1-9]\d*$/.test(row.section) || !Array.isArray(row.sourceNotes)
          || row.sourceNotes.some(note => typeof note !== 'string')) throw RangeError('Invalid encounter notes');
      startAltimerFight({name: 'Player', body: 2, hp: 1}, row,
        {sucker: row.options?.sucker, allowWeakSpot: row.options?.allowWeakSpot});
      for (const key of ['invisibilityPenalty', 'teamAttackBonus']) {
        const value = row.options?.[key] ?? 0;
        if (!Number.isSafeInteger(value) || Math.abs(value) > 1000) throw RangeError('Invalid printed modifier');
      }
    }
    ENCOUNTERS = structuredClone(rows); ready = true;
  }).finally(() => {pending = null;});
  return pending;
}
