// Move mobile inventory stacks atomically while preserving desktop metadata.
export const MAX_ITEMS = 40;

export function inventorySlots(run) {
  return (run.inventory || []).filter(item => item != null).map(item => typeof item === 'number'
    ? { itemId: item, qty: 1, label: '', note: '', visible: false }
    : { ...item, qty: item.qty || 1, label: item.label || '', note: item.note || '', visible: !!item.visible });
}

export function equipmentSlot(run, key) {
  const entry = run.equipment?.[key];
  if (!entry) return null;
  const item = typeof entry === 'number' ? { itemId: entry } : entry;
  return { ...item, qty: item.qty || 1, label: item.label || '', note: item.note || '', visible: !!run.equipmentVisible?.[key] };
}

function mergeOrInsert(inventory, entry, index = inventory.length) {
  const matching = inventory.find(item => item.itemId === entry.itemId &&
    (item.label || '') === (entry.label || '') && (item.note || '') === (entry.note || '') && !!item.visible === !!entry.visible);
  if (matching) { matching.qty += entry.qty || 1; return true; }
  if (inventory.length >= MAX_ITEMS) return false;
  inventory.splice(Math.min(index, inventory.length), 0, { ...entry });
  return true;
}

export function addMobileItem(run, itemId) {
  if (run.completed || !Number.isSafeInteger(itemId) || itemId < 1) return false;
  const inventory = inventorySlots(run);
  if (!mergeOrInsert(inventory, { itemId, qty: 1, label: '', note: '', visible: false })) return false;
  run.inventory = inventory;
  return true;
}

export function moveMobileItem(run, from, to) {
  if (run.completed || !from || !to) return false;
  const inventory = inventorySlots(run);
  const equipment = { ...(run.equipment || {}) };
  const visibility = { ...(run.equipmentVisible || {}) };
  const source = from.kind === 'inventory' ? inventory[from.index] : equipmentSlot(run, from.key);
  if (!source) return false;
  const assignEquipment = (key, entry) => {
    if (!entry) { delete equipment[key]; delete visibility[key]; return; }
    const { visible, ...stored } = entry;
    equipment[key] = stored;
    visibility[key] = !!visible;
  };
  if (to.kind === 'trash') {
    if (from.kind !== 'inventory' || !Number.isSafeInteger(from.index) || from.index < 0) return false;
    inventory.splice(from.index, 1);
  } else if (to.kind === 'equipment') {
    if (from.kind === 'equipment' && from.key === to.key) return false;
    const previous = equipmentSlot(run, to.key);
    if (from.kind === 'inventory') {
      inventory.splice(from.index, 1);
      if (previous && !mergeOrInsert(inventory, previous)) return false;
    } else assignEquipment(from.key, previous);
    assignEquipment(to.key, source);
  } else if (to.kind === 'inventory') {
    if (from.kind === 'inventory') {
      if (from.index === to.index) return false;
      inventory.splice(from.index, 1);
      inventory.splice(Math.min(to.index, inventory.length), 0, source);
    } else {
      if (!mergeOrInsert(inventory, source, to.index)) return false;
      assignEquipment(from.key, null);
    }
  } else return false;
  run.inventory = inventory;
  run.equipment = equipment;
  run.equipmentVisible = visibility;
  return true;
}
