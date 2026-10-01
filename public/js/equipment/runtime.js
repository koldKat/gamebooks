// Shared equipment UI/cache state. Per-run data stays in ../state.js.
export const equipmentRuntime = {
  _itemCache: new Map(),
  _dragSourceKey: null,
  _eqCtxMenu: null,
  _eqEditKey: null,
  _pickerSlotKey: null,
  _pickerItems: [],
  _pickerSession: null,
  _renameContext: null,
  _editContext: null,
  _dragContext: null,
  _slotContexts: [],
  cacheEpoch: 0,
  renderGrid: null,
};
