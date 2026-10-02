// picker.js - Internal inventory module; use ../inventory.js externally.

import { inventoryRuntime } from './runtime.js';
import { apiFetch } from '../state.js';
import { t } from '../i18n.js';
import { escapeHtml } from '../util.js';
import { _inv, _isReadOnly, _captureContext, _isContextCurrent, _releaseContext } from './model.js';
import { _fetchItem } from './cache.js';
import { addItemToInventory } from './transfers.js';

function _isPickerCurrent(session) {
  return !!session && inventoryRuntime._pickerSession === session && _isContextCurrent(session) && !_isReadOnly();
}

export function _observePickerSvgs(grid) {
  if (inventoryRuntime._pickerObserver) inventoryRuntime._pickerObserver.disconnect();
  const session = inventoryRuntime._pickerSession;
  const isCurrent = () => _isPickerCurrent(session) && inventoryRuntime._pickerObserver === observer;
  const observer = new IntersectionObserver(entries => {
    if (!isCurrent()) return;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      observer.unobserve(el);
      const id = +el.dataset.id;
      const svgEl = el.querySelector('.inv-pick-svg');
      if (!svgEl) continue;
      _fetchItem(id, isCurrent).then(item => {
        if (isCurrent() && item?.svg_data) svgEl.innerHTML = item.svg_data;
      });
    }
  }, { root: grid, rootMargin: '60px' });
  inventoryRuntime._pickerObserver = observer;
  grid.querySelectorAll('.inv-pick-item').forEach(el => observer.observe(el));
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
  if (grid) grid.innerHTML = `<div class="inv-picker-empty">${t('inv.picker_loading')}</div>`;
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
  if (!items.length) {
    grid.innerHTML = `<div class="inv-picker-empty">${t('inv.picker_empty')}</div>`;
    return;
  }
  grid.innerHTML = items.map(it =>
    `<div class="inv-pick-item" data-id="${it.id}">
       <div class="inv-pick-svg"></div>
       <div class="inv-pick-name">${escapeHtml(it.name)}</div>
     </div>`
  ).join('');
  grid.querySelectorAll('.inv-pick-item').forEach(el => {
    el.addEventListener('click', () => {
      if (!_isPickerCurrent(session) || !grid.contains(el)) return;
      // Route through addItemToInventory() instead of pushing a slot
      // directly - it merges into an existing stack (same itemId/note/
      // label/visible) if one exists, incrementing qty. The direct-push
      // version always created a brand-new qty:1 slot, so picking the same
      // item repeatedly here never stacked, unlike every other place items
      // get added.
      if (!addItemToInventory(+el.dataset.id)) return;
      _closePicker();
      inventoryRuntime.renderGrid();
    });
  });
  _observePickerSvgs(grid);
}
