// cache.js - Internal equipment module; use ../equipment.js externally.

import { apiFetch } from '../state.js';
import { equipmentRuntime } from './runtime.js';
import { _eq, _eqItemId, _captureEqContext, _isEqContextCurrent } from './model.js';

// Fetch multiple items in a single request and populate equipmentRuntime._itemCache.
export async function _fetchItems(ids, isCurrent = () => true) {
  if (!ids.length) return;
  const epoch = equipmentRuntime.cacheEpoch;
  try {
    const res = await apiFetch(`/api/items?ids=${ids.join(',')}`);
    if (res.ok) {
      const items = await res.json();
      if (epoch !== equipmentRuntime.cacheEpoch || !isCurrent()) return;
      for (const it of items) equipmentRuntime._itemCache.set(it.id, it);
    }
  } catch {}
}

export async function _ensureEquippedItems() {
  const context = _captureEqContext();
  const ids = [...new Set(Object.values(_eq()).map(_eqItemId).filter(Boolean))].filter(id => !equipmentRuntime._itemCache.has(id));
  if (ids.length) await _fetchItems(ids, () => _isEqContextCurrent(context));
}

export function _byId(id) {
  return equipmentRuntime._itemCache.get(id) ?? null;
}
