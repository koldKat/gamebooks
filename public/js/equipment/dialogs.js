// dialogs.js - Internal equipment module; use ../equipment.js externally.

import { currentPlaythrough, saveState } from '../core/state.js';
import { equipmentRuntime } from './runtime.js';
import { _eq, _eqVisible, _eqItemId, _eqMeta, _eqQty, _isReadOnly, _captureEqContext, _isEqContextCurrent } from './model.js';
import { _byId } from './cache.js';
import { _refreshOnScreenDisplay } from './display.js';

// ── Rename dialog ────────────────────────────────────────────────────────────

export function _openEqRename(key) {
  if (_isReadOnly()) return;
  const entry = _eq()[key];
  const itemId = _eqItemId(entry);
  if (!itemId) return;
  equipmentRuntime._renameContext = _captureEqContext(key);
  const item = _byId(itemId);
  const meta = _eqMeta(entry);
  const dlg = document.getElementById('eq-rename-dialog');
  const inp = document.getElementById('eq-rename-input');
  inp.value = meta.label.trim() || item?.name || '';
  dlg.dataset.key = key;
  dlg.classList.add('active');
  inp.focus();
  inp.select();
}

export function _closeEqRename(save) {
  const dlg = document.getElementById('eq-rename-dialog');
  if (!dlg.classList.contains('active')) return;
  if (save && _isEqContextCurrent(equipmentRuntime._renameContext)) {
    const key = dlg.dataset.key;
    const val = document.getElementById('eq-rename-input').value.trim();
    const pt = currentPlaythrough();
    const entry = pt?.equipment?.[key];
    const itemId = _eqItemId(entry);
    if (pt && itemId) {
      const meta = _eqMeta(entry);
      pt.equipment = { ...pt.equipment, [key]: { itemId, label: val, note: meta.note, qty: _eqQty(entry) } };
      saveState();
      equipmentRuntime.renderGrid();
      _refreshOnScreenDisplay();
    }
  }
  dlg.classList.remove('active');
  equipmentRuntime._renameContext = null;
}

// ── Edit dialog (qty / note / show-on-screen) ──────────────────────────────────


export function _openEqEditAt(key, x, y) {
  if (_isReadOnly()) return;
  const entry = _eq()[key];
  const itemId = _eqItemId(entry);
  if (!itemId) return;
  equipmentRuntime._eqEditKey = key;
  equipmentRuntime._editContext = _captureEqContext(key);
  const item = _byId(itemId);
  const meta = _eqMeta(entry);
  const dlg = document.getElementById('eq-edit-dialog');
  document.getElementById('eq-edit-title').textContent = meta.label.trim() || item?.name || '';
  document.getElementById('eq-edit-qty').value = _eqQty(entry);
  document.getElementById('eq-edit-note').value = meta.note;
  document.getElementById('eq-edit-visible').checked = !!_eqVisible()[key];
  const dlgW = 196;
  let left = x, top = y;
  if (left + dlgW > window.innerWidth - 8) left = window.innerWidth - dlgW - 8;
  if (left < 8) left = 8;
  dlg.style.left = left + 'px';
  dlg.style.top  = top + 'px';
  dlg.classList.add('active');
  document.getElementById('eq-edit-qty').focus();
}

export function _closeEqEdit() {
  if (!equipmentRuntime._eqEditKey) return;
  const key = equipmentRuntime._eqEditKey;
  const context = equipmentRuntime._editContext;
  equipmentRuntime._eqEditKey = null;
  equipmentRuntime._editContext = null;
  const qty = Math.max(1, parseInt(document.getElementById('eq-edit-qty').value, 10) || 1);
  const note = document.getElementById('eq-edit-note').value.trim();
  const visible = document.getElementById('eq-edit-visible').checked;
  const pt = currentPlaythrough();
  const entry = pt?.equipment?.[key];
  const itemId = _eqItemId(entry);
  if (pt && itemId && _isEqContextCurrent(context)) {
    const meta = _eqMeta(entry);
    pt.equipment = { ...pt.equipment, [key]: { itemId, label: meta.label, note, qty } };
    pt.equipmentVisible = { ...(pt.equipmentVisible ?? {}), [key]: visible };
    saveState();
    equipmentRuntime.renderGrid();
    _refreshOnScreenDisplay();
  }
  document.getElementById('eq-edit-dialog').classList.remove('active');
}
