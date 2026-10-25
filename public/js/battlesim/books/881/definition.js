import { createRosterLoader } from '../../roster-data.js';
// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 881,
  "title": "Дракон в мазето",
  "family": "cellar-dragon",
  "stateKey": "sim881",
  "i18nPrefix": "battlesim881"
});

export const SWORDS = [
  { id: 'firfeld', nameKey: 'battlesim881.sword.firfeld' },
  { id: 'laim',    nameKey: 'battlesim881.sword.laim' },
  { id: 'istrin',  nameKey: 'battlesim881.sword.istrin' },
];

export let ROSTER = [];
export const ENCOUNTER_SETTINGS = {};
export const loadRoster = createRosterLoader(881, 'ROSTER', rows => {
  if (rows.some(row => row.special && !row.support?.[row.special])) throw new Error('Incomplete Cellar Dragon settings');
  Object.assign(ENCOUNTER_SETTINGS, Object.fromEntries(rows.map(row => [row.id, row.support ?? {}])));
  ROSTER = rows.map(({support,...row}) => row);
});
