// panel.js - Internal inventory module; use ../inventory.js externally.

import { inventoryRuntime } from './runtime.js';
import { _closeEdit, _closeRename } from './dialogs.js';
import { _closePicker } from './picker.js';
import { _closeCtx } from './context-menu.js';
import { _releaseContext } from './model.js';

export function _openPanel() {
  document.getElementById('inv-overlay').classList.add('active');
  inventoryRuntime.renderGrid();
}

export function _closePanel() {
  _closeEdit();
  document.getElementById('inv-overlay').classList.remove('active');
}

export function setInventoryVisible(visible) {
  const btn = document.getElementById('inventory-btn');
  if (btn) {
    btn.style.display = visible ? '' : 'none';
  }
  if (!visible) {
    _closePanel();
    _closePicker();
    _closeCtx();
    _closeRename(false);
    inventoryRuntime.cacheEpoch++;
    inventoryRuntime.gridRevision++;
    inventoryRuntime._displayRevision++;
    _releaseContext(inventoryRuntime._confirmContext);
    inventoryRuntime._confirmContext = null;
    inventoryRuntime._slotContexts.forEach(_releaseContext);
    inventoryRuntime._slotContexts = [];
    inventoryRuntime._dragSrcIdx = -1;
    inventoryRuntime._dragContext = null;
    inventoryRuntime._itemCache.clear();
    inventoryRuntime._pickerItems = [];
  }
}
