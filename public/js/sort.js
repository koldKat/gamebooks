const _naturalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function _toSortableString(value) {
  return value == null ? '' : String(value);
}

export function foldForSearch(value) {
  return _toSortableString(value).normalize('NFC').toLocaleLowerCase();
}

export function matchesSearch(value, query) {
  const haystack = foldForSearch(value);
  const needle = foldForSearch(query);
  if (!needle) return false;
  return haystack.includes(needle);
}

export function naturalCompare(a, b) {
  return _naturalCollator.compare(_toSortableString(a), _toSortableString(b));
}

export function naturalCompareByName(a, b) {
  return naturalCompare(a?.name, b?.name);
}
