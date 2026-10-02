// model.js - Internal equipment module; use ../equipment.js externally.

import { state, currentPlaythrough, saveState, viewingPt } from '../core/state.js';

export function _captureEqContext(key = null) {
  const pt = currentPlaythrough() || viewingPt;
  return { state, pt, key, entry: key === null ? null : pt?.equipment?.[key] };
}

export function _isEqContextCurrent(context) {
  const pt = currentPlaythrough() || viewingPt;
  return !!context && context.state === state && context.pt === pt &&
    (context.key === null || context.entry === pt?.equipment?.[context.key]);
}

export function _releaseEqContext(context) {
  if (context) { context.state = null; context.pt = null; context.entry = null; }
}

export function _isReadOnly() { return !currentPlaythrough(); }

export function _eq() {
  return (currentPlaythrough() || viewingPt)?.equipment ?? {};
}

// { slotKey: true } - equipped items the player has marked "show on screen"
// (carried over from the inventory slot's `visible` flag at equip time).
export function _eqVisible() {
  return (currentPlaythrough() || viewingPt)?.equipmentVisible ?? {};
}

// Accept both structured equipment entries and legacy numeric item IDs.
export function _eqItemId(entry) {
  return (entry && typeof entry === 'object') ? entry.itemId : entry;
}
export function _eqMeta(entry) {
  return (entry && typeof entry === 'object') ? { label: entry.label || '', note: entry.note || '' } : { label: '', note: '' };
}
export function _eqQty(entry) {
  return (entry && typeof entry === 'object') ? (entry.qty || 1) : 1;
}

export function _setEq(key, itemId, visible, label, note, qty) {
  const pt = currentPlaythrough();
  if (!pt || _isReadOnly()) return;
  pt.equipment = { ...(pt.equipment ?? {}), [key]: { itemId, label: label || '', note: note || '', qty: Math.max(1, qty || 1) } };
  pt.equipmentVisible = { ...(pt.equipmentVisible ?? {}), [key]: !!visible };
  saveState();
}

export function _unsetEq(key) {
  const pt = currentPlaythrough();
  if (!pt || _isReadOnly()) return;
  const eq = { ...(pt.equipment ?? {}) };
  delete eq[key];
  pt.equipment = eq;
  const eqVis = { ...(pt.equipmentVisible ?? {}) };
  delete eqVis[key];
  pt.equipmentVisible = eqVis;
  saveState();
}

// Slots are visual-only; swaps carry each item's metadata and visibility.
export function _swapEq(fromKey, toKey) {
  if (fromKey === toKey) return;
  const pt = currentPlaythrough();
  if (!pt || _isReadOnly()) return;
  const eq    = { ...(pt.equipment ?? {}) };
  const eqVis = { ...(pt.equipmentVisible ?? {}) };
  const fromEntry = eq[fromKey];
  const toEntry   = eq[toKey];
  if (!fromEntry) return; // nothing to move
  const fromVis = !!eqVis[fromKey];
  const toVis   = !!eqVis[toKey];

  eq[toKey] = fromEntry;
  eqVis[toKey] = fromVis;
  if (toEntry !== undefined) {
    eq[fromKey] = toEntry;
    eqVis[fromKey] = toVis;
  } else {
    delete eq[fromKey];
    delete eqVis[fromKey];
  }

  pt.equipment = eq;
  pt.equipmentVisible = eqVis;
  saveState();
}
