import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 1526, title: 'The Sword of the Bastard Elf', family: 'bastard-elf',
  stateKey: 'sim1526', i18nPrefix: 'battlesim1526',
});

export let encounters = [];
export const loadRoster = createRosterLoader(definition.id, 'ENCOUNTERS', entries => {
  encounters = entries;
});
export const findEncounter = key => encounters.find(entry => entry.key === key);
