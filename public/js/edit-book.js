// edit-book.js - Edit/add book, anthology, series, and stash modals

import { state, getToken, isDemoMode, apiFetch, clearToken, clearUsername, isTerminal, parseSecId } from './state.js?v=11';
import { t } from './i18n.js?v=35';
import { naturalCompare, naturalCompareByName, foldForSearch, matchesSearch } from './sort.js?v=1';
import { getCachedBooks, getCachedAllSeries, getCachedStashes, _starLabelHtml, _refreshBooksListOnly, _refreshLibraryUi } from './books.js?v=125';
import { refreshCoinsDisplay } from './shop.js?v=49';
import { showAlert, showConfirm } from './play.js?v=76';
import { escapeHtml, compressImage } from './util.js?v=42';

let _hooks = {};
export function setEditBookHooks(h) { _hooks = h || {}; }

// ── Shared modal upload utilities ─────────────────────────────────────────────

const _PDF_ICON_MARKUP = `
  <span class="inline-svg-icon pdf-svg-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M7 2h7l5 5v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"></path>
      <path d="M14 2v6h6"></path>
      <path d="M8 17h2.1a1.9 1.9 0 0 0 0-3.8H8V17Z"></path>
      <path d="M12 13.2h1.5a1.9 1.9 0 1 1 0 3.8H12v-3.8Z"></path>
      <path d="M16.5 17v-3.8H19"></path>
      <path d="M16.5 15.1H18.6"></path>
    </svg>
  </span>
`;
const _PDF_MAX_BYTES = 256 * 1024 * 1024;


export function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const decimals = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}

export function _acceptPdfSelection(file, { inputId, labelId, errorId }) {
  if (!file) return false;
  const errEl = errorId ? document.getElementById(errorId) : null;
  if (errEl) errEl.textContent = '';
  if (file.size > _PDF_MAX_BYTES) {
    if (errEl) errEl.textContent = t('editbook.pdf_too_large', { size: formatFileSize(_PDF_MAX_BYTES) });
    const input = inputId ? document.getElementById(inputId) : null;
    if (input) input.value = '';
    const label = labelId ? document.getElementById(labelId) : null;
    if (label) label.textContent = '';
    return false;
  }
  return true;
}

export function _setPdfInlineLabel(el, text) {
  if (!el) return;
  el.innerHTML = `${_PDF_ICON_MARKUP}<span>${escapeHtml(text || '')}</span>`;
}

export function _setPdfCurrentLink(linkEl, sizeBytes = null) {
  if (!linkEl) return;
  const sizeText = formatFileSize(sizeBytes);
  _setPdfInlineLabel(linkEl, sizeText ? t('editbook.current_pdf_size', { size: sizeText }) : t('editbook.current_pdf'));
}

export function _setModalUploadProgress(prefix, pct = null) {
  const wrap = document.getElementById(`${prefix}-pdf-progress`);
  const bar  = document.getElementById(`${prefix}-pdf-progress-bar`);
  if (!wrap || !bar) return;
  if (pct == null) { wrap.style.display = 'none'; bar.style.width = '0%'; return; }
  wrap.style.display = 'block';
  bar.style.width = `${Math.max(0, Math.min(100, Number(pct) || 0))}%`;
}

export function _setButtonsDisabled(ids, disabled) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !!disabled;
  });
}

function _parseResponseJsonSafe(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export function _uploadPdfWithProgress(urlPath, file, prefix) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', urlPath, true);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', 'application/pdf');
    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return;
      _setModalUploadProgress(prefix, (e.loaded / e.total) * 100);
    };
    xhr.onerror = () => { _setModalUploadProgress(prefix, null); reject(new Error(t('editbook.network_error'))); };
    xhr.onload = () => {
      const status = xhr.status || 0;
      if (status === 503) {
        window.dispatchEvent(new Event('maintenance-mode'));
        _setModalUploadProgress(prefix, null);
        reject(new Error(t('editbook.maintenance')));
        return;
      }
      if (status === 401) {
        clearToken(); clearUsername();
        window.dispatchEvent(new Event('auth-expired'));
        _setModalUploadProgress(prefix, null);
        reject(new Error(t('editbook.unauthorized')));
        return;
      }
      const data = _parseResponseJsonSafe(xhr.responseText);
      if (status < 200 || status >= 300) {
        _setModalUploadProgress(prefix, null);
        reject(new Error(data?.error || t('editbook.pdf_upload_failed')));
        return;
      }
      _setModalUploadProgress(prefix, 100);
      setTimeout(() => _setModalUploadProgress(prefix, null), 250);
      resolve(data);
    };
    _setModalUploadProgress(prefix, 0);
    xhr.send(file);
  });
}

export function _adminPdfHref(pdfPath) {
  if (!pdfPath) return '';
  const token = getToken();
  return token ? `/books/${pdfPath}?token=${encodeURIComponent(token)}` : `/books/${pdfPath}`;
}

// ── Dropdown populators ───────────────────────────────────────────────────────

function _sortedByName(items) {
  return [...items].sort(naturalCompareByName);
}

