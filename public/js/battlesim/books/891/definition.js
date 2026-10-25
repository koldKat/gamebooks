import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id: 891, title: 'Кибернетични войни', family: 'cybernetic-wars', stateKey: 'sim891', i18nPrefix: 'battlesim891'});
export const RULES_REVISION = 1;

export const CHANCE_TABLE = Object.freeze([
  1, 2, 3, 4, 5, 6,
  4, 8, 12, 1, 11, 5,
  7, 9, 1, 10, 3, 2,
  1, 4, 2, 6, 7, 9,
  12, 8, 1, 10, 1, 12,
  4, 3, 9, 1, 11, 7,
  2, 8, 5, 12, 5, 1,
  7, 2, 4, 9, 1, 10,
  5, 8, 9, 10, 11, 12,
]);

export let EASY_PRESETS = [], HARD_PRESETS = [];
export const loadRoster = createRosterLoader(891, 'CATALOG', entries => {
  EASY_PRESETS = entries.filter(entry => entry.mode === 'easy').map(entry => entry.profile);
  HARD_PRESETS = entries.filter(entry => entry.mode === 'hard').map(entry => entry.profile);
});

export const MANOEUVRES = Object.freeze({
  none: {attack: 0, defence: 0, tactics: 0},
  frontal: {attack: 4, defence: -4, tactics: 1},
  flanking: {attack: 2, defence: -2, tactics: 2},
  deflection: {attack: 0, defence: 2, tactics: -1},
  loop: {attack: -4, defence: 4, tactics: -1},
  oblique: {attack: -2, defence: -2, tactics: 2},
  escape: {attack: 0, defence: -4, tactics: 0, zeroAttack: true, speed: 2},
  approach: {attack: 4, defence: -2, tactics: 0},
  withdraw: {attack: -2, defence: 4, tactics: 0},
});
