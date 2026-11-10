// Identity and database-backed printed combat profiles for Warbringer!.
import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({ id: 314, title: 'Warbringer!', family: 'way-of-the-tiger',
  stateKey: 'sim314', i18nPrefix: 'battlesim314',
  combatOptions: Object.freeze({ yubiJutsu: true }) });
let encounters = [];
export const loadRoster = createRosterLoader(314, 'TIGER_ENCOUNTERS', entries => {
  for (const entry of entries) {
    if (!entry.name || !Array.isArray(entry.opponents) || !entry.opponents.length) throw new Error('Invalid Warbringer encounter');
  }
  encounters = entries;
});
export const getEncounters = () => encounters;
