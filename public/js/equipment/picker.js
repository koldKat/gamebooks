// picker.js - Internal equipment module; use ../equipment.js externally.

import { getInventorySlots } from '../inventory.js';
import { escapeHtml } from '../core/util.js';
import { t } from '../i18n.js';
import { equipmentRuntime } from './runtime.js';
import { _eq, _eqItemId, _isReadOnly, _captureEqContext, _isEqContextCurrent, _releaseEqContext } from './model.js';
import { _fetchItems, _byId } from './cache.js';
import { _equipItem } from './transfers.js';
import { ALL_SLOTS } from './constants.js';

// ── Picker ────────────────────────────────────────────────────────────────────


export async function _openPicker(slotKey) {
  if (_isReadOnly()) return;
  const slot = ALL_SLOTS.find(s => s.key === slotKey);
  if (!slot) return;
  equipmentRuntime._pickerSlotKey = slotKey;
  _releaseEqContext(equipmentRuntime._pickerSession);
  const session = _captureEqContext(slotKey);
  equipmentRuntime._pickerSession = session;
  equipmentRuntime._pickerItems = [];
  const overlay = document.getElementById('eq-picker-overlay');
  const search  = document.getElementById('eq-search');
  const grid    = document.getElementById('eq-picker-grid');
  document.getElementById('eq-picker-title').textContent = t('eq.picker_title', { slot: slot.label() });
  if (search) search.value = '';
  if (grid) grid.innerHTML = `<div class="inv-picker-empty">${t('inv.picker_loading')}</div>`;
  overlay.classList.add('active');
  search?.focus();

  const invSlots = getInventorySlots();
  const ids = [...new Set(invSlots.map(s => s.itemId))].filter(id => !equipmentRuntime._itemCache.has(id));
  const isCurrent = () => equipmentRuntime._pickerSession === session && _isEqContextCurrent(session) && !_isReadOnly();
  if (ids.length) await _fetchItems(ids, isCurrent);
  if (!isCurrent()) return;

  equipmentRuntime._pickerItems = invSlots
    .map((s, idx) => ({ idx, itemId: s.itemId, qty: s.qty, label: s.label, note: s.note, visible: s.visible, item: _byId(s.itemId) }))
    .filter(s => s.item);

  _renderPicker(search?.value ?? '');
}

export function _closePicker() {
  _releaseEqContext(equipmentRuntime._pickerSession);
  equipmentRuntime._pickerSession = null;
  document.getElementById('eq-picker-overlay').classList.remove('active');
  // Drop everything the picker pulled in for browsing - keep only equipped items
  const equippedIds = new Set(Object.values(_eq()).map(_eqItemId).filter(Boolean));
  for (const id of equipmentRuntime._itemCache.keys()) if (!equippedIds.has(id)) equipmentRuntime._itemCache.delete(id);
  equipmentRuntime._pickerItems = [];
  equipmentRuntime._pickerSlotKey = null;
}

export function _renderPicker(query) {
  const session = equipmentRuntime._pickerSession;
  if (!session || !_isEqContextCurrent(session) || _isReadOnly()) return;
  const q     = query.trim().toLowerCase();
  const items = equipmentRuntime._pickerItems.filter(it => !q || (it.label?.trim() || it.item.name).toLowerCase().includes(q));
  const grid  = document.getElementById('eq-picker-grid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = `<div class="inv-picker-empty">${t('eq.picker_empty')}</div>`;
    return;
  }
  grid.innerHTML = items.map(it => {
    const displayName = it.label?.trim() || it.item.name;
    const qtyHtml = it.qty > 1 ? ` <span class="inv-line-qty">×${it.qty}</span>` : '';
    return `<div class="inv-pick-item" data-idx="${it.idx}">
       <div class="inv-pick-svg">${it.item.svg_data}</div>
       <div class="inv-pick-name">${escapeHtml(displayName)}${qtyHtml}</div>
     </div>`;
  }).join('');
  grid.querySelectorAll('.inv-pick-item').forEach(el => {
    const it = items.find(item => item.idx === +el.dataset.idx);
    if (!it) return;
    el.addEventListener('click', () => {
      if (equipmentRuntime._pickerSession !== session || !_isEqContextCurrent(session) || _isReadOnly()) return;
      const current = getInventorySlots()[it.idx];
      if (!current || current.itemId !== it.itemId || current.qty !== it.qty ||
          (current.label || '') !== (it.label || '') || (current.note || '') !== (it.note || '') || !!current.visible !== !!it.visible) {
        _openPicker(session.key);
        return;
      }
      _equipItem(session.key, it.idx);
      _closePicker();
      equipmentRuntime.renderGrid();
    });
  });
}
