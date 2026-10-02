// runtime.js - Internal inventory module; use ../inventory.js externally.

export const inventoryRuntime = {
  _itemCache: new Map(),
  _editIdx: -1,
  _dragSrcIdx: -1,
  _displayRevision: 0,
  _extraDisplayItemsProvider: null,
  _ctxMenu: null,
  _pickerItems: [],
  _pickerObserver: null,
  _pickerSession: null,
  _editContext: null,
  _renameContext: null,
  _menuContext: null,
  _confirmContext: null,
  _dragContext: null,
  _slotContexts: [],
  cacheEpoch: 0,
  gridRevision: 0,
  renderGrid: null,
};
