import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 210,
  "title": "Temple of Terror",
  "family": "fighting-fantasy",
  "stateKey": "sim210",
  "i18nPrefix": "battlesim210"
});

export const MAX_PROVISIONS = 10;

export const WOUND_DAMAGE = 2;

export let FIRE_BREATH_DMG;

export let ELECTRIC_SHOCK_DMG;

export const PROVISIONS_HEAL = 4;

export const TEMPLE_RULES = {};
export const loadRoster = createRosterLoader(210, 'TEMPLE_RULES', entries => {
  if (entries.length !== 1 || !['fireDamage', 'fireHitMax', 'shockDamage', 'shockHitMax'].every(key => Number.isSafeInteger(entries[0][key]) && entries[0][key] >= 0)) throw new Error('Incomplete Temple of Terror settings');
  Object.assign(TEMPLE_RULES, entries[0]);
  FIRE_BREATH_DMG = TEMPLE_RULES.fireDamage;
  ELECTRIC_SHOCK_DMG = TEMPLE_RULES.shockDamage;
});
