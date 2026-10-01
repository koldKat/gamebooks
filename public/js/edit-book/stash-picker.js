import { editState } from './state.js';
import { t } from '../i18n.js';
import { foldForSearch, matchesSearch } from '../sort.js';
import { getCachedBooks, getCachedAllSeries, getCachedStashes } from '../books.js';
import { _sortedByName } from './selectors.js';
import { _stashAssignedBooksSet, _stashAssignedSeriesSet, _stashItemKey, _renderStashRows, _buildStashPickerItems, _effectiveStashPickerSelection, _stashVisibleInheritedPickerBookIds, _sortStashPickerItems } from './stash-helpers.js';

export function _renderStashEditPickerLists(stashId) {
  const itemsWrap = document.getElementById('est-items-list');
  const stash = (getCachedStashes() || []).find(s => s.id === stashId);
  if (!stash) return;
  const usedBooks = _stashAssignedBooksSet();
  const usedSeries = _stashAssignedSeriesSet();
  const originalBookIds = new Set(stash.bookIds || []);
  const originalSeriesIds = new Set(stash.seriesIds || []);
  const currentBookIds = new Set(editState._editingStashBookIds);
  const currentSeriesIds = new Set(editState._editingStashSeriesIds);
  const currentExcludedBookIds = new Set(editState._editingStashExcludedBookIds);
  const query = foldForSearch(document.getElementById('est-items-search')?.value.trim() || '');
  const seriesItems = _sortedByName((getCachedAllSeries() || []).filter(s =>
    (originalSeriesIds.has(s.id) || currentSeriesIds.has(s.id) || !usedSeries.has(s.id)) &&
    (!query || matchesSearch(s.name, query))
  ));
  const visibleInheritedBookIds = _stashVisibleInheritedPickerBookIds(currentBookIds, currentSeriesIds, currentExcludedBookIds);
  const bookItems = _sortedByName((getCachedBooks() || []).filter(b =>
    (originalBookIds.has(b.id) || currentBookIds.has(b.id) || currentExcludedBookIds.has(b.id) || !usedBooks.has(b.id)) &&
    (!b.parent_book_id || originalBookIds.has(b.id) || currentBookIds.has(b.id) || currentExcludedBookIds.has(b.id) || visibleInheritedBookIds.has(b.id)) &&
    (!query || matchesSearch(b.name, query))
  ));
  const pinnedItems = new Set([
    ...[...originalSeriesIds].map(id => _stashItemKey('series', id)),
    ...[...originalBookIds].map(id => {
      const book = (getCachedBooks() || []).find(b => b.id === id);
      return _stashItemKey(book?.is_container ? 'anthology' : 'book', id);
    }),
  ]);
  const selectedItems = _effectiveStashPickerSelection(currentBookIds, currentSeriesIds, currentExcludedBookIds);
  const combinedItems = _sortStashPickerItems(_buildStashPickerItems(seriesItems, bookItems, 'est'), pinnedItems);
  itemsWrap.innerHTML = combinedItems.length
    ? _renderStashRows(combinedItems, selectedItems)
    : `<div class="stash-pick-row"><span class="stash-pick-label">${t('editbook.no_items_available')}</span></div>`;
}

export function _renderStashPickerLists() {
  const itemsWrap = document.getElementById('cst-items-list');
  const usedBooks = _stashAssignedBooksSet();
  const usedSeries = _stashAssignedSeriesSet();
  const selectedBookIds = new Set(editState._creatingStashBookIds);
  const selectedSeriesIds = new Set(editState._creatingStashSeriesIds);
  const excludedBookIds = new Set(editState._creatingStashExcludedBookIds);
  const query = foldForSearch(document.getElementById('cst-items-search')?.value.trim() || '');
  const freeSeries = (getCachedAllSeries() || []).filter(s =>
    !usedSeries.has(s.id) && (!query || matchesSearch(s.name, query))
  );
  const visibleInheritedBookIds = _stashVisibleInheritedPickerBookIds(selectedBookIds, selectedSeriesIds, excludedBookIds);
  const freeBooks = (getCachedBooks() || []).filter(b =>
    !usedBooks.has(b.id) &&
    (!b.parent_book_id || selectedBookIds.has(b.id) || excludedBookIds.has(b.id) || visibleInheritedBookIds.has(b.id)) &&
    (!query || matchesSearch(b.name, query))
  );
  const selectedItems = _effectiveStashPickerSelection(selectedBookIds, selectedSeriesIds, excludedBookIds);
  const combinedItems = _sortStashPickerItems(_buildStashPickerItems(freeSeries, freeBooks, 'cst'));
  itemsWrap.innerHTML = combinedItems.length
    ? _renderStashRows(combinedItems, selectedItems)
    : `<div class="stash-pick-row"><span class="stash-pick-label">${t('editbook.no_unstashed_items')}</span></div>`;
}
