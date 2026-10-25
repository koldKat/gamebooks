import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id: 857, title: 'Изумрудената планина', family: 'nti', stateKey: 'sim857', i18nPrefix: 'battlesim857'});
export const RULES_REVISION = 1;
export const DEFAULT_CHARACTER = Object.freeze({combat: 2, movement: 0, life: 10, damage: 2, armour: 1, gold: 30});
export let ENCOUNTERS = [];
export const loadRoster = createRosterLoader(857, 'ENCOUNTERS', entries => { ENCOUNTERS = entries; });

export function encounterPreset(id) {
  const encounter = ENCOUNTERS.find(row => row.id === String(id));
  if (!encounter) throw new RangeError('Unknown encounter');
  return structuredClone(encounter);
}
