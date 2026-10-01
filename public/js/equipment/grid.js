// grid.js - Internal equipment module; use ../equipment.js externally.

import { escapeHtml } from '../util.js';
import { t } from '../i18n.js';
import { _isReadOnly, _eq, _eqItemId, _eqMeta, _eqQty, _captureEqContext, _isEqContextCurrent } from './model.js';
import { equipmentRuntime } from './runtime.js';
import { _ensureEquippedItems, _byId } from './cache.js';
import { _wireSlotEvents } from './slots.js';
import { SLOTS, ITEM_SLOTS, DUMMY_SVG } from './constants.js';

export function _slotHtml(slot, eq, ro, positioned) {
  const entry = eq[slot.key];
  const itemId = _eqItemId(entry);
  const meta = _eqMeta(entry);
  const qty = _eqQty(entry);
  const item = itemId ? _byId(itemId) : null;
  const filledClass = item ? ' eq-slot--filled' : '';
  const svg  = item ? `<div class="eq-slot-svg">${item.svg_data}</div>` : `<div class="eq-slot-svg eq-slot-svg--empty"></div>`;
  const name = item ? escapeHtml(meta.label.trim() || item.name) : slot.label();
  const noteHtml = item && meta.note ? `<div class="eq-slot-note-label" data-tooltip="${escapeHtml(meta.note)}">${escapeHtml(meta.note)}</div>` : '';
  const qtyHtml = item && qty > 1 ? `<span class="eq-slot-qty">×${qty}</span>` : '';
  const removeBtn = item && !ro ? `<button class="eq-slot-remove" data-key="${slot.key}" draggable="false" aria-label="${t('eq.unequip')}">✕</button>` : '';
  const roClass = !ro ? ' eq-slot--editable' : '';
  const style = positioned ? ` style="left:${slot.x}%;top:${slot.y}%"` : '';
  return `<div class="eq-slot${filledClass}${roClass}" data-key="${slot.key}"${style}>
    ${removeBtn}
    ${svg}
    <div class="eq-slot-name">${name}</div>
    ${noteHtml}
    ${qtyHtml}
  </div>`;
}
export async function _renderGrid() {
  const context = _captureEqContext(), epoch = equipmentRuntime.cacheEpoch;
  await _ensureEquippedItems();
  if (!_isEqContextCurrent(context) || epoch !== equipmentRuntime.cacheEpoch) return;
  const body = document.getElementById('eq-body');
  const itemsRow = document.getElementById('eq-items');
  if (!body) return;
  equipmentRuntime._slotContexts = [];
  const eq = _eq();
  const ro = _isReadOnly();

  const slotsHtml = SLOTS.map(slot => _slotHtml(slot, eq, ro, true)).join('');
  body.innerHTML = DUMMY_SVG + slotsHtml;
  body.classList.toggle('eq-body--readonly', ro);

  if (itemsRow) {
    itemsRow.innerHTML = ITEM_SLOTS.map(slot => _slotHtml(slot, eq, ro, false)).join('');
    itemsRow.classList.toggle('eq-body--readonly', ro);
  }

  const tmplBtn = document.getElementById('eq-save-template-btn');
  if (tmplBtn) tmplBtn.style.display = ro ? 'none' : '';

  _wireSlotEvents(body, ro);
  if (itemsRow) _wireSlotEvents(itemsRow, ro);
}