export function _populateParentBookSelect(selectId, selectedId = null, excludeBookId = null) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = `<option value="">${t('editbook.none')}</option>`;
  const books = _sortedByName((getCachedBooks() || []).filter(b => b.is_container && b.id !== excludeBookId));
  const counts = new Map();
  books.forEach(book => counts.set(book.name, (counts.get(book.name) || 0) + 1));
  books.forEach(book => {
    const label = counts.get(book.name) > 1 ? `${book.name} (#${book.id})` : book.name;
    const opt = document.createElement('option');
    opt.value = String(book.id);
    opt.textContent = label;
    if (book.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

export function _populateSeriesSelect(selectId, selectedName) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = `<option value="">${t('editbook.none')}</option>`;
  // Demo mode has no real account/token, so this authenticated call always
  // 401s - apiFetch's 401 handler clears the (already-absent) token and
  // fires 'auth-expired', which shows the login screen behind whichever
  // modal called this (Create Book/Anthology/Series all populate this
  // select on open). The demo user never sees it happen since it's hidden
  // behind the modal, only noticing once they close it. Nothing useful to
  // fetch here anyway - the demo book isn't part of any real series.
  if (isDemoMode) return;
  apiFetch('/api/series').then(async r => {
    if (!r.ok) return;
    const list = (await r.json()).sort((a, b) => naturalCompare(a.name, b.name));
    const counts = new Map();
    list.forEach(series => counts.set(series.name, (counts.get(series.name) || 0) + 1));
    list.forEach(s => {
      const o = document.createElement('option');
      o.value = s.name;
      o.textContent = counts.get(s.name) > 1 ? `${s.name} (#${s.id})` : s.name;
      if (s.name === selectedName) o.selected = true;
      sel.appendChild(o);
    });
    if (selectedName && !list.find(s => s.name === selectedName)) {
      const o = document.createElement('option');
      o.value = selectedName;
      o.textContent = selectedName;
      o.selected = true;
      sel.appendChild(o);
    }
  }).catch(() => {});
}

// ── Validators ────────────────────────────────────────────────────────────────

export function validateIsbn(raw) {
  const s = raw.replace(/[\s\-]/g, '').toUpperCase();
  if (!s) return '';
  if (s.length === 10) {
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      const d = parseInt(s[i], 10);
      if (isNaN(d)) return null;
      sum += d * (10 - i);
    }
    const last = s[9] === 'X' ? 10 : parseInt(s[9], 10);
    if (isNaN(last)) return null;
    if ((sum + last) % 11 !== 0) return null;
    return s;
  }
  if (s.length === 13) {
    if (!/^\d{13}$/.test(s)) return null;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(s[i], 10) * (i % 2 === 0 ? 1 : 3);
    const check = (10 - (sum % 10)) % 10;
    if (parseInt(s[12], 10) !== check) return null;
    return s;
  }
  return null;
}

export function validateIssn(raw) {
  const s = raw.replace(/[\s\-]/g, '').toUpperCase();
  if (!s) return '';
  if (s.length !== 8) return null;
  if (!/^\d{7}[\dX]$/.test(s)) return null;
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += parseInt(s[i], 10) * (8 - i);
  const check = (11 - (sum % 11)) % 11;
  const lastChar = check === 10 ? 'X' : String(check);
  if (s[7] !== lastChar) return null;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function validateAsin(raw) {
  const s = raw.replace(/\s/g, '').toUpperCase();
  if (!s) return '';
  if (!/^[A-Z0-9]{10}$/.test(s)) return null;
  return s;
}

// ── Stash picker helpers ──────────────────────────────────────────────────────

let _creatingStashBookIds        = new Set();
let _creatingStashSeriesIds      = new Set();
let _creatingStashExcludedBookIds = new Set();

let _editingStashId              = null;
let _editingStashBookIds         = new Set();
let _editingStashSeriesIds       = new Set();
let _editingStashExcludedBookIds = new Set();

// A book counts as "assigned" not just when it's directly in a stash's own
// bookIds, but also when it's only covered implicitly because its series (or
// parent anthology) is in that stash - otherwise it'd still show up as a
// separately pickable, apparently-free row in every other stash's picker.
function _stashAssignedBooksSet() {
  const set = new Set();
  for (const stash of (getCachedStashes() || [])) {
    for (const id of (stash.bookIds || [])) set.add(id);
    for (const id of _collectImplicitStashBookIds(stash.bookIds, stash.seriesIds, stash.excludedBookIds)) set.add(id);
  }
  return set;
}

function _stashAssignedSeriesSet() {
  const set = new Set();
  for (const stash of (getCachedStashes() || [])) for (const id of (stash.seriesIds || [])) set.add(id);
  return set;
}

function _stashItemKey(itemOrKind, maybeId) {
  if (typeof itemOrKind === 'object' && itemOrKind) return `${itemOrKind.kind}:${itemOrKind.id}`;
  return `${itemOrKind}:${maybeId}`;
}

function _renderStashRows(items, selectedSet) {
  return items.map(item =>
    `<label class="stash-pick-row stash-pick-row--${item.kind}${selectedSet.has(_stashItemKey(item)) ? ' stash-pick-row--selected' : ''}">` +
      `<input type="checkbox" class="${item.cbClass}" value="${item.id}" ${selectedSet.has(_stashItemKey(item)) ? 'checked' : ''}>` +
      `<span class="stash-pick-label">${escapeHtml(item.name)}</span>` +
      `<span class="stash-pick-meta">${item.kind}</span>` +
    `</label>`
  ).join('');
}

function _buildStashPickerItems(seriesItems, bookItems, mode) {
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

function _stashBooksById() {
  return new Map((getCachedBooks() || []).map(b => [b.id, b]));
}

function _stashChildIdsByParentId() {
  const map = new Map();
  for (const book of (getCachedBooks() || [])) {
    if (!book.parent_book_id) continue;
    if (!map.has(book.parent_book_id)) map.set(book.parent_book_id, []);
    map.get(book.parent_book_id).push(book.id);
  }
  return map;
}

function _collectImplicitStashBookIds(bookIds, seriesIds, excludedBookIds = []) {
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

function _effectiveStashPickerSelection(bookIds, seriesIds, excludedBookIds = []) {
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

function _stashVisibleInheritedPickerBookIds(bookIds, seriesIds, excludedBookIds = []) {
  const booksById = _stashBooksById();
  return new Set(
    [..._collectImplicitStashBookIds(bookIds, seriesIds, excludedBookIds)]
      .filter(id => !booksById.get(id)?.parent_book_id)
  );
}

function _isBookImplicitlyInStash(bookId, bookIds, seriesIds, excludedBookIds = []) {
  return _collectImplicitStashBookIds(bookIds, seriesIds, excludedBookIds).has(bookId);
}

function _sortStashPickerItems(items, pinnedSet = null) {
  return [...items].sort((a, b) => {
    const aPinned = pinnedSet?.has(`${a.kind}:${a.id}`) || false;
    const bPinned = pinnedSet?.has(`${b.kind}:${b.id}`) || false;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return naturalCompare(a.name, b.name);
  });
}

function _clearExcludedDescendants(excludedSet, bookIds, seriesIds) {
  const impliedIds = _collectImplicitStashBookIds(bookIds, seriesIds, []);
  for (const id of [...excludedSet]) if (impliedIds.has(id)) excludedSet.delete(id);
}

function _pruneExcludedBooks(excludedSet, bookIds, seriesIds) {
  const eligibleIds = _collectImplicitStashBookIds(bookIds, seriesIds, []);
  for (const id of [...excludedSet]) if (!eligibleIds.has(id)) excludedSet.delete(id);
}

function _renderStashEditPickerLists(stashId) {
  const itemsWrap = document.getElementById('est-items-list');
  const stash = (getCachedStashes() || []).find(s => s.id === stashId);
  if (!stash) return;
  const usedBooks = _stashAssignedBooksSet();
  const usedSeries = _stashAssignedSeriesSet();
  const originalBookIds = new Set(stash.bookIds || []);
  const originalSeriesIds = new Set(stash.seriesIds || []);
  const currentBookIds = new Set(_editingStashBookIds);
  const currentSeriesIds = new Set(_editingStashSeriesIds);
  const currentExcludedBookIds = new Set(_editingStashExcludedBookIds);
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

function _renderStashPickerLists() {
  const itemsWrap = document.getElementById('cst-items-list');
  const usedBooks = _stashAssignedBooksSet();
  const usedSeries = _stashAssignedSeriesSet();
  const selectedBookIds = new Set(_creatingStashBookIds);
  const selectedSeriesIds = new Set(_creatingStashSeriesIds);
  const excludedBookIds = new Set(_creatingStashExcludedBookIds);
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

export function _openEditStash(stashId) {
  const stash = (getCachedStashes() || []).find(s => s.id === stashId);
  if (!stash) return;
  _editingStashId = stashId;
  _editingStashBookIds = new Set(stash.bookIds || []);
  _editingStashSeriesIds = new Set(stash.seriesIds || []);
  _editingStashExcludedBookIds = new Set(stash.excludedBookIds || []);
  document.getElementById('est-name').value = stash.name || '';
  document.getElementById('est-items-search').value = '';
  document.getElementById('est-error').textContent = '';
  _renderStashEditPickerLists(stashId);
  document.getElementById('edit-stash-overlay').classList.add('active');
  document.getElementById('est-items-search').focus();
}

export function _closeEditStash() {
  _editingStashId = null;
  _editingStashBookIds = new Set();
  _editingStashSeriesIds = new Set();
  _editingStashExcludedBookIds = new Set();
  document.getElementById('edit-stash-overlay').classList.remove('active');
}

function _openAddStash() {
  document.getElementById('cst-name').value = '';
  document.getElementById('cst-items-search').value = '';
  document.getElementById('cst-error').textContent = '';
  _creatingStashBookIds = new Set();
  _creatingStashSeriesIds = new Set();
  _creatingStashExcludedBookIds = new Set();
  _renderStashPickerLists();
  document.getElementById('add-stash-overlay').classList.add('active');
  document.getElementById('cst-name').focus();
}

export function _closeAddStash() {
  _creatingStashBookIds = new Set();
  _creatingStashSeriesIds = new Set();
  _creatingStashExcludedBookIds = new Set();
  document.getElementById('add-stash-overlay').classList.remove('active');
}

// ── Edit book modal ───────────────────────────────────────────────────────────

let _pendingCoverBlob = null;
let _pendingPdfFile   = null;
let _editBookId       = null;

let _editStarCurrentRating = null;
let _editStarAvgRating     = null;
let _editStarVoteCount     = 0;
let _editStarBookId        = null;
let _editStarInitialized   = false;
let _editStarUpdateFn      = null;

export function openEditBookModal({ bookId, initialName, initialSections, initialIsbn = '', initialIssn = '', initialAsin = '', initialCoverUrl = null, initialPdfPath = null, initialPdfSize = null, initialPages = '', initialAuthors = '', initialDescription = '', initialDiscoverableSections = null, showDiscoverableSections = false, discoverableHint = 0, minSections = 1, initialIsPublic = false, initialSeriesName = '', initialSeriesNumber = '', initialIsContainer = false, initialParentBookId = null, initialBookOrder = null, onSave }) {
  // Reachable from a book's public detail dialog (covers.js), which can now
  // stay open on top of the forum instead of closing it - but #edit-book-
  // modal-overlay's own z-index (2000) sits below the forum's (3000), so it
  // would render invisibly behind an open forum. Editing a book is a real
  // "leaving the quick-look" action, same reasoning as navigateToBook.
  document.getElementById('forum-modal-overlay')?.classList.remove('active');
  // The public modal itself stays open underneath (Cancel/Save should land
  // back on it) rather than being closed here, but if it was opened from the
  // forum its own z-index is temporarily bumped to 3001 to clear the forum -
  // now that the forum's closed, that override would otherwise still sit
  // above this modal's 2000. Reset it directly rather than through
  // closePublicModal(), which would also wipe the dialog's content/state.
  const pubOverlay = document.getElementById('public-modal-overlay');
  if (pubOverlay) pubOverlay.style.zIndex = '';
  _editBookId       = bookId;
  _pendingCoverBlob = null;
  _pendingPdfFile   = null;

  document.getElementById('edit-book-name-input').value          = initialName;
  document.getElementById('edit-book-sections-input').value      = initialSections;
  document.getElementById('edit-book-isbn-input').value          = initialIsbn || '';
  document.getElementById('edit-book-asin-input').value          = initialAsin || '';
  document.getElementById('edit-book-issn-input').value          = initialIssn || '';
  document.getElementById('edit-book-isbn-hint').textContent     = '';
  document.getElementById('edit-book-error').textContent         = '';
  document.getElementById('edit-book-authors-input').value       = initialAuthors || '';
  document.getElementById('edit-book-pages-input').value         = initialPages || '';
  document.getElementById('edit-book-description-input').value   = initialDescription || '';
  document.getElementById('edit-book-public-toggle').checked     = !!initialIsPublic;

  const discRow   = document.getElementById('edit-book-discoverable-row');
  const discInput = document.getElementById('edit-book-discoverable-input');
  discRow.style.display = showDiscoverableSections ? '' : 'none';
  discInput.value       = initialDiscoverableSections != null ? String(initialDiscoverableSections) : '';
  discInput.placeholder = showDiscoverableSections ? String(discoverableHint) : '';
  discInput.min         = String(discoverableHint);
  discInput.max         = String(initialSections);

  const pubType   = initialIssn ? 'magazine' : 'book';
  const pubTypeEl = document.getElementById('edit-book-pub-type');
  pubTypeEl.value = pubType;
  document.getElementById('edit-book-fields-book').style.display     = pubType === 'book'     ? '' : 'none';
  document.getElementById('edit-book-fields-magazine').style.display = pubType === 'magazine' ? '' : 'none';

  const coverImg = document.getElementById('edit-book-cover-img');
  const coverPh  = document.getElementById('edit-book-cover-placeholder');
  if (initialCoverUrl) {
    coverImg.src = initialCoverUrl; coverImg.style.display = 'block'; coverPh.style.display = 'none';
  } else {
    coverImg.src = ''; coverImg.style.display = 'none'; coverPh.style.display = 'block';
  }

  const isAdmin    = !!_hooks.resolveIsAdmin?.();
  const pdfRow     = document.getElementById('edit-book-pdf-row');
  const pdfCurrent = document.getElementById('edit-book-pdf-current');
  const pdfLink    = document.getElementById('edit-book-pdf-link');
  const pdfName    = document.getElementById('edit-book-pdf-name');
  document.getElementById('edit-book-pdf-file').value = '';
  pdfName.textContent = '';
  _setModalUploadProgress('edit-book', null);
  pdfRow.style.display = ((isAdmin || !!initialPdfPath) && !initialParentBookId) ? '' : 'none';
  if (initialPdfPath) {
    pdfLink.href = _adminPdfHref(initialPdfPath);
    _setPdfCurrentLink(pdfLink, initialPdfSize);
    pdfCurrent.style.display = '';
  } else {
    pdfCurrent.style.display = 'none';
  }

  document.getElementById('edit-book-series-number-input').value = initialSeriesNumber || '';
  if (!isDemoMode) _populateSeriesSelect('edit-book-series-select', initialSeriesName || null);

  const _parentInput = document.getElementById('edit-book-parent-input');
  _populateParentBookSelect('edit-book-parent-input', initialParentBookId, bookId);
  document.getElementById('edit-book-order-input').value = initialBookOrder != null ? String(initialBookOrder) : '';

  const _identifiersRow = document.getElementById('edit-book-identifiers-row');
  const _coverSection   = document.getElementById('edit-book-cover-section');
  const _pagesCol       = document.getElementById('edit-book-pages-col');
  const _authorsRow     = document.getElementById('edit-book-authors-row');
  const _discRow2       = document.getElementById('edit-book-discoverable-row');

  let _hasParent = !!initialParentBookId;
  function _syncChildUi() {
    const isChild = _hasParent;
    if (_discRow2)       _discRow2.style.display     = showDiscoverableSections ? '' : 'none';
    if (_coverSection)   _coverSection.style.display   = isChild ? 'none' : '';
    if (_identifiersRow) _identifiersRow.style.display = isChild ? 'none' : '';
    if (_pagesCol)       _pagesCol.style.display       = isChild ? 'none' : '';
    if (_authorsRow)     _authorsRow.style.display     = '';
    if (pdfRow)          pdfRow.style.display          = (isAdmin && !isChild) ? '' : 'none';
  }
  _syncChildUi();
  _parentInput.addEventListener('change', () => { _hasParent = !!_parentInput.value; _syncChildUi(); });

  document.getElementById('edit-book-modal-overlay').classList.add('active');
  document.getElementById('edit-book-name-input').focus();

  // Star rating widget
  const _esw = document.getElementById('edit-book-star-widget');
  _editStarBookId        = bookId;
  _editStarCurrentRating = null;
  _editStarAvgRating     = null;
  _editStarVoteCount     = 0;
  _esw.querySelectorAll('.star').forEach(s => s.className = 'star');
  _esw.querySelector('.star-label').textContent = '…';

  if (!_editStarInitialized) {
    _editStarInitialized = true;
    _editStarUpdateFn = (hoverVal) => {
      const displayVal = hoverVal !== null ? hoverVal : _editStarAvgRating;
      _esw.querySelectorAll('.star').forEach(s => {
        const p = +s.dataset.pos;
        s.className = (displayVal !== null && displayVal >= p) ? 'star on'
                    : (displayVal !== null && displayVal >= p - 0.5) ? 'star half'
                    : 'star';
      });
      const lbl = _esw.querySelector('.star-label');
      if (hoverVal !== null) {
        lbl.innerHTML = `<span class="star-avg">${hoverVal % 1 === 0 ? hoverVal.toFixed(1) : hoverVal}</span>`;
      } else {
        lbl.innerHTML = _starLabelHtml(_editStarAvgRating, _editStarVoteCount);
      }
    };
    _esw.querySelectorAll('.star').forEach(star => {
      star.addEventListener('mousemove', e => {
        const left = e.offsetX < star.offsetWidth / 2;
        _editStarUpdateFn(+star.dataset.pos - (left ? 0.5 : 0));
      });
      star.addEventListener('click', async e => {
        // Demo mode has no real account to attach a rating to - this
        // widget's whole point is rating books you don't own, which
        // doesn't apply to the fake demo book, and the PATCH below would
        // 401 and silently log the demo out like everywhere else on this
        // page (see the fetch below, and the Create-dialog guards).
        if (isDemoMode) return;
        const left      = e.offsetX < star.offsetWidth / 2;
        const newRating = +star.dataset.pos - (left ? 0.5 : 0);
        const toSave    = newRating === _editStarCurrentRating ? null : newRating;
        const prevRating = _editStarCurrentRating;
        _editStarCurrentRating = toSave;
        _esw.dataset.userRating = toSave ?? '';
        _editStarUpdateFn(null);
        try {
          const res = await apiFetch(`/api/books/${_editStarBookId}/rating`, {
            method: 'PATCH', body: JSON.stringify({ rating: toSave }),
          });
          if (res.ok) {
            const d = await res.json();
            _editStarAvgRating = d.avgRating;
            _editStarVoteCount = d.voteCount;
            _editStarUpdateFn(null);
            if (d.xpAwarded) refreshCoinsDisplay();
          } else {
            _editStarCurrentRating = prevRating;
            _esw.dataset.userRating = prevRating ?? '';
            _editStarUpdateFn(null);
          }
        } catch {
          _editStarCurrentRating = prevRating;
          _esw.dataset.userRating = prevRating ?? '';
          _editStarUpdateFn(null);
        }
      });
    });
    _esw.addEventListener('mouseleave', () => _editStarUpdateFn(null));
  }

  // Same isDemoMode reasoning as the star click handler above - this fetch
  // fires unconditionally every time the modal opens, so a demo book (fake
  // string id like "demo_1") would 401 the moment Edit is clicked on it.
  if (isDemoMode) {
    _editStarUpdateFn(null);
  } else {
    apiFetch(`/api/books/${bookId}/rating`).then(async r => {
      if (_editStarBookId !== bookId) return;
      if (r.ok) {
        const d = await r.json();
        _editStarCurrentRating = d.rating ?? null;
        _editStarAvgRating     = d.avgRating ?? null;
        _editStarVoteCount     = d.voteCount ?? 0;
        _esw.dataset.userRating = _editStarCurrentRating ?? '';
      }
      _editStarUpdateFn(null);
    }).catch(() => { if (_editStarBookId === bookId) _editStarUpdateFn(null); });
  }

  // Clone buttons to drop previous listeners
  ['edit-book-save', 'edit-book-cancel', 'edit-book-cover-btn'].forEach(id => {
    const el  = document.getElementById(id);
    const neo = el.cloneNode(true);
    el.parentNode.replaceChild(neo, el);
  });

  document.getElementById('edit-book-cancel').addEventListener('click', closeEditBookModal);
  document.getElementById('edit-book-close').addEventListener('click', closeEditBookModal);

  document.getElementById('edit-book-cover-btn').addEventListener('click', () => {
    document.getElementById('edit-book-cover-file').value = '';
    document.getElementById('edit-book-cover-file').click();
  });

  pubTypeEl.addEventListener('change', () => {
    const isMag = pubTypeEl.value === 'magazine';
    document.getElementById('edit-book-fields-book').style.display     = isMag ? 'none' : '';
    document.getElementById('edit-book-fields-magazine').style.display = isMag ? ''     : 'none';
    document.getElementById('edit-book-isbn-hint').textContent = '';
  });

  document.getElementById('edit-book-save').addEventListener('click', async () => {
    const name     = document.getElementById('edit-book-name-input').value.trim();
    const sections = parseInt(document.getElementById('edit-book-sections-input').value, 10);
    const errEl    = document.getElementById('edit-book-error');
    const idHint   = document.getElementById('edit-book-isbn-hint');
    errEl.textContent = ''; idHint.textContent = '';

    // Same reasoning as the Create-dialog guards - the demo's own fake book
    // (id like "demo_1") can reach this Edit modal too, and saving would
    // 401 against a real PATCH /api/books/:id call.
    if (isDemoMode) { errEl.textContent = t('addbook.demo_not_supported'); return; }
    if (!name) { errEl.textContent = t('err.name_empty'); return; }
    if (!(sections >= 1)) { errEl.textContent = t('err.sections_invalid'); return; }
    if (sections < minSections) { errEl.textContent = t('err.sections_min', { min: minSections }); return; }

    let isbn = '', issn = '', asin = '';
    if (document.getElementById('edit-book-pub-type').value === 'magazine') {
      issn = validateIssn(document.getElementById('edit-book-issn-input').value.trim());
      if (issn === null) { idHint.textContent = t('err.issn_invalid'); idHint.style.color = '#f87171'; return; }
    } else {
      isbn = validateIsbn(document.getElementById('edit-book-isbn-input').value.trim());
      if (isbn === null) { idHint.textContent = t('err.isbn_invalid'); idHint.style.color = '#f87171'; return; }
      asin = validateAsin(document.getElementById('edit-book-asin-input').value.trim());
      if (asin === null) { idHint.textContent = t('err.asin_invalid'); idHint.style.color = '#f87171'; return; }
    }

    if (_pendingCoverBlob && _editBookId) {
      try {
        const coverRes  = await apiFetch(`/api/books/${_editBookId}/cover`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body:    _pendingCoverBlob,
        });
        const coverData = await coverRes.json();
        if (coverData.coverUrl) _hooks.setCurrentBookCover?.(coverData.coverUrl);
        _hooks.scheduleRewardProfileRefresh?.();
      } catch (_) {
        errEl.textContent = t('editbook.cover_upload_failed');
        return;
      }
    }

    if (_pendingPdfFile && _editBookId) {
      _setButtonsDisabled(['edit-book-save', 'edit-book-cancel'], true);
      try {
        await _uploadPdfWithProgress(`/api/books/${_editBookId}/pdf`, _pendingPdfFile, 'edit-book');
        // A book's first-ever PDF awards XP server-side, but nothing else in
        // this flow would ever prompt the client to notice - the XP bar was
        // only catching up whenever some unrelated refresh (SSE badge event,
        // periodic poll) happened to fire next, which felt inconsistent/silent.
        _hooks.scheduleRewardProfileRefresh?.();
      } catch (e) {
        errEl.textContent = e?.message || t('editbook.pdf_upload_failed');
        _setButtonsDisabled(['edit-book-save', 'edit-book-cancel'], false);
        return;
      } finally {
        _setButtonsDisabled(['edit-book-save', 'edit-book-cancel'], false);
      }
    }

    const pages       = parseInt(document.getElementById('edit-book-pages-input').value, 10) || null;
    const authors     = document.getElementById('edit-book-authors-input').value.trim() || null;
    const description = document.getElementById('edit-book-description-input').value.trim() || null;

    let discoverableSections;
    if (showDiscoverableSections) {
      const raw = document.getElementById('edit-book-discoverable-input').value.trim();
      if (raw) {
        const val = parseInt(raw, 10);
        if (!val || val < discoverableHint || val > initialSections) {
          errEl.textContent = `Must be between ${discoverableHint} and ${initialSections}.`;
          return;
        }
        discoverableSections = val;
      } else {
        discoverableSections = null;
      }
    } else {
      discoverableSections = initialDiscoverableSections;
    }

    const isPublic     = document.getElementById('edit-book-public-toggle').checked;
    const seriesName   = document.getElementById('edit-book-series-select').value || null;
    const seriesNumber = document.getElementById('edit-book-series-number-input').value.trim() || null;
    const isContainer  = false;
    const parentId     = document.getElementById('edit-book-parent-input').value ? +document.getElementById('edit-book-parent-input').value : null;
    const bookOrder    = parseInt(document.getElementById('edit-book-order-input').value, 10) || null;
    onSave(name, sections, isbn, issn, asin, pages, authors, description, discoverableSections, isPublic, seriesName, seriesNumber, isContainer, parentId, bookOrder);
    closeEditBookModal();
  });

  document.getElementById('edit-book-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter')  document.getElementById('edit-book-sections-input').focus();
    if (e.key === 'Escape') closeEditBookModal();
  });
  document.getElementById('edit-book-sections-input').addEventListener('keydown', e => {
    if (e.key === 'Enter')  document.getElementById('edit-book-isbn-input').focus();
    if (e.key === 'Escape') closeEditBookModal();
  });
  document.getElementById('edit-book-isbn-input').addEventListener('keydown', e => {
    if (e.key === 'Enter')  document.getElementById('edit-book-save').click();
    if (e.key === 'Escape') closeEditBookModal();
  });
  document.getElementById('edit-book-asin-input').addEventListener('keydown', e => {
    if (e.key === 'Enter')  document.getElementById('edit-book-save').click();
    if (e.key === 'Escape') closeEditBookModal();
  });
  document.getElementById('edit-book-issn-input').addEventListener('keydown', e => {
    if (e.key === 'Enter')  document.getElementById('edit-book-save').click();
    if (e.key === 'Escape') closeEditBookModal();
  });
}

export function closeEditBookModal() {
  document.getElementById('edit-book-modal-overlay').classList.remove('active');
}

// ── Init: wire file inputs and stash modal event listeners ────────────────────

// ── Edit Anthology modal ──────────────────────────────────────────────────────

let _eccBookId = null, _eccCover = null, _eccPdf = null;

export function openEditCompModal({ bookId, initialName, initialIsbn = '', initialIssn = '', initialAsin = '', initialCoverUrl = null, initialPdfPath = null, initialPdfSize = null, initialPages = '', initialAuthors = '', initialDescription = '', initialSeriesName = '', initialSeriesNumber = '', initialIsPublic = false, onSave }) {
  _eccBookId = bookId; _eccCover = null; _eccPdf = null;
  document.getElementById('ecc-name').value        = initialName || '';
  document.getElementById('ecc-isbn').value        = initialIsbn || '';
  document.getElementById('ecc-asin').value        = initialAsin || '';
  document.getElementById('ecc-issn').value        = initialIssn || '';
  document.getElementById('ecc-pages').value       = initialPages || '';
  document.getElementById('ecc-authors').value     = initialAuthors || '';
  document.getElementById('ecc-description').value = initialDescription || '';
  document.getElementById('ecc-series-num').value  = initialSeriesNumber || '';
  document.getElementById('ecc-public').checked    = !!initialIsPublic;
  document.getElementById('ecc-error').textContent = '';
  document.getElementById('ecc-id-hint').textContent = '';
  document.getElementById('ecc-pdf-name').textContent = '';
  _setModalUploadProgress('ecc', null);
  document.getElementById('ecc-pdf-row').style.display = (_hooks.resolveIsAdmin?.() || !!initialPdfPath) ? '' : 'none';
  const pubType = initialIssn ? 'magazine' : 'book';
  document.getElementById('ecc-pub-type').value = pubType;
  document.getElementById('ecc-fields-book').style.display = pubType === 'book'     ? '' : 'none';
  document.getElementById('ecc-fields-mag').style.display  = pubType === 'magazine' ? '' : 'none';
  const img = document.getElementById('ecc-cover-img');
  const ph  = document.getElementById('ecc-cover-placeholder');
  if (initialCoverUrl) { img.src = initialCoverUrl; img.style.display = 'block'; ph.style.display = 'none'; }
  else { img.src = ''; img.style.display = 'none'; ph.style.display = 'block'; }
  if (initialPdfPath) {
    document.getElementById('ecc-pdf-link').href = _adminPdfHref(initialPdfPath);
    _setPdfCurrentLink(document.getElementById('ecc-pdf-link'), initialPdfSize);
    document.getElementById('ecc-pdf-current').style.display = '';
  } else {
    document.getElementById('ecc-pdf-current').style.display = 'none';
  }
  _populateSeriesSelect('ecc-series', initialSeriesName || null);

  // Clone save button to drop stale listeners
  const saveBtn = document.getElementById('ecc-save');
  const newSave = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSave, saveBtn);
  newSave.addEventListener('click', async () => {
    const name  = document.getElementById('ecc-name').value.trim();
    const errEl = document.getElementById('ecc-error');
    errEl.textContent = '';
    if (!name) { errEl.textContent = t('err.name_empty'); return; }
    let isbn = '', issn = '', asin = '';
    const idHint = document.getElementById('ecc-id-hint');
    if (document.getElementById('ecc-pub-type').value === 'magazine') {
      issn = validateIssn(document.getElementById('ecc-issn').value.trim());
      if (issn === null) { idHint.textContent = t('err.issn_invalid'); return; }
    } else {
      isbn = validateIsbn(document.getElementById('ecc-isbn').value.trim());
      if (isbn === null) { idHint.textContent = t('err.isbn_invalid'); return; }
      asin = validateAsin(document.getElementById('ecc-asin').value.trim());
      if (asin === null) { idHint.textContent = t('err.asin_invalid'); return; }
    }
    if (_eccCover && _eccBookId) {
      try {
        const r = await apiFetch(`/api/books/${_eccBookId}/cover`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: _eccCover });
        if (!r.ok) { errEl.textContent = t('editbook.cover_upload_failed'); return; }
        _hooks.scheduleRewardProfileRefresh?.();
      } catch (_) { errEl.textContent = t('editbook.cover_upload_failed'); return; }
    }
    if (_eccPdf && _eccBookId) {
      _setButtonsDisabled(['ecc-save', 'ecc-cancel'], true);
      try {
        await _uploadPdfWithProgress(`/api/books/${_eccBookId}/pdf`, _eccPdf, 'ecc');
        _hooks.scheduleRewardProfileRefresh?.();
      } catch (e) { errEl.textContent = e?.message || t('editbook.pdf_upload_failed'); return; }
      finally { _setButtonsDisabled(['ecc-save', 'ecc-cancel'], false); }
    }
    const pages       = parseInt(document.getElementById('ecc-pages').value, 10) || null;
    const authors     = document.getElementById('ecc-authors').value.trim() || null;
    const description = document.getElementById('ecc-description').value.trim() || null;
    const isPublic    = document.getElementById('ecc-public').checked;
    const seriesName  = document.getElementById('ecc-series').value || null;
    const seriesNum   = document.getElementById('ecc-series-num').value.trim() || null;
    onSave(name, isbn, issn, asin, pages, authors, description, isPublic, seriesName, seriesNum);
    document.getElementById('edit-comp-overlay').classList.remove('active');
  });

  document.getElementById('edit-comp-overlay').classList.add('active');
  document.getElementById('ecc-name').focus();
}

// ── Edit Series modal ─────────────────────────────────────────────────────────

let _esrSeriesId = null;

export function openEditSeriesModal(seriesId, name, description, isPublic = false, isOpenWorld = false) {
  _esrSeriesId = seriesId;
  document.getElementById('esr-name').value         = name || '';
  document.getElementById('esr-description').value  = description || '';
  document.getElementById('esr-public').checked     = !!isPublic;
  document.getElementById('esr-open-world').checked = !!isOpenWorld;
  document.getElementById('esr-error').textContent  = '';
  document.getElementById('edit-series-overlay').classList.add('active');
  document.getElementById('esr-name').focus();
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initEditBook(mousedownOnOverlayRef) {
  // Edit book file inputs
  document.getElementById('edit-book-cover-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    let blob;
    try { blob = await compressImage(file, 256 * 1024, 900); } catch { showAlert('Could not read that image - try a different file.'); return; }
    if (!blob) return;
    _pendingCoverBlob = blob;
    const coverImg = document.getElementById('edit-book-cover-img');
    const coverPh  = document.getElementById('edit-book-cover-placeholder');
    coverImg.src = URL.createObjectURL(blob); coverImg.style.display = 'block';
    coverPh.style.display = 'none';
  });

  document.getElementById('edit-book-pdf-btn').addEventListener('click', () => {
    document.getElementById('edit-book-pdf-file').value = '';
    document.getElementById('edit-book-pdf-file').click();
  });
  document.getElementById('edit-book-pdf-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!_acceptPdfSelection(file, { inputId: 'edit-book-pdf-file', labelId: 'edit-book-pdf-name', errorId: 'edit-book-error' })) {
      _pendingPdfFile = null;
      return;
    }
    _pendingPdfFile = file;
    _setPdfInlineLabel(document.getElementById('edit-book-pdf-name'), `${file.name} (${formatFileSize(file.size)})`);
  });
  document.getElementById('edit-book-pdf-remove').addEventListener('click', async () => {
    if (!_editBookId) return;
    await apiFetch(`/api/books/${_editBookId}/pdf`, { method: 'DELETE' }).catch(() => {});
    document.getElementById('edit-book-pdf-current').style.display = 'none';
    _pendingPdfFile = null;
    document.getElementById('edit-book-pdf-name').textContent = '';
  });

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
        _creatingStashSeriesIds.add(id);
        _clearExcludedDescendants(_creatingStashExcludedBookIds, _creatingStashBookIds, _creatingStashSeriesIds);
      } else {
        _creatingStashSeriesIds.delete(id);
        _pruneExcludedBooks(_creatingStashExcludedBookIds, _creatingStashBookIds, _creatingStashSeriesIds);
      }
      _renderStashPickerLists();
      return;
    }
    if (cb.classList.contains('cst-book-cb')) {
      const inheritedWithoutSelfExcluded = _isBookImplicitlyInStash(id, _creatingStashBookIds, _creatingStashSeriesIds, [..._creatingStashExcludedBookIds].filter(x => x !== id));
      const wasImplicit = _isBookImplicitlyInStash(id, _creatingStashBookIds, _creatingStashSeriesIds, _creatingStashExcludedBookIds);
      if (cb.checked) {
        if (inheritedWithoutSelfExcluded) _creatingStashExcludedBookIds.delete(id);
        else _creatingStashBookIds.add(id);
        if ((getCachedBooks() || []).find(b => b.id === id)?.is_container) {
          _clearExcludedDescendants(_creatingStashExcludedBookIds, _creatingStashBookIds, _creatingStashSeriesIds);
        }
      } else {
        _creatingStashBookIds.delete(id);
        if (wasImplicit) _creatingStashExcludedBookIds.add(id);
        else _pruneExcludedBooks(_creatingStashExcludedBookIds, _creatingStashBookIds, _creatingStashSeriesIds);
      }
      _renderStashPickerLists();
    }
  });
  document.getElementById('cst-save').addEventListener('click', async () => {
    const errEl = document.getElementById('cst-error');
    errEl.textContent = '';
    const name = document.getElementById('cst-name').value.trim();
    const bookIds = [..._creatingStashBookIds];
    const seriesIds = [..._creatingStashSeriesIds];
    const excludedBookIds = [..._creatingStashExcludedBookIds];
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
    if (_editingStashId) _renderStashEditPickerLists(_editingStashId);
  });
  document.getElementById('est-items-list').addEventListener('change', e => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    const id = +cb.value;
    if (cb.classList.contains('est-series-cb')) {
      if (cb.checked) {
        _editingStashSeriesIds.add(id);
        _clearExcludedDescendants(_editingStashExcludedBookIds, _editingStashBookIds, _editingStashSeriesIds);
      } else {
        _editingStashSeriesIds.delete(id);
        _pruneExcludedBooks(_editingStashExcludedBookIds, _editingStashBookIds, _editingStashSeriesIds);
      }
      if (_editingStashId) _renderStashEditPickerLists(_editingStashId);
      return;
    }
    if (cb.classList.contains('est-book-cb')) {
      const inheritedWithoutSelfExcluded = _isBookImplicitlyInStash(id, _editingStashBookIds, _editingStashSeriesIds, [..._editingStashExcludedBookIds].filter(x => x !== id));
      const wasImplicit = _isBookImplicitlyInStash(id, _editingStashBookIds, _editingStashSeriesIds, _editingStashExcludedBookIds);
      if (cb.checked) {
        if (inheritedWithoutSelfExcluded) _editingStashExcludedBookIds.delete(id);
        else _editingStashBookIds.add(id);
        if ((getCachedBooks() || []).find(b => b.id === id)?.is_container) {
          _clearExcludedDescendants(_editingStashExcludedBookIds, _editingStashBookIds, _editingStashSeriesIds);
        }
      } else {
        _editingStashBookIds.delete(id);
        if (wasImplicit) _editingStashExcludedBookIds.add(id);
        else _pruneExcludedBooks(_editingStashExcludedBookIds, _editingStashBookIds, _editingStashSeriesIds);
      }
      if (_editingStashId) _renderStashEditPickerLists(_editingStashId);
    }
  });
  document.getElementById('est-save').addEventListener('click', async () => {
    const errEl = document.getElementById('est-error');
    errEl.textContent = '';
    if (!_editingStashId) return;
    const name = document.getElementById('est-name').value.trim();
    const bookIds = [..._editingStashBookIds];
    const seriesIds = [..._editingStashSeriesIds];
    const excludedBookIds = [..._editingStashExcludedBookIds];
    if (!name) { errEl.textContent = t('editbook.name_required'); return; }
    try {
      const res = await apiFetch(`/api/stashes/${_editingStashId}`, { method: 'POST', body: JSON.stringify({ name, book_ids: bookIds, series_ids: seriesIds, excluded_book_ids: excludedBookIds }) });
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

  // ── Edit Anthology modal events ───────────────────────────────────────────
  const _closeEcc = () => document.getElementById('edit-comp-overlay').classList.remove('active');
  document.getElementById('ecc-cancel').addEventListener('click', _closeEcc);
  document.getElementById('ecc-close').addEventListener('click', _closeEcc);
  document.getElementById('edit-comp-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && mousedownOnOverlayRef() === e.currentTarget) _closeEcc();
  });
  document.getElementById('ecc-pub-type').addEventListener('change', e => {
    const v = e.target.value;
    document.getElementById('ecc-fields-book').style.display = v === 'book'     ? '' : 'none';
    document.getElementById('ecc-fields-mag').style.display  = v === 'magazine' ? '' : 'none';
  });
  document.getElementById('ecc-cover-btn').addEventListener('click', () => {
    document.getElementById('ecc-cover-file').value = '';
    document.getElementById('ecc-cover-file').click();
  });
  document.getElementById('ecc-cover-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    let blob;
    try { blob = await compressImage(file, 256 * 1024, 900); } catch { showAlert('Could not read that image - try a different file.'); return; }
    if (!blob) return;
    _eccCover = blob;
    const img = document.getElementById('ecc-cover-img');
    const ph  = document.getElementById('ecc-cover-placeholder');
    img.src = URL.createObjectURL(blob); img.style.display = 'block'; ph.style.display = 'none';
  });
  document.getElementById('ecc-pdf-btn').addEventListener('click', () => {
    document.getElementById('ecc-pdf-file').value = '';
    document.getElementById('ecc-pdf-file').click();
  });
  document.getElementById('ecc-pdf-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!_acceptPdfSelection(file, { inputId: 'ecc-pdf-file', labelId: 'ecc-pdf-name', errorId: 'ecc-error' })) {
      _eccPdf = null; return;
    }
    _eccPdf = file;
    _setPdfInlineLabel(document.getElementById('ecc-pdf-name'), `${file.name} (${formatFileSize(file.size)})`);
  });
  document.getElementById('ecc-pdf-remove').addEventListener('click', () => {
    if (!_eccBookId) return;
    showConfirm(t('editbook.remove_pdf_confirm'), async () => {
      try {
        const r = await apiFetch(`/api/books/${_eccBookId}/pdf`, { method: 'DELETE' });
        if (!r.ok) return;
        _eccPdf = null;
        _setPdfCurrentLink(document.getElementById('ecc-pdf-link'), null);
        document.getElementById('ecc-pdf-current').style.display = 'none';
      } catch (_) {}
    });
  });

  // ── Edit Series modal events ──────────────────────────────────────────────
  const _closeEsr = () => document.getElementById('edit-series-overlay').classList.remove('active');
  document.getElementById('esr-cancel').addEventListener('click', _closeEsr);
  document.getElementById('esr-close').addEventListener('click', _closeEsr);
  document.getElementById('edit-series-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && mousedownOnOverlayRef() === e.currentTarget) _closeEsr();
  });
  document.getElementById('esr-save').addEventListener('click', async () => {
    const name        = document.getElementById('esr-name').value.trim();
    const description = document.getElementById('esr-description').value.trim() || null;
    const isPublic    = document.getElementById('esr-public').checked;
    const isOpenWorld = document.getElementById('esr-open-world').checked;
    const errEl       = document.getElementById('esr-error');
    errEl.textContent = '';
    if (!name) { errEl.textContent = t('err.name_empty'); return; }
    try {
      const r = await apiFetch(`/api/series/${_esrSeriesId}`, { method: 'PATCH', body: JSON.stringify({ name, description, is_public: isPublic, is_open_world: isOpenWorld }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); errEl.textContent = j.error || t('editbook.failed'); return; }
      _closeEsr();
      await _refreshLibraryUi({ feed: true });
    } catch (_) { errEl.textContent = t('editbook.failed'); }
  });
}

// ── Graph-analysis helpers (used by edit-book modal and books.js hooks) ───────

export function maxSectionInUse(s = state) {
  let max = 1;
  const bump = n => { if (typeof n === 'number' && !isTerminal(n) && n > max) max = n; };
  Object.keys(s.graph || {}).forEach(k => bump(parseSecId(k)));
  Object.values(s.graph || {}).forEach(d => (d.choices || []).forEach(bump));
  (s.playthroughs || []).forEach(pt => (pt.path || []).forEach(bump));
  return max;
}

