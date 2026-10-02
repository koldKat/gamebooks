// loadout.js - Internal equipment module; use ../equipment.js externally.

import { state } from '../core/state.js';
import { _eqItemId, _eqMeta, _eqQty } from './model.js';

// Clone templates into independent run state, preserving metadata and legacy ID-only entries.
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
