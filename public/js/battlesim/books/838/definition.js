import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id: 838, title: 'Островът на илюзиите', family: 'island-of-illusions', stateKey: 'sim838', i18nPrefix: 'battlesim838'});
export const RULES_REVISION = 1;
export const MODES = ['duel', 'pirates', 'octopus', 'dogs'];
export let ENEMIES = [];
export let ENCOUNTERS = [];
export const ISLAND_RULES = {};
export const loadRoster = createRosterLoader(838, 'CATALOG', entries => {
  const rules = entries.find(entry => entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Island of Illusions settings');
  Object.assign(ISLAND_RULES, rules);
  ENEMIES = entries.filter(entry => Number.isInteger(entry.profileIndex))
    .sort((a, b) => a.profileIndex - b.profileIndex).map(entry => entry.profile);
  ENCOUNTERS = entries.flatMap(entry => entry.variants).sort((a, b) => a.order - b.order).map(variant => variant.spec);
});
export function encounterPreset(section) {
  const preset = ENCOUNTERS.find(entry => entry.section === Number(section));
  if (!preset) throw new RangeError('Unknown encounter');
  return structuredClone(preset);
}
