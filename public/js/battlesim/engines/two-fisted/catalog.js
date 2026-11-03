// Validate database-owned Two-Fisted encounters and preserve source exceptions in editable setups.
import {combatInteger as integer} from './dice.js';
import {validateHeavyHits} from './space-damage.js';

function opponent(mode, enemy) {
  if (!enemy || typeof enemy.name !== 'string' || !enemy.name.trim()) throw new RangeError('Missing opponent name');
  if (mode === 'space') {
    for (const key of ['hull', 'manoeuvre', 'weapons', 'shields']) integer(enemy[key]);
    integer(enemy.hull, 1);
    for (const key of ['manoeuvreFists', 'weaponsFists']) integer(enemy[key], 0, 20);
    if (!(enemy.shields === 0 && enemy.unprintedShieldFists && enemy.shieldFists == null)) integer(enemy.shieldFists, 0, 20);
  } else {
    integer(enemy.expertise); integer(enemy.health, 1);
    if (enemy.fists == null && (enemy.requiresManualFists || enemy.randomFists === '1d3')) return;
    integer(enemy.fists, 0, 20);
  }
}

export function validateTwoFistedCatalog(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new RangeError('Empty combat catalog');
  const sections = new Set();
  for (const entry of entries) {
    const combat = entry.combat;
    if (!entry.section || sections.has(entry.section) || combat?.section !== entry.section
        || typeof entry.label !== 'string' || !entry.label || combat.label !== entry.label
        || !['melee', 'ranged', 'space'].includes(combat.mode)
        || !Array.isArray(combat.opponents) || !combat.opponents.length || combat.opponents.length > 30) throw new RangeError('Invalid combat catalog entry');
    combat.opponents.forEach(enemy => opponent(combat.mode, enemy)); sections.add(entry.section);
  }
  return entries;
}

export function validateTwoFistedSupport(support) {
  if (support?.schemaVersion !== 1 || support.family !== 'two-fisted-fantasy'
      || !Array.isArray(support.coPilots) || !Array.isArray(support.items)
      || !Array.isArray(support.shipUpgrades)) throw new RangeError('Missing combat support tables');
  for (const collection of [support.coPilots, support.items, support.shipUpgrades]) {
    const ids = new Set();
    for (const item of collection) {
      if (typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new RangeError('Invalid combat support identity');
      ids.add(item.id);
    }
  }
  validateHeavyHits(support.heavyHits);
  return support;
}

export function prepareTwoFistedEncounter(entry, editable, support) {
  validateTwoFistedCatalog([entry]);
  const combat = structuredClone(entry.combat);
  if (editable != null) {
    if (!Array.isArray(editable) || editable.length !== combat.opponents.length) throw new RangeError('Keep the printed encounter group size');
    combat.opponents = editable.map((unit, i) => ({...combat.opponents[i], ...structuredClone(unit), name: unit.displayName || unit.name || combat.opponents[i].name}));
  }
  for (const enemy of combat.opponents) {
    if (combat.mode === 'space' && enemy.unprintedShieldFists && enemy.shields === 0) {
      // No printed die count is fabricated. With no SHIELDS there can be no
      // effective shield reroll; the runtime receives a disabled generator.
      enemy.shieldFists = 0; enemy.shieldGenerators = 0;
    }
    if (combat.mode !== 'space' && enemy.requiresManualFists) integer(enemy.fists, 0, 20);
  }
  if (combat.mode === 'space') combat.heavyHits = structuredClone(validateTwoFistedSupport(support).heavyHits);
  return combat;
}
