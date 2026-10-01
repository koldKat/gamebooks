import { editState } from './state.js';
import { getCachedStashes } from '../books.js';
import { _renderStashEditPickerLists, _renderStashPickerLists } from './stash-picker.js';

export function _openEditStash(stashId) {
  const stash = (getCachedStashes() || []).find(s => s.id === stashId);
  if (!stash) return;
  editState._editingStashId = stashId;
  editState._editingStashBookIds = new Set(stash.bookIds || []);
  editState._editingStashSeriesIds = new Set(stash.seriesIds || []);
  editState._editingStashExcludedBookIds = new Set(stash.excludedBookIds || []);
  document.getElementById('est-name').value = stash.name || '';
  document.getElementById('est-items-search').value = '';
  document.getElementById('est-error').textContent = '';
  _renderStashEditPickerLists(stashId);
  document.getElementById('edit-stash-overlay').classList.add('active');
  document.getElementById('est-items-search').focus();
}

export function _closeEditStash() {
  editState._editingStashId = null;
  editState._editingStashBookIds = new Set();
  editState._editingStashSeriesIds = new Set();
  editState._editingStashExcludedBookIds = new Set();
  document.getElementById('edit-stash-overlay').classList.remove('active');
}

export function _openAddStash() {
  document.getElementById('cst-name').value = '';
  document.getElementById('cst-items-search').value = '';
  document.getElementById('cst-error').textContent = '';
  editState._creatingStashBookIds = new Set();
  editState._creatingStashSeriesIds = new Set();
  editState._creatingStashExcludedBookIds = new Set();
  _renderStashPickerLists();
  document.getElementById('add-stash-overlay').classList.add('active');
  document.getElementById('cst-name').focus();
}

export function _closeAddStash() {
  editState._creatingStashBookIds = new Set();
  editState._creatingStashSeriesIds = new Set();
  editState._creatingStashExcludedBookIds = new Set();
  document.getElementById('add-stash-overlay').classList.remove('active');
}
