import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id: 873, title: 'Двоен агент', family: 'lucas-grey', stateKey: 'sim873', i18nPrefix: 'battlesim873'});
export {RULES_REVISION, HEALTH_BONUS, COVER_BONUS} from '../../engines/lucas-grey/rules.js';

export let ENCOUNTERS = Object.freeze([]);
export const loadRoster = createRosterLoader(873, 'ENCOUNTERS', entries => {
  ENCOUNTERS = Object.freeze(entries.map(row => Object.freeze(row)));
});

export function encounterPreset(id) {
  const row = ENCOUNTERS.find(entry => entry.id === String(id));
  if (!row) throw new RangeError('Unknown encounter');
  return structuredClone(row);
}
