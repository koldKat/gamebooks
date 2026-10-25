import { createRosterLoader } from '../../roster-data.js';
import { kungFuLegacyAction } from '../../engines/kung-fu.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 772,
  "title": "Бойците на Кунг-Фу",
  "family": "kung-fu",
  "stateKey": "sim772",
  "i18nPrefix": "battlesim772"
});

export const PLAYER_STAT_KEYS = [
  ['leg',      'battlesim772.stat.leg'],
  ['hand',     'battlesim772.stat.hand'],
  ['power',    'battlesim772.stat.power'],
  ['defense',  'battlesim772.stat.defense'],
  ['calm',     'battlesim772.stat.calm'],
  ['tactics',  'battlesim772.stat.tactics'],
  ['reflex',   'battlesim772.stat.reflex'],
  ['speed',    'battlesim772.stat.speed'],
];

export let ROSTER = [];
export const loadRoster = createRosterLoader(772, 'ROSTER', entries => {
  ROSTER = entries.map(profile => ({...profile, pattern(round) {
    return kungFuLegacyAction(profile, round);
  }}));
});
