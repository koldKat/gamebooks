// slots.js - Internal equipment module; use ../equipment.js externally.

import { addItemToInventory, refreshInventoryUI } from '../inventory.js';
import { equipmentRuntime } from './runtime.js';
import { _eq, _eqVisible, _eqItemId, _eqMeta, _eqQty, _unsetEq, _swapEq, _isReadOnly, _captureEqContext, _isEqContextCurrent } from './model.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { t } from '../i18n.js';
import { _refreshOnScreenDisplay } from './display.js';
import { _showEqCtx } from './context-menu.js';
import { _closeEqEdit } from './dialogs.js';
import { _openPicker } from './picker.js';

export function _wireSlotEvents(container, ro) {
  if (ro) return;
  container.querySelectorAll('.eq-slot').forEach(el => {
    const context = _captureEqContext(el.dataset.key);
    equipmentRuntime._slotContexts.push(context);
    el.addEventListener('click', e => {
      if (_isReadOnly() || !_isEqContextCurrent(context)) return;
      if (e.target.closest('.eq-slot-remove')) return;
      _openPicker(el.dataset.key);
    });

    // Allow moves/swaps across body slots and the item row.
    if (el.classList.contains('eq-slot--filled')) {
      el.draggable = true;
      el.addEventListener('dragstart', e => {
        if (_isReadOnly() || !_isEqContextCurrent(context)) { e.preventDefault(); return; }
        equipmentRuntime._dragSourceKey = el.dataset.key;
        equipmentRuntime._dragContext = context;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', el.dataset.key);
        el.classList.add('eq-slot--dragging');
      });
      el.addEventListener('dragend', () => {
        equipmentRuntime._dragSourceKey = null;
        equipmentRuntime._dragContext = null;
        el.classList.remove('eq-slot--dragging');
        document.querySelectorAll('.eq-slot--drag-over').forEach(n => n.classList.remove('eq-slot--drag-over'));
      });
    }

    el.addEventListener('dragover', e => {
      if (!equipmentRuntime._dragSourceKey || equipmentRuntime._dragSourceKey === el.dataset.key) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('eq-slot--drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('eq-slot--drag-over'));
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('eq-slot--drag-over');
      const src = equipmentRuntime._dragSourceKey || e.dataTransfer.getData('text/plain');
      const sourceContext = equipmentRuntime._dragContext;
      equipmentRuntime._dragSourceKey = null;
      equipmentRuntime._dragContext = null;
      if (_isReadOnly() || !_isEqContextCurrent(context) || !_isEqContextCurrent(sourceContext)) return;
      if (!src || src === el.dataset.key) return;
      _swapEq(src, el.dataset.key);
      equipmentRuntime.renderGrid();
      _refreshOnScreenDisplay();
    });
  });

  container.querySelectorAll('.eq-slot-remove').forEach(btn => {
    const context = _captureEqContext(btn.dataset.key);
    equipmentRuntime._slotContexts.push(context);
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (_isReadOnly() || !_isEqContextCurrent(context)) return;
      const key = btn.dataset.key;
      const entry = _eq()[key];
      const itemId = _eqItemId(entry);
      const meta = _eqMeta(entry);
      const qty = _eqQty(entry);
      const wasVisible = !!_eqVisible()[key];
      // Only remove equipment after inventory has accepted the entire stack.
      if (itemId && !addItemToInventory(itemId, { visible: wasVisible, label: meta.label, note: meta.note, qty })) {
        showAlert(t('eq.inventory_full'));
        return;
      }
      _unsetEq(key);
      refreshInventoryUI();
      _refreshOnScreenDisplay();
      equipmentRuntime.renderGrid();
    });
  });

  container.querySelectorAll('.eq-slot--filled').forEach(el => {
    const context = _captureEqContext(el.dataset.key);
    equipmentRuntime._slotContexts.push(context);
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (_isReadOnly() || !_isEqContextCurrent(context)) return;
      _closeEqEdit();
      _showEqCtx(el.dataset.key, e.clientX, e.clientY);
    });
  });
}
