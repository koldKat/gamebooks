import { createRosterLoader } from '../../roster-data.js';
export const definition = Object.freeze({id: 860, title: 'В къщата на смъртта', family: 'standalone', stateKey: 'sim860', i18nPrefix: 'battlesim860'});
export const RULES_REVISION = 1;
export let ENCOUNTERS = Object.freeze([]);
export const HOUSE_RULES = {};
export const loadRoster = createRosterLoader(860, 'ENCOUNTERS', rows => {
  const rules = rows.find(row => row.support)?.support.rules;
  if (!rules) throw new Error('Incomplete House of Death settings');
  Object.assign(HOUSE_RULES, rules);
  ENCOUNTERS = Object.freeze(rows.map(({support,...row}) => row));
});

export function encounterPreset(id) {
  const row = ENCOUNTERS.find(entry => entry.id === String(id));
  if (!row) throw new RangeError('Unknown encounter');
  return structuredClone(row);
}
