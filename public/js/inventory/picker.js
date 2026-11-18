import { loadingHtml } from '../ui-helpers/loading.js';
// picker.js - Internal inventory module; use ../inventory.js externally.

import { inventoryRuntime } from './runtime.js';
import { apiFetch } from '../core/state.js';
import { t } from '../i18n.js';
import { escapeHtml } from '../core/util.js';
import { mountLazyIconGrid } from '../ui-helpers/lazy-icon-grid.js';
import { _inv, _isReadOnly, _captureContext, _isContextCurrent, _releaseContext } from './model.js';
import { addItemToInventory } from './transfers.js';

function _isPickerCurrent(session) {
  return !!session && inventoryRuntime._pickerSession === session && _isContextCurrent(session) && !_isReadOnly();
}

export function _observePickerSvgs(grid, items = inventoryRuntime._pickerItems) {
  if (inventoryRuntime._pickerObserver) inventoryRuntime._pickerObserver.disconnect();
  const session = inventoryRuntime._pickerSession;
  const ownedIds = new Set(_inv().map(slot => slot.itemId));
  inventoryRuntime._pickerObserver = mountLazyIconGrid({
    grid, items,
    renderItem(item) {
      const card = document.createElement('div');
      card.className = 'inv-pick-item';
      card.dataset.id = item.id;
      card.dataset.tooltip = item.name;
      card.dataset.tooltipWrap = 'true';
      card.innerHTML = `<div class="inv-pick-svg" data-lazy-icon=""></div><div class="inv-pick-name">${escapeHtml(item.name)}</div>`;
      return card;
    },
    async loadItems(ids) {
      if (!_isPickerCurrent(session)) return [];
      const response = await apiFetch(`/api/items?ids=${ids.join(',')}`);
      return response.ok && _isPickerCurrent(session) ? response.json() : [];
    },
    hydrate(item) {
      if (_isPickerCurrent(session)) inventoryRuntime._itemCache.set(item.id, item);
    },
    release(id) {
      if (!ownedIds.has(id)) inventoryRuntime._itemCache.delete(id);
    },
  });
}

export async function _openPicker() {
  if (_isReadOnly()) return;
  if (inventoryRuntime._pickerObserver) inventoryRuntime._pickerObserver.disconnect();
  inventoryRuntime._pickerObserver = null;
  _releaseContext(inventoryRuntime._pickerSession);
  const session = _captureContext();
  inventoryRuntime._pickerSession = session;
  inventoryRuntime._pickerItems = [];
  const overlay = document.getElementById('inv-picker-overlay');
  const search  = document.getElementById('inv-search');
  const grid    = document.getElementById('inv-picker-grid');
  if (search) search.value = '';
  if (grid) grid.innerHTML = loadingHtml(t('inv.picker_loading'), 'inv-picker-empty');
  overlay.classList.add('active');
  search?.focus();
  try {
    const res = await apiFetch('/api/items?meta=1');
    const items = res.ok ? await res.json() : [];
    if (!_isPickerCurrent(session)) return;
    inventoryRuntime._pickerItems = items;
  } catch {
    if (!_isPickerCurrent(session)) return;
    inventoryRuntime._pickerItems = [];
  }
  _renderPicker(search?.value ?? '');
}

export function _closePicker() {
  _releaseContext(inventoryRuntime._pickerSession);
  inventoryRuntime._pickerSession = null;
  if (inventoryRuntime._pickerObserver) { inventoryRuntime._pickerObserver.disconnect(); inventoryRuntime._pickerObserver = null; }
  document.getElementById('inv-picker-overlay').classList.remove('active');
  // Drop everything the picker pulled in for browsing - keep only items actually in the inventory
  const ownedIds = new Set(_inv().map(s => s.itemId));
  for (const id of inventoryRuntime._itemCache.keys()) if (!ownedIds.has(id)) inventoryRuntime._itemCache.delete(id);
  inventoryRuntime._pickerItems = [];
}

export function _renderPicker(query) {
  const session = inventoryRuntime._pickerSession;
  if (!_isPickerCurrent(session)) return;
  const q     = query.trim().toLowerCase();
  const items = inventoryRuntime._pickerItems.filter(it => !q || it.name.toLowerCase().includes(q));
  const grid  = document.getElementById('inv-picker-grid');
  if (!grid) return;
  inventoryRuntime._pickerObserver?.disconnect();
  inventoryRuntime._pickerObserver = null;
  grid.scrollTop = 0;
  if (!items.length) {
    grid.innerHTML = `<div class="inv-picker-empty">${t('inv.picker_empty')}</div>`;
    return;
  }
  grid.onclick = event => {
      const el = event.target.closest('.inv-pick-item');
      if (!el) return;
      if (!_isPickerCurrent(session) || !grid.contains(el)) return;
      // Use the shared add helper to merge matching inventory stacks.
      if (!addItemToInventory(+el.dataset.id)) return;
      _closePicker();
      inventoryRuntime.renderGrid();
  };
  _observePickerSvgs(grid, items);
}
