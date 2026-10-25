import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 722, title: 'Пристанището на клопките', family: 'fighting-fantasy', stateKey: 'sim722', i18nPrefix: 'battlesim722',
});

export const RULES_REVISION = 1;
export const INITIAL_GOLD = 20;
export const INITIAL_PROVISIONS = 2;
export const ARROW_LIMIT = 10;

// Original English edition, PDF pages: Bulgarian prize footers are illegible.
export const WHEEL_PAGE_COUNT = 212;
export const WHEEL_PRIZES = Object.freeze({
  39: 5, 47: 10, 57: 5, 67: 20, 87: 5, 95: 5, 101: 20, 119: 5,
  129: 10, 145: 20, 153: 5, 173: 5, 181: 20, 187: 10, 199: 5,
});

export let ENCOUNTERS = Object.freeze([]);
export let FIRST_PLAYER_HIT_RULES = Object.freeze({});
export const loadRoster = createRosterLoader(722, 'ENCOUNTERS', entries => {
  ENCOUNTERS = Object.freeze(entries);
  FIRST_PLAYER_HIT_RULES = Object.freeze(Object.fromEntries(entries
    .filter(entry => entry.firstPlayerHitRule)
    .map(entry => [entry.firstPlayerHitDestination, entry.firstPlayerHitRule])));
});
