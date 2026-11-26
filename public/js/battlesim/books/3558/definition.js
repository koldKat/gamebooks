import { createRosterLoader } from '../../roster-data.js';
import { TECHNIQUES } from './combat.js';

export const definition = Object.freeze({ id: 3558, stateKey: 'sim3558', language: 'bg' });
export const roster = { encounters: [], woundTable: null };

export const loadRoster = createRosterLoader(definition.id, 'ENCOUNTERS', entries => {
  const woundTable = entries.find(entry => entry.support)?.support.woundTable;
  if (!Array.isArray(woundTable) || woundTable.length !== 3 || woundTable.some(level =>
    !Array.isArray(level) || level[0] !== 0 || level.at(-1) !== 5 || level.some((damage, index) =>
      !Number.isSafeInteger(damage) || (index > 0 && damage <= level[index - 1])))) {
    throw new TypeError('Incomplete wound table');
  }
  const encounters = entries.map(({ support, ...entry }) => entry);
  const keys = new Set(encounters.map(entry => entry.key));
  if (keys.size !== encounters.length || encounters.some(entry =>
    typeof entry.key !== 'string' || !entry.key || typeof entry.name !== 'string' || !entry.name.trim() ||
    !Number.isSafeInteger(entry.section) || entry.section < 1 ||
    !Number.isSafeInteger(entry.skill) || entry.skill < 0 ||
    !Number.isSafeInteger(entry.limit) || entry.limit < 1 || !TECHNIQUES.every(key => {
    const pair = entry.techniques?.[key];
    return Array.isArray(pair) && pair.length === 2 && pair.every(value => Number.isSafeInteger(value) && value >= 0);
  }))) {
    throw new TypeError('Incomplete encounter tactics');
  }
  roster.encounters = encounters;
  roster.woundTable = woundTable;
});
