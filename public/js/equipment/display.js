// display.js - Internal equipment module; use ../equipment.js externally.

import { renderInventoryDisplay } from '../inventory.js';
import { _eq, _eqVisible, _eqItemId, _eqMeta, _eqQty, _captureEqContext, _isEqContextCurrent } from './model.js';
import { equipmentRuntime } from './runtime.js';
import { _ensureEquippedItems, _byId } from './cache.js';
import { ALL_SLOTS } from './constants.js';

// Re-render the on-screen "visible items" display (#inv-display), merging
// regular visible inventory slots with equipped items marked "show on screen".
export async function _refreshOnScreenDisplay() {
  const context = _captureEqContext(), epoch = equipmentRuntime.cacheEpoch;
  const items = await getVisibleEquippedItems();
  if (!_isEqContextCurrent(context) || epoch !== equipmentRuntime.cacheEpoch) return;
  return renderInventoryDisplay(items, () => _isEqContextCurrent(context) && epoch === equipmentRuntime.cacheEpoch);
}
// Equipped items the player has marked "show on screen", with their full
// item data (svg_data, name) resolved for display.
export async function getVisibleEquippedItems() {
  const context = _captureEqContext(), epoch = equipmentRuntime.cacheEpoch;
  await _ensureEquippedItems();
  if (!_isEqContextCurrent(context) || epoch !== equipmentRuntime.cacheEpoch) return [];
  const eq = _eq();
  const eqVis = _eqVisible();
  const slotLabel = key => ALL_SLOTS.find(s => s.key === key)?.label?.() || key;
  return Object.entries(eq)
    .map(([key, entry]) => ({ key, itemId: _eqItemId(entry), meta: _eqMeta(entry), qty: _eqQty(entry) }))
    .filter(({ key, itemId }) => itemId && eqVis[key])
    .map(({ key, itemId, meta, qty }) => ({ itemId, item: _byId(itemId), label: meta.label, note: meta.note, qty, equipped: true, slotLabel: slotLabel(key) }))
    .filter(e => e.item);
}
