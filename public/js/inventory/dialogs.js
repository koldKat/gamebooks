// dialogs.js - Internal inventory module; use ../inventory.js externally.

import { inventoryRuntime } from './runtime.js';
import { _inv, _setInv, _isReadOnly, _captureContext, _isContextCurrent, _releaseContext } from './model.js';
import { _byId } from './cache.js';

export function _closeEdit() {
  if (inventoryRuntime._editIdx < 0) return;
  // read values and save
  const qty  = Math.max(1, parseInt(document.getElementById('inv-edit-qty').value, 10) || 1);
  const note = document.getElementById('inv-edit-note').value.trim();
  const visible = document.getElementById('inv-edit-visible').checked;

  const context = inventoryRuntime._editContext;
  const arr = _inv();
  if (!_isReadOnly() && _isContextCurrent(context) && arr[inventoryRuntime._editIdx]) {
    arr[inventoryRuntime._editIdx] = { ...arr[inventoryRuntime._editIdx], qty, note, visible };
    _setInv(arr);
    inventoryRuntime.renderGrid();
  }
  inventoryRuntime._editIdx = -1;
  _releaseContext(context);
  inventoryRuntime._editContext = null;
  document.getElementById('inv-edit-dialog').classList.remove('active');
}

export function _openRename(idx) {
  if (_isReadOnly()) return;
  const inv  = _inv();
  const slot = inv[idx];
  if (!slot) return;
  _releaseContext(inventoryRuntime._renameContext);
  inventoryRuntime._renameContext = _captureContext(idx);
  const item = _byId(slot.itemId);
  const dlg  = document.getElementById('inv-rename-dialog');
  const inp  = document.getElementById('inv-rename-input');
  inp.value  = slot.label?.trim() || item?.name || '';
  dlg.dataset.idx = idx;
  dlg.classList.add('active');
  inp.focus();
  inp.select();
}

export function _closeRename(save) {
  const dlg = document.getElementById('inv-rename-dialog');
  if (!dlg.classList.contains('active')) return;
  if (save && !_isReadOnly() && _isContextCurrent(inventoryRuntime._renameContext)) {
    const idx = +dlg.dataset.idx;
    const val = document.getElementById('inv-rename-input').value.trim();
    const arr = _inv();
    if (arr[idx]) { arr[idx] = { ...arr[idx], label: val }; _setInv(arr); inventoryRuntime.renderGrid(); }
  }
  dlg.classList.remove('active');
  _releaseContext(inventoryRuntime._renameContext);
  inventoryRuntime._renameContext = null;
}

export function _openEditAt(idx, x, y) {
  if (_isReadOnly()) return;
  const inv  = _inv();
  const slot = inv[idx];
  if (!slot) return;
  inventoryRuntime._editIdx = idx;
  _releaseContext(inventoryRuntime._editContext);
  inventoryRuntime._editContext = _captureContext(idx);
  const item = _byId(slot.itemId);
  const dlg = document.getElementById('inv-edit-dialog');
  document.getElementById('inv-edit-title').textContent = slot.label?.trim() || item?.name || '';
  document.getElementById('inv-edit-qty').value     = slot.qty ?? 1;
  document.getElementById('inv-edit-note').value    = slot.note ?? '';
  document.getElementById('inv-edit-visible').checked = !!slot.visible;
  dlg.style.left = x + 'px';
  dlg.style.top  = y + 'px';
  dlg.classList.add('active');
  // Clamp both axes using the visible dialog's measured dimensions.
  const r = dlg.getBoundingClientRect();
  if (r.right  > window.innerWidth  - 8) dlg.style.left = Math.max(8, window.innerWidth  - r.width  - 8) + 'px';
  if (r.bottom > window.innerHeight - 8) dlg.style.top  = Math.max(8, window.innerHeight - r.height - 8) + 'px';
  document.getElementById('inv-edit-qty').focus();
}
