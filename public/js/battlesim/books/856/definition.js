import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id: 856, title: 'Развилняване', family: 'galansia', stateKey: 'sim856', i18nPrefix: 'battlesim856'});
export const RULES_REVISION = 1;
export const RACES = ['troll', 'ogre', 'giant', 'minotaur', 'cyclops', 'ape', 'custom'];
export const PRESETS = [
  {id: 'hilga', name: 'Сополивата Хилга', race: 'troll', strength: 5, agility: 2, life: 6, maxLife: 6, damage: 2, boulder: false, bags: 2},
  {id: 'thor', name: 'Ужасния Тор', race: 'ogre', strength: 4, agility: 3, life: 5, maxLife: 5, damage: 3, boulder: true, bags: 1},
  {id: 'brindle', name: 'Бледата брада', race: 'giant', strength: 6, agility: 4, life: 4, maxLife: 4, damage: 1, boulder: true, bags: 1},
];
export let ENCOUNTERS = [];
export let ENEMIES = [];
export const GALANSIA_RULES = {};
export const loadRoster = createRosterLoader(856, 'ENCOUNTERS', entries => {
  const rules = entries.find(entry => entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Rampage settings');
  Object.assign(GALANSIA_RULES, rules);
  ENCOUNTERS = entries.map(({support,...entry}) => entry);
  ENEMIES = entries.map(({displayName, strength, damage, hp}) => ({displayName, strength, damage, hp}));
});
export function encounterPreset(id) {
  const preset = ENCOUNTERS.find(row => row.id === String(id));
  if (!preset) throw new RangeError('Unknown encounter');
  return structuredClone(preset);
}
