import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id: 832, title: 'Аленият крадец', family: 'scarlet-thief', stateKey: 'sim832', i18nPrefix: 'battlesim832'});
export const RULES_REVISION = 1;
export let ENCOUNTERS = [];
export const SCARLET_RULES = {};
export const loadRoster = createRosterLoader(832, 'ENCOUNTERS', entries => {
  const rules = entries.find(entry => entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Scarlet Thief settings');
  Object.assign(SCARLET_RULES, rules);
  ENCOUNTERS = entries.map(({support,...entry}) => entry);
});
export const MODES = ['tiger', 'persuasion', 'countess', 'emeralds', 'clock'];
export function encounterPreset(section) {
  const value = ENCOUNTERS.find(row => row.section === Number(section));
  if (!value) throw new RangeError('Invalid encounter');
  return {...value};
}
