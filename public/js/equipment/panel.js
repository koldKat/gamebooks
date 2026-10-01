// panel.js - Internal equipment module; use ../equipment.js externally.

import { equipmentRuntime } from './runtime.js';
import { _closeEqCtx } from './context-menu.js';
import { _closeEqRename, _closeEqEdit } from './dialogs.js';
import { _closePicker } from './picker.js';
import { _releaseEqContext } from './model.js';

// ── Panel ─────────────────────────────────────────────────────────────────────

export function _openPanel() {
  document.getElementById('eq-overlay').classList.add('active');
  equipmentRuntime.renderGrid();
}

export function _closePanel() {
  document.getElementById('eq-overlay').classList.remove('active');
}
export function setEquipmentVisible(visible) {
  const btn = document.getElementById('equipment-btn');
  if (btn) {
    btn.style.display = visible ? '' : 'none';
  }
  if (!visible) {
    _closePanel();
    _closePicker();
    _closeEqCtx();
    _closeEqRename(false);
    _closeEqEdit();
    equipmentRuntime.cacheEpoch++;
    equipmentRuntime._dragSourceKey = null;
    equipmentRuntime._dragContext = null;
    equipmentRuntime._renameContext = null;
    equipmentRuntime._editContext = null;
    // Hidden slot DOM must not retain a previous book through its closures.
    for (const context of equipmentRuntime._slotContexts) _releaseEqContext(context);
    equipmentRuntime._slotContexts = [];
    equipmentRuntime._itemCache.clear();
    equipmentRuntime._pickerItems = [];
  }
}
