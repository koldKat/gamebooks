// Load Castle of Lost Souls' printed encounter charts from the database.
import {loadRosterDataset} from '../../roster-data.js';
import {normalizeDragonEncounter} from '../../engines/golden-dragon/core.js';
export const definition = Object.freeze({id:391, title:'Castle of Lost Souls', family:'golden-dragon', stateKey:'sim391', i18nPrefix:'battlesim391', allowRollModifier:false, combatOptions:true});
export let ENCOUNTERS = [];
let pending, ready = false;
export function loadRoster(fetcher) {
  if (ready) return Promise.resolve();
  if (!pending) pending = loadRosterDataset(391, 'ENCOUNTERS', fetcher).then(rows => {
    if (rows.length !== 32 || new Set(rows.map(row => row.key)).size !== 32) throw new RangeError('Incomplete combat roster');
    const encounters = rows.map(normalizeDragonEncounter);
    if (encounters.some(row => !/^[1-9]\d*$/.test(row.section) || !Array.isArray(row.sourceNotes)
        || row.sourceNotes.some(note => typeof note !== 'string'))) throw new RangeError('Invalid source encounter');
    ENCOUNTERS = encounters; ready = true;
  }).finally(() => { pending = null; });
  return pending;
}
