// model.js - Internal inventory module; use ../inventory.js externally.

import { state, currentPlaythrough, saveState, viewingPt } from '../core/state.js';
import { MAX_SLOTS } from './constants.js';
import { inventoryRuntime } from './runtime.js';

export function _captureContext(idx = null) {
  const pt = currentPlaythrough() || viewingPt;
  const entry = idx === null ? null : pt?.inventory?.filter(raw => raw != null)[idx];
  return { state, pt, idx, entry, slot: _slot(entry), epoch: inventoryRuntime.cacheEpoch };
}

export function _isContextCurrent(context) {
  const pt = currentPlaythrough() || viewingPt;
  if (!context || context.state !== state || context.pt !== pt || context.epoch !== inventoryRuntime.cacheEpoch) return false;
  if (context.idx === null) return true;
  const entry = pt?.inventory?.filter(raw => raw != null)[context.idx];
  const slot = _slot(entry);
  return entry != null && entry === context.entry &&
    ['itemId', 'qty', 'note', 'label', 'visible'].every(key => slot[key] === context.slot[key]);
}

export function _releaseContext(context) {
  if (!context) return;
  context.state = null; context.pt = null; context.entry = null; context.slot = null;
}

export function _slot(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return { itemId: raw, note: '', qty: 1, visible: false };
  return { itemId: raw.itemId, note: raw.note ?? '', qty: raw.qty ?? 1, visible: raw.visible ?? false, label: raw.label ?? '' };
}

export function _isReadOnly() { return !currentPlaythrough(); }

export function _inv() {
  const raw = (currentPlaythrough() || viewingPt)?.inventory ?? [];
  return raw.map(_slot).filter(Boolean);
}

export function _setInv(arr) {
  const pt = currentPlaythrough();
  if (!pt || _isReadOnly()) return;
  pt.inventory = arr.slice(0, MAX_SLOTS);
  saveState();
}
