// Identity and database-backed printed combat profiles for Inferno!.
import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({ id: 315, title: 'Inferno!', family: 'way-of-the-tiger',
  stateKey: 'sim315', i18nPrefix: 'battlesim315',
  combatOptions: Object.freeze({ yubiJutsu: true }) });
let encounters = [];
export const loadRoster = createRosterLoader(315, 'TIGER_ENCOUNTERS', entries => {
  for (const entry of entries) {
    if (!entry.name || !Array.isArray(entry.opponents) || !entry.opponents.length) throw new Error('Invalid Inferno encounter');
  }
  encounters = entries;
});
export const getEncounters = () => encounters;
