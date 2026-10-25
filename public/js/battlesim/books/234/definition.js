import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 234,
  "title": "Vault of the Vampire",
  "family": "fighting-fantasy",
  "stateKey": "sim234",
  "i18nPrefix": "battlesim234"
});

export const MAX_PROVISIONS = 10;

export const PROVISIONS_HEAL = 4;

export const SIDE_WOUND_DMG = 2;

export const DRAIN_DMG = 2;

export const VAMPIRE_RULES = {};
export const loadRoster = createRosterLoader(234, 'VAMPIRE_RULES', entries => {
  if (entries.length !== 1 || !['drainHitMax', 'drainDamage', 'randomTargetSideMin'].every(key => Number.isSafeInteger(entries[0][key]) && entries[0][key] >= 0)) throw new Error('Incomplete Vault of the Vampire settings');
  Object.assign(VAMPIRE_RULES, entries[0]);
});
