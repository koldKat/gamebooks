// Identity and database-backed combat presets for Assassin!.
import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({ id: 311, title: 'Assassin!', family: 'way-of-the-tiger',
  stateKey: 'sim311', i18nPrefix: 'battlesim311' });
let encounters = [];
export const loadRoster = createRosterLoader(311, 'TIGER_ENCOUNTERS', entries => {
  for (const entry of entries) {
    if (!entry.name || !Array.isArray(entry.opponents) || !entry.opponents.length) throw new Error('Invalid Assassin encounter');
  }
  encounters = entries;
});
export const getEncounters = () => encounters;
