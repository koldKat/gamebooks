import { editState } from './state.js';
import { apiFetch } from '../state.js';
import { t } from '../i18n.js';
import { getCachedBooks, _refreshBooksListOnly } from '../books.js';
import { _isBookImplicitlyInStash, _clearExcludedDescendants, _pruneExcludedBooks } from './stash-helpers.js';
import { _renderStashEditPickerLists, _renderStashPickerLists } from './stash-picker.js';
import { _closeEditStash, _openAddStash, _closeAddStash } from './stash-dialogs.js';

export function initStashBindings(mousedownOnOverlayRef) {
  // Create stash modal
  document.getElementById('cst-cancel').addEventListener('click', _closeAddStash);
  document.getElementById('cst-close').addEventListener('click', _closeAddStash);
  document.getElementById('add-stash-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && mousedownOnOverlayRef() === e.currentTarget) _closeAddStash();
  });
  document.getElementById('cst-items-search').addEventListener('input', _renderStashPickerLists);
  document.getElementById('cst-items-list').addEventListener('change', e => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    const id = +cb.value;
    if (cb.classList.contains('cst-series-cb')) {
      if (cb.checked) {
        editState._creatingStashSeriesIds.add(id);
        _clearExcludedDescendants(editState._creatingStashExcludedBookIds, editState._creatingStashBookIds, editState._creatingStashSeriesIds);
      } else {
        editState._creatingStashSeriesIds.delete(id);
        _pruneExcludedBooks(editState._creatingStashExcludedBookIds, editState._creatingStashBookIds, editState._creatingStashSeriesIds);
      }
      _renderStashPickerLists();
      return;
    }
    if (cb.classList.contains('cst-book-cb')) {
      const inheritedWithoutSelfExcluded = _isBookImplicitlyInStash(id, editState._creatingStashBookIds, editState._creatingStashSeriesIds, [...editState._creatingStashExcludedBookIds].filter(x => x !== id));
      const wasImplicit = _isBookImplicitlyInStash(id, editState._creatingStashBookIds, editState._creatingStashSeriesIds, editState._creatingStashExcludedBookIds);
      if (cb.checked) {
        if (inheritedWithoutSelfExcluded) editState._creatingStashExcludedBookIds.delete(id);
        else editState._creatingStashBookIds.add(id);
        if ((getCachedBooks() || []).find(b => b.id === id)?.is_container) {
          _clearExcludedDescendants(editState._creatingStashExcludedBookIds, editState._creatingStashBookIds, editState._creatingStashSeriesIds);
        }
      } else {
        editState._creatingStashBookIds.delete(id);
        if (wasImplicit) editState._creatingStashExcludedBookIds.add(id);
        else _pruneExcludedBooks(editState._creatingStashExcludedBookIds, editState._creatingStashBookIds, editState._creatingStashSeriesIds);
      }
      _renderStashPickerLists();
    }
  });
  document.getElementById('cst-save').addEventListener('click', async () => {
    const errEl = document.getElementById('cst-error');
    errEl.textContent = '';
    const name = document.getElementById('cst-name').value.trim();
    const bookIds = [...editState._creatingStashBookIds];
    const seriesIds = [...editState._creatingStashSeriesIds];
    const excludedBookIds = [...editState._creatingStashExcludedBookIds];
    if (!name) { errEl.textContent = t('editbook.name_required'); return; }
    try {
      const res = await apiFetch('/api/stashes', { method: 'POST', body: JSON.stringify({ name, book_ids: bookIds, series_ids: seriesIds, excluded_book_ids: excludedBookIds }) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        errEl.textContent = j.error || t('editbook.failed');
        return;
      }
      _closeAddStash();
      await _refreshBooksListOnly();
    } catch (_) {
      errEl.textContent = t('editbook.failed');
    }
  });
  document.getElementById('open-add-stash-btn').addEventListener('click', _openAddStash);

  // Edit stash modal
  document.getElementById('est-cancel').addEventListener('click', _closeEditStash);
  document.getElementById('est-close').addEventListener('click', _closeEditStash);
  document.getElementById('edit-stash-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && mousedownOnOverlayRef() === e.currentTarget) _closeEditStash();
  });
  document.getElementById('est-items-search').addEventListener('input', () => {
    if (editState._editingStashId) _renderStashEditPickerLists(editState._editingStashId);
  });
  document.getElementById('est-items-list').addEventListener('change', e => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    const id = +cb.value;
    if (cb.classList.contains('est-series-cb')) {
      if (cb.checked) {
        editState._editingStashSeriesIds.add(id);
        _clearExcludedDescendants(editState._editingStashExcludedBookIds, editState._editingStashBookIds, editState._editingStashSeriesIds);
      } else {
        editState._editingStashSeriesIds.delete(id);
        _pruneExcludedBooks(editState._editingStashExcludedBookIds, editState._editingStashBookIds, editState._editingStashSeriesIds);
      }
      if (editState._editingStashId) _renderStashEditPickerLists(editState._editingStashId);
      return;
    }
    if (cb.classList.contains('est-book-cb')) {
      const inheritedWithoutSelfExcluded = _isBookImplicitlyInStash(id, editState._editingStashBookIds, editState._editingStashSeriesIds, [...editState._editingStashExcludedBookIds].filter(x => x !== id));
      const wasImplicit = _isBookImplicitlyInStash(id, editState._editingStashBookIds, editState._editingStashSeriesIds, editState._editingStashExcludedBookIds);
      if (cb.checked) {
        if (inheritedWithoutSelfExcluded) editState._editingStashExcludedBookIds.delete(id);
        else editState._editingStashBookIds.add(id);
        if ((getCachedBooks() || []).find(b => b.id === id)?.is_container) {
          _clearExcludedDescendants(editState._editingStashExcludedBookIds, editState._editingStashBookIds, editState._editingStashSeriesIds);
        }
      } else {
        editState._editingStashBookIds.delete(id);
        if (wasImplicit) editState._editingStashExcludedBookIds.add(id);
        else _pruneExcludedBooks(editState._editingStashExcludedBookIds, editState._editingStashBookIds, editState._editingStashSeriesIds);
      }
      if (editState._editingStashId) _renderStashEditPickerLists(editState._editingStashId);
    }
  });
  document.getElementById('est-save').addEventListener('click', async () => {
    const errEl = document.getElementById('est-error');
    errEl.textContent = '';
    if (!editState._editingStashId) return;
    const name = document.getElementById('est-name').value.trim();
    const bookIds = [...editState._editingStashBookIds];
    const seriesIds = [...editState._editingStashSeriesIds];
    const excludedBookIds = [...editState._editingStashExcludedBookIds];
    if (!name) { errEl.textContent = t('editbook.name_required'); return; }
    try {
      const res = await apiFetch(`/api/stashes/${editState._editingStashId}`, { method: 'POST', body: JSON.stringify({ name, book_ids: bookIds, series_ids: seriesIds, excluded_book_ids: excludedBookIds }) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        errEl.textContent = j.error || t('editbook.failed');
        return;
      }
      _closeEditStash();
      await _refreshBooksListOnly();
    } catch (_) {
      errEl.textContent = t('editbook.failed');
    }
  });


}
