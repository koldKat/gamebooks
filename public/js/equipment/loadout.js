// loadout.js - Internal equipment module; use ../equipment.js externally.

import { state } from '../state.js';
import { _eqItemId, _eqMeta, _eqQty } from './model.js';

// Build a fresh { inventory, equipment, equipmentVisible } set for a new playthrough
// from the book's saved templates. equipmentTemplate entries carry their own
// label/note/qty (captured at "Save as Template" time), so a re-equipped item
// keeps the name the player gave it - no cross-referencing inventoryTemplate
// needed (equipped items are never present there, since they've been moved out
// of inventory). _eqItemId/_eqMeta/_eqQty also accept legacy itemId-only
// template entries from saves made before this. The "show on screen" flag for
// equipped slots comes from equipmentVisibleTemplate.
export function instantiateLoadout() {
  const inventory = state.inventoryTemplate ? state.inventoryTemplate.map(s => ({ ...s })) : [];
  const eqTemplate = state.equipmentTemplate ?? {};
  const eqVisTemplate = state.equipmentVisibleTemplate ?? {};
  const equipment = {};
  const equipmentVisible = {};
  for (const [key, entry] of Object.entries(eqTemplate)) {
    const itemId = _eqItemId(entry);
    if (!itemId) continue;
    const meta = _eqMeta(entry);
    equipment[key] = { itemId, label: meta.label, note: meta.note, qty: _eqQty(entry) };
    if (eqVisTemplate[key]) equipmentVisible[key] = true;
    const idx = inventory.findIndex(s => s.itemId === itemId);
    if (idx >= 0) inventory.splice(idx, 1);
  }
  return { inventory, equipment, equipmentVisible };
}
