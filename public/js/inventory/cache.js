// cache.js - Internal inventory module; use ../inventory.js externally.

import { inventoryRuntime } from './runtime.js';
import { apiFetch } from '../core/state.js';
import { _inv, _captureContext, _isContextCurrent } from './model.js';

export async function _fetchItem(id, isCurrent = () => true) {
  const epoch = inventoryRuntime.cacheEpoch;
  if (!isCurrent()) return null;
  if (inventoryRuntime._itemCache.has(id)) return inventoryRuntime._itemCache.get(id);
  try {
    const res = await apiFetch(`/api/items/${id}`);
    if (res.ok) {
      const it = await res.json();
      if (epoch !== inventoryRuntime.cacheEpoch || !isCurrent()) return null;
      inventoryRuntime._itemCache.set(id, it); return it;
    }
  } catch {}
  return null;
}

export async function _ensureInvItems() {
  const context = _captureContext();
  const ids = [...new Set(_inv().map(s => s.itemId))].filter(id => !inventoryRuntime._itemCache.has(id));
  if (ids.length) await Promise.all(ids.map(id => _fetchItem(id, () => _isContextCurrent(context))));
}

export function _byId(id) {
  return inventoryRuntime._itemCache.get(id) ?? null;
}

export async function preloadItems() {
  await _ensureInvItems();
}
