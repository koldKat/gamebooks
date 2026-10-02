// transfers.js - Internal equipment module; use ../equipment.js externally.

import { addItemToInventory, removeAllFromInventoryAt, refreshInventoryUI } from '../inventory.js';
import { _isReadOnly, _eq, _eqVisible, _eqItemId, _eqMeta, _eqQty, _setEq } from './model.js';
import { _refreshOnScreenDisplay } from './display.js';

// Move whole stacks and their metadata/visibility; return the old equipped item to inventory.
export function _equipItem(slotKey, invIdx) {
  if (_isReadOnly()) return;
  const prevEntry = _eq()[slotKey];
  const prevItemId = _eqItemId(prevEntry);
  const prevMeta = _eqMeta(prevEntry);
  const prevQty = _eqQty(prevEntry);
  const prevVisible = !!_eqVisible()[slotKey];
  const removed = removeAllFromInventoryAt(invIdx);
  if (!removed) return;
  if (prevItemId) addItemToInventory(prevItemId, { visible: prevVisible, label: prevMeta.label, note: prevMeta.note, qty: prevQty });
  _setEq(slotKey, removed.itemId, removed.visible, removed.label, removed.note, removed.qty);
  refreshInventoryUI();
  _refreshOnScreenDisplay();
}
