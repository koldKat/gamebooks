import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 214,
  "title": "Rebel Planet",
  "family": "fighting-fantasy",
  "stateKey": "sim214",
  "i18nPrefix": "battlesim214"
});

export const REBEL_RULES = {};
export const loadRoster = createRosterLoader(214, 'REBEL_RULES', entries => {
  if (entries.length !== 1 || !['escalatingBaseDamage', 'escalatingPerHit', 'tailHitMin', 'tailDamage'].every(key => Number.isSafeInteger(entries[0][key]) && entries[0][key] >= 0)) throw new Error('Incomplete Rebel Planet settings');
  Object.assign(REBEL_RULES, entries[0]);
});
