import { createRosterLoader } from '../../roster-data.js';
import { installTigerRules } from '../../engines/tiger-eye.js';
// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 869,
  "title": "Тигрово око",
  "family": "tiger-eye",
  "stateKey": "sim869",
  "i18nPrefix": "battlesim869"
});

export let RIVALS = [];
export const RIVAL_RULES = {};
export const RIVAL_LABELS = {};
export const COMMON_RULES = {};
export let SPECIAL2 = [];
export const loadRoster = createRosterLoader(869, 'RIVALS', rows => {
  if (rows.some(row => !row.support?.legacy || !row.support?.source || !row.support?.labels)) throw new Error('Incomplete Tiger Eye settings');
  const common = rows.find(row => row.support.common)?.support.common;
  if (!common) throw new Error('Incomplete Tiger Eye routes');
  Object.assign(RIVAL_RULES, Object.fromEntries(rows.map(row => [row.id, row.support])));
  Object.assign(RIVAL_LABELS, Object.fromEntries(rows.map(row => [row.id, row.support.labels])));
  Object.assign(COMMON_RULES, common);
  SPECIAL2 = rows.filter(row => Number.isInteger(row.support.specialOrder)).sort((a,b) => a.support.specialOrder - b.support.specialOrder).map(row => row.id);
  RIVALS = rows.map(({support,...row}) => row);
  installTigerRules(RIVAL_RULES, RIVAL_LABELS, COMMON_RULES);
});
