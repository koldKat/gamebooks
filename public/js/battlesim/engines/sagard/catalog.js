// Validate database-owned Sagard charts and encounter presets without supplying fallback stats.
import {validateSagardRules} from './core.js';
import {startSagardEncounter} from './encounter.js';

export function validateSagardCatalog(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new RangeError('Missing Sagard catalog');
  const seen = new Set(), signature = JSON.stringify(entries[0].rules);
  for (const entry of entries) {
    if (!/^\d+$/.test(String(entry.section)) || seen.has(String(entry.section)) || !entry.name
        || JSON.stringify(entry.rules) !== signature) throw new RangeError('Invalid Sagard encounter');
    seen.add(String(entry.section)); validateSagardRules(entry.rules);
    if (!Number.isSafeInteger(entry.rules.maxShield) || !entry.rules.healingLabels?.fang || !entry.rules.healingLabels?.moss) {
      throw new RangeError('Missing equipment rules');
    }
    if (entry.mode === 'manual') {
      if (!entry.manualReason || !entry.note || !Array.isArray(entry.opponents)) throw new RangeError('Missing manual chart explanation');
    } else startSagardEncounter({level: entry.rules.initialHeroLevel ?? 2, hp: entry.rules.maxHeroHp}, entry, entry.rules);
  }
  return entries;
}

export const sagardEditorRows = rows => rows.map(row => ({...row, chartLevel: row.level, displayName: row.displayName ?? row.name}));
