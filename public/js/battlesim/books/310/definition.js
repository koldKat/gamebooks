// Identity and database-backed encounter presets for the original English edition.
import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({ id: 310, title: 'Avenger!', family: 'way-of-the-tiger',
  stateKey: 'sim310', i18nPrefix: 'battlesim310' });
let encounters = [];
export const loadRoster = createRosterLoader(310, 'TIGER_ENCOUNTERS', entries => {
  for (const entry of entries) {
    if (!entry.name || !Array.isArray(entry.opponents) || !entry.opponents.length) throw new Error('Invalid Avenger encounter');
  }
  encounters = entries;
});
export const getEncounters = () => encounters;
