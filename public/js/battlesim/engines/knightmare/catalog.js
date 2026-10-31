// Validate database-owned graded duel presets and their shared printed rules.
import {LIFE_FORCE,validateKnightmareRules} from './core.js';

export function validateKnightmareCatalog(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new RangeError('Missing duel catalog');
  const seen = new Set();
  let defaults;
  for (const entry of entries) {
    if (!/^[1-9]\d*$/.test(entry.section) || seen.has(entry.section)
        || typeof entry.label !== 'string' || !entry.label.trim()
        || typeof entry.opponent?.name !== 'string' || !entry.opponent.name.trim()
        || entry.opponent.name.length > 200 || !LIFE_FORCE.slice(0,3).includes(entry.opponent.lifeForce)
        || !LIFE_FORCE.slice(0,3).includes(entry.playerDefaults?.lifeForce)) throw new RangeError('Invalid duel preset');
    seen.add(entry.section);
    const value = {rules:validateKnightmareRules(entry.rules), player:entry.playerDefaults};
    if (defaults && JSON.stringify(defaults) !== JSON.stringify(value)) throw new RangeError('Conflicting duel rules');
    defaults = structuredClone(value);
  }
  return defaults;
}
