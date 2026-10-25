import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 240,
  "title": "Legend of the Shadow Warriors",
  "family": "fighting-fantasy",
  "stateKey": "sim240",
  "i18nPrefix": "battlesim240"
});

export const MAX_PROVISIONS = 10;

export const PROVISIONS_HEAL = 4;

export const WEAPONS = {
  sword: { normal: 2, lucky: 4, unlucky: 1, atkPenalty: 0 },
  axe:   { normal: 4, lucky: 6, unlucky: 2, atkPenalty: 1 },
};

export const ARMOURS = {
  none:      { normal: 0, lucky: 0, unlucky: 0, hitsMax: 0, absorbAll: false },
  chainmail: { normal: 1, lucky: 0, unlucky: 2, hitsMax: 10, absorbAll: false },
  plate:     { normal: 0, lucky: 0, unlucky: 0, hitsMax: 5,  absorbAll: true  },
};

export const SIDE_WOUND_DMG = 2;

export const DISARM_MARGIN = 3;

export const MAX_SIDE_ENEMIES = 8;

export const SHADOW_RULES = {};
export const loadRoster = createRosterLoader(240, 'SHADOW_RULES', entries => {
  if (entries.length !== 1 || !Number.isSafeInteger(entries[0].skullWinFace) || entries[0].skullWinFace < 1 || entries[0].skullWinFace > 6) throw new Error('Incomplete Behemoth skull settings');
  Object.assign(SHADOW_RULES, entries[0]);
});
