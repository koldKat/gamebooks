import { naturalCompare } from '../core/sort.js';
import { getCachedBooks, getCachedStashes } from '../books.js';
import { escapeHtml } from '../core/util.js';

export function _stashAssignedBooksSet() {
  const set = new Set();
  for (const stash of (getCachedStashes() || [])) {
    for (const id of (stash.bookIds || [])) set.add(id);
    for (const id of _collectImplicitStashBookIds(stash.bookIds, stash.seriesIds, stash.excludedBookIds)) set.add(id);
  }
  return set;
}

export function _stashAssignedSeriesSet() {
  const set = new Set();
  for (const stash of (getCachedStashes() || [])) for (const id of (stash.seriesIds || [])) set.add(id);
  return set;
}

export function _stashItemKey(itemOrKind, maybeId) {
  if (typeof itemOrKind === 'object' && itemOrKind) return `${itemOrKind.kind}:${itemOrKind.id}`;
  return `${itemOrKind}:${maybeId}`;
}

export function _renderStashRows(items, selectedSet) {
  return items.map(item =>
    `<label class="stash-pick-row stash-pick-row--${item.kind}${selectedSet.has(_stashItemKey(item)) ? ' stash-pick-row--selected' : ''}">` +
      `<input type="checkbox" class="${item.cbClass}" value="${item.id}" ${selectedSet.has(_stashItemKey(item)) ? 'checked' : ''}>` +
      `<span class="stash-pick-label">${escapeHtml(item.name)}</span>` +
      `<span class="stash-pick-meta">${item.kind}</span>` +
    `</label>`
  ).join('');
}

export function _buildStashPickerItems(seriesItems, bookItems, mode) {
  return [
    ...seriesItems.map(s => ({ id: s.id, name: s.name, kind: 'series', cbClass: `${mode}-series-cb` })),
    ...bookItems.map(b => ({
      id: b.id,
      name: b.name,
      kind: b.is_container ? 'anthology' : 'book',
      cbClass: `${mode}-book-cb`,
    })),
  ];
}

export function _stashBooksById() {
  return new Map((getCachedBooks() || []).map(b => [b.id, b]));
}

export function _stashChildIdsByParentId() {
  const map = new Map();
  for (const book of (getCachedBooks() || [])) {
    if (!book.parent_book_id) continue;
    if (!map.has(book.parent_book_id)) map.set(book.parent_book_id, []);
    map.get(book.parent_book_id).push(book.id);
  }
  return map;
}

export function _collectImplicitStashBookIds(bookIds, seriesIds, excludedBookIds = []) {
  const implicitBookIds = new Set();
  const selectedBookIds = new Set(bookIds || []);
  const selectedSeriesIds = new Set(seriesIds || []);
  const excludedSet = new Set(excludedBookIds || []);
  const booksById = _stashBooksById();
  const childIdsByParentId = _stashChildIdsByParentId();
  for (const book of (getCachedBooks() || [])) {
    if (selectedSeriesIds.has(book.series_id) && !excludedSet.has(book.id)) implicitBookIds.add(book.id);
  }
  const pendingAnthologyIds = [...new Set([...selectedBookIds, ...implicitBookIds].filter(id => booksById.get(id)?.is_container))];
  const seenAnthologyIds = new Set();
  while (pendingAnthologyIds.length) {
    const anthologyId = pendingAnthologyIds.pop();
    if (seenAnthologyIds.has(anthologyId)) continue;
    seenAnthologyIds.add(anthologyId);
    for (const childId of (childIdsByParentId.get(anthologyId) || [])) {
      if (excludedSet.has(childId)) continue;
      if (!implicitBookIds.has(childId)) {
        implicitBookIds.add(childId);
        if (booksById.get(childId)?.is_container) pendingAnthologyIds.push(childId);
      }
    }
  }
  for (const id of selectedBookIds) implicitBookIds.delete(id);
  return implicitBookIds;
}

export function _effectiveStashPickerSelection(bookIds, seriesIds, excludedBookIds = []) {
  const selectedItems = new Set();
  const selectedBookIds = new Set(bookIds || []);
  const selectedSeriesIds = new Set(seriesIds || []);
  const booksById = _stashBooksById();
  const implicitBookIds = _collectImplicitStashBookIds(bookIds, seriesIds, excludedBookIds);
  for (const id of selectedSeriesIds) selectedItems.add(_stashItemKey('series', id));
  for (const id of new Set([...selectedBookIds, ...implicitBookIds])) {
    const book = booksById.get(id);
    selectedItems.add(_stashItemKey(book?.is_container ? 'anthology' : 'book', id));
  }
  return selectedItems;
}

export function _stashVisibleInheritedPickerBookIds(bookIds, seriesIds, excludedBookIds = []) {
  const booksById = _stashBooksById();
  return new Set(
    [..._collectImplicitStashBookIds(bookIds, seriesIds, excludedBookIds)]
      .filter(id => !booksById.get(id)?.parent_book_id)
  );
}

export function _isBookImplicitlyInStash(bookId, bookIds, seriesIds, excludedBookIds = []) {
  return _collectImplicitStashBookIds(bookIds, seriesIds, excludedBookIds).has(bookId);
}

export function _sortStashPickerItems(items, pinnedSet = null) {
  return [...items].sort((a, b) => {
    const aPinned = pinnedSet?.has(`${a.kind}:${a.id}`) || false;
    const bPinned = pinnedSet?.has(`${b.kind}:${b.id}`) || false;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return naturalCompare(a.name, b.name);
  });
}

export function _clearExcludedDescendants(excludedSet, bookIds, seriesIds) {
  const impliedIds = _collectImplicitStashBookIds(bookIds, seriesIds, []);
  for (const id of [...excludedSet]) if (impliedIds.has(id)) excludedSet.delete(id);
}

export function _pruneExcludedBooks(excludedSet, bookIds, seriesIds) {
  const eligibleIds = _collectImplicitStashBookIds(bookIds, seriesIds, []);
  for (const id of [...excludedSet]) if (!eligibleIds.has(id)) excludedSet.delete(id);
}
