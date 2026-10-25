import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id: 896, title: 'Опасна мисия', family: 'lucas-grey', stateKey: 'sim896', i18nPrefix: 'battlesim896'});
export {RULES_REVISION, HEALTH_BONUS, COVER_BONUS} from '../../engines/lucas-grey/rules.js';

export let ENCOUNTERS = Object.freeze([]);
export const loadRoster = createRosterLoader(896, 'ENCOUNTERS', entries => {
  ENCOUNTERS = Object.freeze(entries.map(row => Object.freeze(row)));
});

export function encounterPreset(id) {
  const row = ENCOUNTERS.find(entry => entry.id === String(id));
  if (!row) throw new RangeError('Unknown encounter');
  return structuredClone(row);
}
