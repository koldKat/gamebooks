import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id: 817, title: 'Зона 51', family: 'ammunition-resource', stateKey: 'sim817', i18nPrefix: 'battlesim817'});
export const RULES_REVISION = 1;
export let ENCOUNTERS = [];
export const loadRoster = createRosterLoader(817, 'CATALOG', entries => {
  ENCOUNTERS = entries.flatMap(entry => entry.variants).sort((a, b) => a.order - b.order).map(variant => variant.spec);
});
export const DIFFICULTIES = ['easy', 'hard', 'apocalyptic'];
export function encounterPreset(section, difficulty = 'easy') {
  const row = ENCOUNTERS.find(value => value.section === Number(section));
  const index = DIFFICULTIES.indexOf(difficulty);
  if (!row || index < 0) throw new RangeError('Invalid encounter');
  return {...row, count: row.counts?.[index] ?? row.count};
}
