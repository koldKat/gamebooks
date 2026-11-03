// Validate database-owned lethal firearm encounters and prepare their editable combatants.
import {startFirearmFight} from './core.js';

export function validateFirearmCatalog(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new RangeError('Missing firearm catalog');
  const sections = new Set();
  for (const entry of entries) {
    if (!/^\d+$/.test(String(entry.section)) || sections.has(String(entry.section)) || !entry.name) throw new RangeError('Invalid encounter');
    sections.add(String(entry.section));
    for (const row of [...entry.opponents, ...(entry.allies ?? [])]) {
      if (!row.name || !Number.isSafeInteger(row.skill) || row.skill < 0 || row.skill > 12
          || (row.wounds != null && (entry.mode !== 'manual' || !Number.isSafeInteger(row.wounds) || row.wounds < 1))) throw new RangeError('Invalid lethal firearm combatant');
    }
    if (entry.mode === 'manual') {
      if (!entry.manualReason || !entry.note) throw new RangeError('Missing manual combat explanation');
    } else startFirearmFight(7, entry);
  }
  return entries;
}

export const firearmEditorRows = rows => rows.map(row => ({name: row.name, displayName: row.displayName ?? row.name, skill: row.skill}));
