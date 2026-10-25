import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 439,
  "title": "Магьосникът Сива звезда",
  "family": "lone-wolf",
  "stateKey": "sim439",
  "i18nPrefix": "battlesim439"
});

export const HEALING_POTION_HEAL = 4;

export const COMBAT_TABLE = [
  [[0,'K'], [0,'K'], [0,8], [0,6], [1,6], [2,5], [3,5], [4,5], [5,4], [6,4], [7,4], [8,3], [9,3]],
  [[0,'K'], [0,8],   [0,7], [1,6], [2,5], [3,5], [4,4], [5,4], [6,3], [7,3], [8,3], [9,3], [10,2]],
  [[0,8],   [0,7],   [1,6], [2,5], [3,5], [4,4], [5,4], [6,3], [7,3], [8,3], [9,2], [10,2], [11,2]],
  [[0,8],   [1,7],   [2,6], [3,5], [4,4], [5,4], [6,3], [7,3], [8,2], [9,2], [10,2], [11,2], [12,2]],
  [[1,7],   [2,6],   [3,5], [4,4], [5,4], [6,3], [7,2], [8,2], [9,2], [10,2], [11,2], [12,2], [14,1]],
  [[2,6],   [3,6],   [4,5], [5,4], [6,3], [7,2], [8,2], [9,2], [10,2], [11,1], [12,1], [14,1], [16,1]],
  [[3,5],   [4,5],   [5,4], [6,3], [7,2], [8,2], [9,1], [10,1], [11,1], [12,0], [14,0], [16,0], [18,0]],
  [[4,4],   [5,4],   [6,3], [7,2], [8,1], [9,1], [10,0], [11,0], [12,0], [14,0], [16,0], [18,0], ['K',0]],
  [[5,3],   [6,3],   [7,2], [8,0], [9,0], [10,0], [11,0], [12,0], [14,0], [16,0], [18,0], ['K',0], ['K',0]],
  [[6,0],   [7,0],   [8,0], [9,0], [10,0], [11,0], [12,0], [14,0], [16,0], [18,0], ['K',0], ['K',0], ['K',0]],
];

export let NEIJJIN = [], VICTORY_ROUTES = {}, DEADLINES = {}, ENCOUNTER_RULES = {};
export const loadRoster = createRosterLoader(439, 'ENCOUNTER_RULES', entries => {
  ENCOUNTER_RULES = Object.fromEntries(entries.map(entry => [entry.section, entry.rules]));
  NEIJJIN = entries.find(entry => entry.rules.sequence).rules.sequence.profiles;
  VICTORY_ROUTES = Object.fromEntries(entries.filter(entry => entry.rules.victoryRoutes).map(entry => [entry.section, entry.rules.victoryRoutes]));
  DEADLINES = Object.fromEntries(entries.filter(entry => entry.rules.deadline).map(entry => [entry.section, entry.rules.deadline]));
});
