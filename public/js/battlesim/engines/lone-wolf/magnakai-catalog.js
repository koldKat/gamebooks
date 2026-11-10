// Validate and expose database-backed Magnakai encounters and their original combat chart.
import {createRosterLoader} from '../../roster-data.js';

export function createMagnakaiRosterLoader(definition, receive) {
  return createRosterLoader(definition.id, 'ENCOUNTER_RULES', entries => {
    const chart = entries.find(entry => entry.combatTable)?.combatTable;
    if (!Array.isArray(chart) || chart.length !== 10 || chart.some(row => !Array.isArray(row) || row.length !== 13
        || row.some(cell => !Array.isArray(cell) || cell.length !== 2
          || cell.some(loss => loss !== 'K' && (!Number.isSafeInteger(loss) || loss < 0))))) throw new RangeError('Invalid combat chart');
    if (!entries.length || entries.some(entry => !Number.isSafeInteger(entry.section)
        || !entry.name || !(Number.isSafeInteger(entry.skill) || entry.skill == null && Number.isFinite(entry.rules?.fixedRatio))
        || !(Number.isSafeInteger(entry.stamina) && entry.stamina >= 1 || entry.stamina == null && entry.rules?.mirrorPlayerEndurance)
        || !entry.rules || (entry.key !== undefined && typeof entry.key !== 'string'))) throw new RangeError('Invalid encounters');
    const keys = entries.map(entry => entry.key ?? entry.section);
    if (new Set(keys).size !== keys.length) throw new RangeError('Duplicate encounter key');
    receive({
      table: chart,
      encounters: entries.map(({section, key, name, skill, stamina, hint}) => ({section, key, name, skill, stamina, hint,
        unavailableStats:[...(skill == null ? ['skill'] : []), ...(stamina == null ? ['stamina'] : [])]}))
        .sort((a, b) => a.section - b.section || String(a.key ?? '').localeCompare(String(b.key ?? ''))),
      rules: Object.fromEntries(entries.map(entry => [entry.key ?? entry.section, entry.rules])),
    });
  });
}
