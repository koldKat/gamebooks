// Submit only changed graph items so vis-network can retain unchanged render state.
function sameValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Object.getPrototypeOf(a) !== Object.prototype && !Array.isArray(a)) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key =>
    Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}

export function updateChangedItems(dataset, items) {
  const changed = items.filter(item => {
    const previous = dataset.get(item.id);
    return !previous || Object.keys(item).some(key => !sameValue(item[key], previous[key]));
  });
  if (changed.length) dataset.update(changed);
}
