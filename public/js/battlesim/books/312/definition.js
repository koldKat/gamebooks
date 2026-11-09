// Identity and database-backed printed combat profiles for Usurper!.
import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({ id: 312, title: 'Usurper!', family: 'way-of-the-tiger',
  stateKey: 'sim312', i18nPrefix: 'battlesim312',
  combatOptions: Object.freeze({ holyProtection: true, nerveStrike: true, mirror: true, fate: true }) });
let encounters = [];
export const loadRoster = createRosterLoader(312, 'TIGER_ENCOUNTERS', entries => {
  for (const entry of entries) {
    if (!entry.name || !Array.isArray(entry.opponents) || !entry.opponents.length) throw new Error('Invalid Usurper encounter');
  }
  encounters = entries;
});
export const getEncounters = () => encounters;
