import { naturalCompare } from '../core/sort.js';

// Container membership includes the primary parent and secondary anthology memberships.
export const _containerIdsFor = b => [...new Set(b.parent_book_id
  ? [b.parent_book_id, ...(b.extra_anthology_ids || [])]
  : (b.extra_anthology_ids || []))];

// Resolve book order per anthology; secondary memberships do not use the primary book_order.
export const _orderForContainer = (b, pid) => pid === b.parent_book_id ? b.book_order : (b.extra_anthology_orders?.[pid] ?? null);
export const _sortChildrenMap = map => {
  for (const pid of Object.keys(map)) {
    const pidNum = Number(pid);
    map[pid].sort((a, b) => _compareByRecentOptionalNumberThenName(
      { ...a, book_order: _orderForContainer(a, pidNum) },
      { ...b, book_order: _orderForContainer(b, pidNum) },
      'book_order'
    ));
  }
};

export const _sortBooks = arr => [...arr].sort((a, b) => {
  if (a.is_demo !== b.is_demo) return (a.is_demo ? 1 : 0) - (b.is_demo ? 1 : 0);
  const aHas = a.last_run_at != null, bHas = b.last_run_at != null;
  if (aHas && bHas) return b.last_run_at - a.last_run_at;
  if (aHas) return -1; if (bHas) return 1;
  return naturalCompare(a.name, b.name);
});

export const _compareByRecentOptionalNumberThenName = (a, b, field) => {
  const aHas = a.last_run_at != null, bHas = b.last_run_at != null;
  if (aHas && bHas) return b.last_run_at - a.last_run_at;
  if (aHas) return -1; if (bHas) return 1;
  const aStr = a[field] != null ? String(a[field]).trim() : '';
  const bStr = b[field] != null ? String(b[field]).trim() : '';
  // Natural-compare the raw value so numbered-with-suffix orders correctly (2 < 2a < 3 < 3i, 2 < 10).
  const aValid = aStr !== '' && !isNaN(parseFloat(aStr));
  const bValid = bStr !== '' && !isNaN(parseFloat(bStr));
  if (aValid && bValid) return naturalCompare(aStr, bStr) || naturalCompare(a.name, b.name);
  if (aValid) return -1; if (bValid) return 1;
  return naturalCompare(a.name, b.name);
};

export const _sortSeriesBooks = arr => [...arr].sort((a, b) => {
  if (a.is_demo !== b.is_demo) return (a.is_demo ? 1 : 0) - (b.is_demo ? 1 : 0);
  return _compareByRecentOptionalNumberThenName(a, b, 'series_number');
});

export const _aggregateProgress = (activeBooks, containerChildrenMap = {}) => {
  let visited = 0, totalSections = 0;
  const containerIds = new Set(Object.keys(containerChildrenMap).map(id => Number(id)));
  for (const b of activeBooks) {
    if (_containerIdsFor(b).some(pid => containerIds.has(Number(pid)))) continue;
    if (b.is_container) {
      const children = containerChildrenMap[b.id] || [];
      visited       += children.reduce((s, c) => s + (c.visited || 0), 0);
      totalSections += children.reduce((s, c) => s + ((c.discoverable_sections ?? c.total_sections) || 0), 0);
    } else {
      visited       += b.visited || 0;
      totalSections += (b.discoverable_sections ?? b.total_sections) || 0;
    }
  }
  return { visited, totalSections };
};
