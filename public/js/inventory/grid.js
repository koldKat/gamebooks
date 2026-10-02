// grid.js - Internal inventory module; use ../inventory.js externally.

import { inventoryRuntime } from './runtime.js';
import { MAX_SLOTS } from './constants.js';
import { _inv, _isReadOnly, _captureContext, _isContextCurrent } from './model.js';
import { _ensureInvItems, _byId } from './cache.js';
import { escapeHtml } from '../core/util.js';
import { _wireSlotEvents } from './slots.js';
import { renderInventoryDisplay } from './display.js';

export async function _renderGrid() {
  const context = _captureContext(), revision = ++inventoryRuntime.gridRevision;
  const isCurrent = () => _isContextCurrent(context) && revision === inventoryRuntime.gridRevision;
  await _ensureInvItems();
  if (!isCurrent()) return;
  const grid = document.getElementById('inv-grid');
  const countEl = document.getElementById('inv-count-label');
  const addBtn  = document.getElementById('inv-add-btn');
  if (!grid) return;
  const inv = _inv();
  if (countEl) countEl.textContent = `${inv.length} / ${MAX_SLOTS}`;
  const ro = _isReadOnly();
  if (addBtn) {
    addBtn.style.display = ro ? 'none' : '';
    addBtn.disabled = inv.length >= MAX_SLOTS;
  }
  const tmplBtn = document.getElementById('inv-save-template-btn');
  if (tmplBtn) tmplBtn.style.display = ro ? 'none' : '';

  const visibleSlots = Math.min(MAX_SLOTS, Math.ceil((inv.length + 1) / 5) * 5);
  let html = '';
  for (let i = 0; i < visibleSlots; i++) {
    const slot = inv[i];
    const item = slot ? _byId(slot.itemId) : null;
    if (item) {
      const displayName = slot.label?.trim() || item.name;
      const qtyBadge  = (slot.qty > 1) ? `<span class="inv-slot-qty">×${slot.qty}</span>` : '';
      const noteBadge = slot.note?.trim() ? `<div class="inv-slot-note-label">${escapeHtml(slot.note.trim())}</div>` : '';
      const eyeClass  = slot.visible ? ' inv-slot--visible' : '';
      html += `<div class="inv-slot inv-slot--filled${eyeClass}" data-idx="${i}"${_isReadOnly() ? '' : ' draggable="true"'}>
        ${qtyBadge}
        <div class="inv-slot-svg">${item.svg_data}</div>
        <div class="inv-slot-name">${escapeHtml(displayName)}</div>
        ${noteBadge}
      </div>`;
    } else {
      html += `<div class="inv-slot"></div>`;
    }
  }
  grid.innerHTML = html;

  _wireSlotEvents(grid);

  const extra = inventoryRuntime._extraDisplayItemsProvider ? await inventoryRuntime._extraDisplayItemsProvider() : [];
  if (isCurrent()) renderInventoryDisplay(extra, isCurrent);
}
