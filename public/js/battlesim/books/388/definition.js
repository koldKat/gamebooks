// Load The Lord of Shadow Keep's printed encounter charts from the database.
import {loadRosterDataset} from '../../roster-data.js';
import {normalizeDragonEncounter} from '../../engines/golden-dragon/core.js';
export const definition = Object.freeze({id:388, title:'The Lord of Shadow Keep', family:'golden-dragon', stateKey:'sim388', i18nPrefix:'battlesim388'});
export let ENCOUNTERS = [];
let pending, ready = false;
export function loadRoster(fetcher) {
  if (ready) return Promise.resolve();
  if (!pending) pending = loadRosterDataset(388, 'ENCOUNTERS', fetcher).then(rows => {
    if (rows.length !== 45 || new Set(rows.map(row => row.key)).size !== 45) throw new RangeError('Incomplete combat roster');
    const encounters = rows.map(normalizeDragonEncounter);
    if (encounters.some(row => !/^[1-9]\d*$/.test(row.section) || !Array.isArray(row.sourceNotes)
        || row.sourceNotes.some(note => typeof note !== 'string'))) throw new RangeError('Invalid source encounter');
    ENCOUNTERS = encounters; ready = true;
  }).finally(() => { pending = null; });
  return pending;
}
