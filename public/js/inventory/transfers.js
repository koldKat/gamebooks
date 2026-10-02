// transfers.js - Internal inventory module; use ../inventory.js externally.

import { inventoryRuntime } from './runtime.js';
import { MAX_SLOTS } from './constants.js';
import { _isReadOnly, _inv, _setInv } from './model.js';

export function getInventorySlots() { return _inv(); }

export function refreshInventoryUI() { inventoryRuntime.renderGrid(); }

// Merge matching metadata/visibility stacks; otherwise consume one of 40 slots.
export function addItemToInventory(itemId, opts = {}) {
  if (_isReadOnly()) return false;
  const visible = !!opts.visible;
  const label = opts.label ?? '';
  const note = opts.note ?? '';
  const qty = Math.max(1, opts.qty ?? 1);
  const arr = _inv();
  const idx = arr.findIndex(s => s.itemId === itemId && (s.note || '') === note && (s.label || '') === label && !!s.visible === visible);
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], qty: (arr[idx].qty || 1) + qty };
  } else {
    if (arr.length >= MAX_SLOTS) return false;
    arr.push({ itemId, note, qty, visible, label });
  }
  _setInv(arr);
  return true;
}

// Equipment transfers take the whole stack, preserving its display metadata.
export function removeAllFromInventoryAt(idx) {
  if (_isReadOnly()) return null;
  const arr = _inv();
  if (idx < 0 || idx >= arr.length) return null;
  const { itemId, visible, label, note, qty } = arr[idx];
  arr.splice(idx, 1);
  _setInv(arr);
  return { itemId, visible: !!visible, label: label || '', note: note || '', qty: qty || 1 };
}
