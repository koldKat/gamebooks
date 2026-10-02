// slots.js - Internal inventory module; use ../inventory.js externally.

import { inventoryRuntime } from './runtime.js';
import { _isReadOnly, _inv, _setInv, _captureContext, _isContextCurrent, _releaseContext } from './model.js';
import { _closeEdit } from './dialogs.js';
import { _showCtx } from './context-menu.js';

export function _wireSlotEvents(grid) {
  inventoryRuntime._dragSrcIdx = -1;
  inventoryRuntime._dragContext = null;
  inventoryRuntime._slotContexts.forEach(_releaseContext);
  inventoryRuntime._slotContexts = [];
  const readOnly = _isReadOnly();
  grid.querySelectorAll('.inv-slot--filled').forEach(slotEl => {
    const context = _captureContext(+slotEl.dataset.idx);
    inventoryRuntime._slotContexts.push(context);
    slotEl.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (readOnly || _isReadOnly() || !_isContextCurrent(context)) return;
      _closeEdit();
      _showCtx(+slotEl.dataset.idx, e.clientX, e.clientY);
    });

    if (readOnly) return;
    slotEl.addEventListener('dragstart', e => {
      if (_isReadOnly() || !_isContextCurrent(context)) { e.preventDefault(); return; }
      inventoryRuntime._dragSrcIdx = +slotEl.dataset.idx;
      inventoryRuntime._dragContext = context;
      e.dataTransfer.effectAllowed = 'move';
      slotEl.classList.add('inv-slot--dragging');
    });

    slotEl.addEventListener('dragend', () => {
      grid.querySelectorAll('.inv-slot--drag-over').forEach(el => el.classList.remove('inv-slot--drag-over'));
      slotEl.classList.remove('inv-slot--dragging');
      inventoryRuntime._dragSrcIdx = -1;
      inventoryRuntime._dragContext = null;
    });

    slotEl.addEventListener('dragover', e => {
      if (_isReadOnly() || !_isContextCurrent(context) || !_isContextCurrent(inventoryRuntime._dragContext)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (+slotEl.dataset.idx !== inventoryRuntime._dragSrcIdx) {
        grid.querySelectorAll('.inv-slot--drag-over').forEach(el => el.classList.remove('inv-slot--drag-over'));
        slotEl.classList.add('inv-slot--drag-over');
      }
    });

    slotEl.addEventListener('drop', e => {
      e.preventDefault();
      const destIdx = +slotEl.dataset.idx;
      const srcIdx = inventoryRuntime._dragSrcIdx;
      const sourceContext = inventoryRuntime._dragContext;
      inventoryRuntime._dragSrcIdx = -1;
      inventoryRuntime._dragContext = null;
      if (_isReadOnly() || !_isContextCurrent(context) || !_isContextCurrent(sourceContext)) return;
      if (srcIdx < 0 || srcIdx === destIdx) return;
      const arr = _inv();
      const [moved] = arr.splice(srcIdx, 1);
      arr.splice(destIdx, 0, moved);
      _setInv(arr);
      inventoryRuntime.renderGrid();
    });
  });

}
