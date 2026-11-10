// Identity and database-backed printed combat profiles for Overlord!.
import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({ id: 313, title: 'Overlord!', family: 'way-of-the-tiger',
  stateKey: 'sim313', i18nPrefix: 'battlesim313',
  combatOptions: Object.freeze({ yubiJutsu: true }) });
let encounters = [];
export const loadRoster = createRosterLoader(313, 'TIGER_ENCOUNTERS', entries => {
  for (const entry of entries) {
    if (!entry.name || !Array.isArray(entry.opponents) || !entry.opponents.length) throw new Error('Invalid Overlord encounter');
  }
  encounters = entries;
});
export const getEncounters = () => encounters;
