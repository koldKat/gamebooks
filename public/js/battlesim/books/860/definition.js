import { createRosterLoader } from '../../roster-data.js';
export const definition = Object.freeze({id: 860, title: 'В къщата на смъртта', family: 'standalone', stateKey: 'sim860', i18nPrefix: 'battlesim860'});
export const RULES_REVISION = 1;
export let ENCOUNTERS = Object.freeze([]);
export const loadRoster = createRosterLoader(860, 'ENCOUNTERS', rows => { ENCOUNTERS = Object.freeze(rows); });

export function encounterPreset(id) {
  const row = ENCOUNTERS.find(entry => entry.id === String(id));
  if (!row) throw new RangeError('Unknown encounter');
  return structuredClone(row);
}
