import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 286,
  "title": "В лабиринта на времето",
  "family": "standalone",
  "stateKey": "sim286",
  "i18nPrefix": "battlesim286"
});

export const MAX_LIFE_ROLLS = 3;

export const TECH_ATTEMPT_COST = 3;

export const WEAPONS = [
  ['sword',   6, 20],
  ['mace',    5, 20],
  ['halberd', 6, 15],
  ['dagger',  7, 5],
  ['machete', 6, 7],
  ['rapier',  5, 11],
  ['harpoon', 7, 2],
  ['axe',     7, 2],
  ['glove',   4, 0],
  ['custom',  null, null],
];

export const SHIELDS = [
  ['none',   0, 0],
  ['small',  -2, 50],
  ['medium', -3, 100],
  ['large',  -4, 120],
];

export const TECH_ITEMS = [
  { key: 'shield_temp', kind: 'buff_shield', maxUses: 3 },
  { key: 'grav_shock',  kind: 'buff_next',   maxUses: 3 },
  { key: 'gas',         kind: 'stun',        maxUses: 3 },
  { key: 'laser',       kind: 'direct',      maxUses: 3, damage: 10 },
  { key: 'time_accel',  kind: 'double',      maxUses: 3 },
  { key: 'blaster',     kind: 'direct', maxUses: 10, damage: 10, charged: true },
  { key: 'raygun',      kind: 'direct', maxUses: 2,  damage: 75, charged: true },
  { key: 'dehronator',  kind: 'revive', maxUses: 1, cost: 15 },
];

export let DREAM_ENCOUNTERS = {};
export const loadRoster = createRosterLoader(286, 'DREAM_ENCOUNTERS', entries => {
  DREAM_ENCOUNTERS = Object.fromEntries(entries.flatMap(entry => entry.encounters)
    .map(encounter => [encounter.dream, encounter]));
});
