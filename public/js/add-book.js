// add-book.js - Add Book, Add Anthology, and Add Series modals

import { apiFetch, isDemoMode } from './state.js?v=12';
import { t } from './i18n.js?v=36';
import { getCachedAllSeries, _refreshLibraryUi, setInvalidateAutocompleteCaches } from './books.js?v=128';
import { naturalCompare, matchesSearch } from './sort.js?v=1';
import { showAlert } from './play.js?v=79';
import {
  _setModalUploadProgress, _setButtonsDisabled, _uploadPdfWithProgress,
  _acceptPdfSelection, _setPdfInlineLabel, formatFileSize,
  _populateSeriesSelect, _populateParentBookSelect,
  validateIsbn, validateIssn, validateAsin,
} from './edit-book.js?v=139';
import {
  invalidateAutocompleteCaches, _loadAutocompleteBooks, _loadSeriesAutocomplete,
  _setModalCover, _setupNameAutocomplete, _setupPlainAutocomplete, _setupAuthorsAutocomplete,
} from './autocomplete.js?v=119';
import { escapeHtml, compressImage } from './util.js?v=44';

let _hooks = {};
export function setAddBookHooks(h) { _hooks = h || {}; }

// ── Add Book modal ────────────────────────────────────────────────────────────

let _cbAc   = null;
let _cbCover = null, _cbPdf = null;

function _syncCbUi() {
  const hasParent = !!document.getElementById('cb-parent').value;
  document.getElementById('cb-cover-section').style.display   = hasParent ? 'none' : '';
  document.getElementById('cb-identifiers-row').style.display = hasParent ? 'none' : '';
  document.getElementById('cb-pages-col').style.display       = hasParent ? 'none' : '';
  document.getElementById('cb-authors-row').style.display     = '';
  document.getElementById('cb-pdf-row').style.display         = (_hooks.resolveIsAdmin?.() && !hasParent) ? '' : 'none';
}

export function openAddBook() {
  _cbCover = null; _cbPdf = null;
  ['cb-name','cb-sections','cb-pages','cb-isbn','cb-asin','cb-issn','cb-authors','cb-series','cb-series-num','cb-order'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('cb-description').value = '';
  document.getElementById('cb-public').checked = true;
  document.getElementById('cb-error').textContent = '';
  document.getElementById('cb-pub-type').value = 'book';
  document.getElementById('cb-fields-book').style.display = '';
  document.getElementById('cb-fields-mag').style.display = 'none';
  document.getElementById('cb-id-hint').textContent = '';
  document.getElementById('cb-pdf-name').textContent = '';
  _setModalUploadProgress('cb', null);
  document.getElementById('cb-pdf-row').style.display = _hooks.resolveIsAdmin?.() ? '' : 'none';
  const img = document.getElementById('cb-cover-img'); img.src = ''; img.style.display = 'none';
  document.getElementById('cb-cover-placeholder').style.display = 'block';
  _populateParentBookSelect('cb-parent');
  _syncCbUi();
  _populateSeriesSelect('cb-series', null);
  _cbAc.reset();
  invalidateAutocompleteCaches();
  _loadAutocompleteBooks();
  document.getElementById('add-book-overlay').classList.add('active');
  document.getElementById('cb-name').focus();
}

export function _closeAddBook() {
  _cbAc.reset();
  document.getElementById('add-book-overlay').classList.remove('active');
}

// ── Add Anthology modal ───────────────────────────────────────────────────────

let _ccAc   = null;
let _ccCover = null, _ccPdf = null;

export function openAddComp() {
  _ccCover = null; _ccPdf = null;
  ['cc-name','cc-isbn','cc-asin','cc-issn','cc-pages','cc-authors','cc-series','cc-series-num'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('cc-description').value = '';
  document.getElementById('cc-public').checked = true;
  document.getElementById('cc-error').textContent = '';
  document.getElementById('cc-pub-type').value = 'book';
  document.getElementById('cc-fields-book').style.display = '';
  document.getElementById('cc-fields-mag').style.display = 'none';
  document.getElementById('cc-id-hint').textContent = '';
  document.getElementById('cc-pdf-name').textContent = '';
  _setModalUploadProgress('cc', null);
  document.getElementById('cc-pdf-row').style.display = _hooks.resolveIsAdmin?.() ? '' : 'none';
  const img = document.getElementById('cc-cover-img'); img.src = ''; img.style.display = 'none';
  document.getElementById('cc-cover-placeholder').style.display = 'block';
  _populateSeriesSelect('cc-series', null);
  _ccAc.reset();
  invalidateAutocompleteCaches();
  _loadAutocompleteBooks();
  document.getElementById('add-comp-overlay').classList.add('active');
  document.getElementById('cc-name').focus();
}

export function _closeAddComp() {
  _ccAc.reset();
  document.getElementById('add-comp-overlay').classList.remove('active');
}

// ── Add Series modal ──────────────────────────────────────────────────────────

let _csrAllSeries    = [];
let _csrSelectedId   = null;
let _csrSelectedOwned = false;
let _csrActiveIdx    = -1;
let _csrInput, _csrDropdown, _csrSaveBtn;

function _csrSetExisting(series, { preserveDescription = false } = {}) {
  _csrSelectedId    = series ? series.id : null;
  _csrSelectedOwned = !!(series && (getCachedAllSeries() || []).some(s => s.id === series.id));
  if (!preserveDescription) document.getElementById('csr-description').value = series?.description || '';
  document.getElementById('csr-description').disabled = !!series;
  _csrSaveBtn.textContent = series ? (_csrSelectedOwned ? t('addbook.already_owned') : t('addbook.add_to_library')) : t('addbook.create');
  _csrSaveBtn.disabled    = !!_csrSelectedOwned;
}

function _csrRenderDropdown(q) {
  const matches = q
    ? [..._csrAllSeries].filter(s => matchesSearch(s.name, q)).sort((a, b) => naturalCompare(a.name, b.name))
    : [];
  if (!matches.length) { _csrDropdown.classList.remove('open'); return; }
  _csrDropdown.innerHTML = matches.map((s, i) =>
    `<li data-idx="${i}" data-name="${escapeHtml(s.name)}" data-id="${s.id}">` +
      escapeHtml(s.name) +
      ((getCachedAllSeries() || []).some(cs => cs.id === s.id) ? `<span class="ac-sub ac-owned">${t('addbook.owned')}</span>` : '') +
      (s.created_by_username ? `<span class="ac-sub">${t('addbook.by_creator', { name: escapeHtml(s.created_by_username) })}</span>` : '') +
    `</li>`
  ).join('');
  _csrActiveIdx = -1;
  _csrDropdown.classList.add('open');
}

function _csrSelectItem(li) {
  const series = _csrAllSeries.find(s => s.id === +li.dataset.id);
  _csrInput.value = li.dataset.name;
  _csrDropdown.classList.remove('open');
  if (series) _csrSetExisting(series);
}

export function openAddSeries() {
  _csrInput.value = '';
  document.getElementById('csr-description').value = '';
  document.getElementById('csr-description').disabled = false;
  document.getElementById('csr-public').checked = true;
  document.getElementById('csr-error').textContent = '';
  _csrSelectedId = null;
  _csrSelectedOwned = false;
  _csrSaveBtn.textContent = t('addbook.create');
  _csrSaveBtn.disabled = false;
  _csrDropdown.classList.remove('open');
  document.getElementById('add-series-overlay').classList.add('active');
  _csrInput.focus();
  // Demo mode has no real account/token - this authenticated call would
  // 401, and apiFetch's 401 handler clears the (already-absent) token and
  // shows the login screen behind this modal (see the matching guard in
  // _populateSeriesSelect, edit-book.js, for the full explanation).
  if (isDemoMode) return;
  apiFetch('/api/series/autocomplete').then(r => r.json()).then(list => {
    _csrAllSeries = [...list].sort((a, b) => naturalCompare(a.name, b.name));
    if (_csrInput.value.trim()) _csrRenderDropdown(_csrInput.value.trim());
  }).catch(() => {});
}

export function _closeAddSeries() {
  _csrDropdown.classList.remove('open');
  document.getElementById('add-series-overlay').classList.remove('active');
}

// ── Init: wire all event listeners ───────────────────────────────────────────

export function initAddBook(mousedownOnOverlayRef) {
  setInvalidateAutocompleteCaches(invalidateAutocompleteCaches);

  // Autocomplete instances
  _cbAc = _setupNameAutocomplete('cb-name', 'cb-name-dropdown', 'cb-save',
    b => !b.isContainer,
    b => {
      document.getElementById('cb-sections').value    = b.totalSections || '';
      document.getElementById('cb-pages').value       = b.pages || '';
      document.getElementById('cb-authors').value     = b.authors || '';
      document.getElementById('cb-description').value = b.description || '';
      document.getElementById('cb-isbn').value        = b.isbn || '';
      document.getElementById('cb-asin').value        = b.asin || '';
      const seriesSel = document.getElementById('cb-series');
      if (seriesSel) {
        const opt = Array.from(seriesSel.options).find(o => o.textContent.startsWith(b.seriesName || '\x00'));
        if (opt) seriesSel.value = opt.value;
      }
      document.getElementById('cb-series-num').value = b.seriesNumber || '';
      _setModalCover('cb-cover-img', 'cb-cover-placeholder', b.coverUrl);
    }
  );

  _ccAc = _setupNameAutocomplete('cc-name', 'cc-name-dropdown', 'cc-save',
    b => b.isContainer,
    b => {
      document.getElementById('cc-pages').value       = b.pages || '';
      document.getElementById('cc-authors').value     = b.authors || '';
      document.getElementById('cc-description').value = b.description || '';
      document.getElementById('cc-isbn').value        = b.isbn || '';
      document.getElementById('cc-asin').value        = b.asin || '';
      _setModalCover('cc-cover-img', 'cc-cover-placeholder', b.coverUrl);
    }
  );

  _setupPlainAutocomplete('edit-book-name-input', 'edit-book-name-dropdown', _loadAutocompleteBooks,
    (b, q) => !b.isContainer && matchesSearch(b.name, q),
    b => b.authors ? `<span class="ac-sub">${escapeHtml(b.authors)}</span>` : ''
  );
  _setupPlainAutocomplete('ecc-name', 'ecc-name-dropdown', _loadAutocompleteBooks,
    (b, q) => !!b.isContainer && matchesSearch(b.name, q),
    b => b.authors ? `<span class="ac-sub">${escapeHtml(b.authors)}</span>` : ''
  );
  _setupPlainAutocomplete('esr-name', 'esr-name-dropdown', _loadSeriesAutocomplete,
    (s, q) => matchesSearch(s.name, q),
    s => s.created_by_username ? `<span class="ac-sub">${t('addbook.by_creator', { name: escapeHtml(s.created_by_username) })}</span>` : ''
  );
  _setupAuthorsAutocomplete('cb-authors', 'cb-authors-dropdown');
  _setupAuthorsAutocomplete('cc-authors', 'cc-authors-dropdown');
  _setupAuthorsAutocomplete('ecc-authors', 'ecc-authors-dropdown');
  _setupAuthorsAutocomplete('edit-book-authors-input', 'edit-book-authors-dropdown');

  // Add Book events
  document.getElementById('cb-parent').addEventListener('change', _syncCbUi);
  document.getElementById('cb-pub-type').addEventListener('change', e => {
    const isMag = e.target.value === 'magazine';
    document.getElementById('cb-fields-book').style.display = isMag ? 'none' : '';
    document.getElementById('cb-fields-mag').style.display  = isMag ? '' : 'none';
  });
  document.getElementById('cb-cover-btn').addEventListener('click', () => { document.getElementById('cb-cover-file').value = ''; document.getElementById('cb-cover-file').click(); });
  document.getElementById('cb-cover-file').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    let blob;
    try { blob = await compressImage(file, 256 * 1024, 900); } catch { showAlert('Could not read that image - try a different file.'); return; }
    if (!blob) return;
    _cbCover = blob;
    const img = document.getElementById('cb-cover-img'); img.src = URL.createObjectURL(blob); img.style.display = 'block';
    document.getElementById('cb-cover-placeholder').style.display = 'none';
  });
  document.getElementById('cb-pdf-btn').addEventListener('click', () => { document.getElementById('cb-pdf-file').value = ''; document.getElementById('cb-pdf-file').click(); });
  document.getElementById('cb-pdf-file').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    if (!_acceptPdfSelection(file, { inputId: 'cb-pdf-file', labelId: 'cb-pdf-name', errorId: 'cb-error' })) { _cbPdf = null; return; }
    _cbPdf = file;
    _setPdfInlineLabel(document.getElementById('cb-pdf-name'), `${file.name} (${formatFileSize(file.size)})`);
  });
  document.getElementById('cb-cancel').addEventListener('click', _closeAddBook);
  document.getElementById('cb-close').addEventListener('click', _closeAddBook);
  document.getElementById('add-book-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && mousedownOnOverlayRef() === e.currentTarget) _closeAddBook();
  });
  document.getElementById('cb-save').addEventListener('click', async () => {
    const errEl = document.getElementById('cb-error');
    errEl.textContent = '';
    // Demo mode has no real account - any of the calls below would 401 and
    // silently log the demo out (see the matching guards on dialog-open,
    // above), so block it here too rather than let Save do the same thing.
    if (isDemoMode) { errEl.textContent = t('addbook.demo_not_supported'); return; }
    const selectedId = _cbAc.getSelectedId();
    if (_cbAc.isSelectedOwned()) { errEl.textContent = t('addbook.book_already_in_library'); return; }
    if (selectedId) {
      try { await apiFetch(`/api/books/${selectedId}/add`, { method: 'POST' }); _closeAddBook(); await _refreshLibraryUi({ feed: true, covers: true }); }
      catch (_) { errEl.textContent = t('addbook.add_book_failed'); }
      return;
    }
    const name     = document.getElementById('cb-name').value.trim();
    const sections = parseInt(document.getElementById('cb-sections').value, 10);
    if (!name || !(sections >= 5)) { errEl.textContent = t('err.name_sections'); return; }
    let isbn = '', issn = '', asin = '';
    const pubType = document.getElementById('cb-pub-type').value;
    if (pubType === 'magazine') {
      issn = validateIssn(document.getElementById('cb-issn').value.trim());
      if (issn === null) { errEl.textContent = t('err.issn_invalid'); return; }
    } else {
      isbn = validateIsbn(document.getElementById('cb-isbn').value.trim());
      if (isbn === null) { errEl.textContent = t('err.isbn_invalid'); return; }
      asin = validateAsin(document.getElementById('cb-asin').value.trim());
      if (asin === null) { errEl.textContent = t('err.asin_invalid'); return; }
    }
    const hasParent   = !!document.getElementById('cb-parent').value;
    const pages       = hasParent ? null : (parseInt(document.getElementById('cb-pages').value, 10) || null);
    const authors     = document.getElementById('cb-authors').value.trim() || null;
    const description = document.getElementById('cb-description').value.trim() || null;
    const isPublic    = document.getElementById('cb-public').checked;
    const seriesName  = document.getElementById('cb-series').value || null;
    const seriesNum   = document.getElementById('cb-series-num').value.trim() || null;
    const parentId    = document.getElementById('cb-parent').value ? +document.getElementById('cb-parent').value : null;
    const bookOrder   = parseInt(document.getElementById('cb-order').value, 10) || null;
    try {
      const res  = await apiFetch('/api/books', { method: 'POST', body: JSON.stringify({ name, total_sections: sections, isbn: isbn || null, issn: issn || null, asin: asin || null, pages, authors, description, is_public: isPublic, series_name: seriesName, series_number: seriesNum, parent_book_id: parentId, book_order: bookOrder }) });
      const book = await res.json();
      if (_cbCover) {
        try {
          const r = await apiFetch(`/api/books/${book.id}/cover`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: _cbCover });
          if (!r.ok) { _closeAddBook(); await _refreshLibraryUi({ feed: true, covers: true }); showAlert('Book created, but cover upload failed. You can retry from Edit Book.'); return; }
          _hooks.scheduleRewardProfileRefresh?.();
        } catch (_) { _closeAddBook(); await _refreshLibraryUi({ feed: true, covers: true }); showAlert('Book created, but cover upload failed. You can retry from Edit Book.'); return; }
      }
      if (_cbPdf) {
        _setButtonsDisabled(['cb-save', 'cb-cancel'], true);
        try { await _uploadPdfWithProgress(`/api/books/${book.id}/pdf`, _cbPdf, 'cb'); _hooks.scheduleRewardProfileRefresh?.(); }
        catch (e) { _closeAddBook(); await _refreshLibraryUi({ feed: true, covers: true }); showAlert(`${t('addbook.book_pdf_upload_failed')}${e?.message ? `\n\n${e.message}` : ''}`); return; }
        finally { _setButtonsDisabled(['cb-save', 'cb-cancel'], false); }
      }
      _closeAddBook(); await _refreshLibraryUi({ feed: true, covers: true });
    } catch (_) { errEl.textContent = t('err.create_book'); }
  });
  document.getElementById('open-add-book-btn').addEventListener('click', openAddBook);

  // Add Anthology events
  document.getElementById('cc-pub-type').addEventListener('change', e => {
    const isMag = e.target.value === 'magazine';
    document.getElementById('cc-fields-book').style.display = isMag ? 'none' : '';
    document.getElementById('cc-fields-mag').style.display  = isMag ? '' : 'none';
  });
  document.getElementById('cc-cover-btn').addEventListener('click', () => { document.getElementById('cc-cover-file').value = ''; document.getElementById('cc-cover-file').click(); });
  document.getElementById('cc-cover-file').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    let blob;
    try { blob = await compressImage(file, 256 * 1024, 900); } catch { showAlert('Could not read that image - try a different file.'); return; }
    if (!blob) return;
    _ccCover = blob;
    const img = document.getElementById('cc-cover-img'); img.src = URL.createObjectURL(blob); img.style.display = 'block';
    document.getElementById('cc-cover-placeholder').style.display = 'none';
  });
  document.getElementById('cc-pdf-btn').addEventListener('click', () => { document.getElementById('cc-pdf-file').value = ''; document.getElementById('cc-pdf-file').click(); });
  document.getElementById('cc-pdf-file').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    if (!_acceptPdfSelection(file, { inputId: 'cc-pdf-file', labelId: 'cc-pdf-name', errorId: 'cc-error' })) { _ccPdf = null; return; }
    _ccPdf = file;
    _setPdfInlineLabel(document.getElementById('cc-pdf-name'), `${file.name} (${formatFileSize(file.size)})`);
  });
  document.getElementById('cc-cancel').addEventListener('click', _closeAddComp);
  document.getElementById('cc-close').addEventListener('click', _closeAddComp);
  document.getElementById('add-comp-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && mousedownOnOverlayRef() === e.currentTarget) _closeAddComp();
  });
  document.getElementById('cc-save').addEventListener('click', async () => {
    const errEl = document.getElementById('cc-error');
    errEl.textContent = '';
    if (isDemoMode) { errEl.textContent = t('addbook.demo_not_supported'); return; }
    const selectedId = _ccAc.getSelectedId();
    if (_ccAc.isSelectedOwned()) { errEl.textContent = t('addbook.anthology_already_in_library'); return; }
    if (selectedId) {
      try { await apiFetch(`/api/books/${selectedId}/add`, { method: 'POST' }); _closeAddComp(); await _refreshLibraryUi({ feed: true, covers: true }); }
      catch (_) { errEl.textContent = t('addbook.add_anthology_failed'); }
      return;
    }
    const name = document.getElementById('cc-name').value.trim();
    if (!name) { errEl.textContent = t('err.name_empty'); return; }
    let isbn = '', issn = '', asin = '';
    const pubType = document.getElementById('cc-pub-type').value;
    if (pubType === 'magazine') {
      issn = validateIssn(document.getElementById('cc-issn').value.trim());
      if (issn === null) { errEl.textContent = t('err.issn_invalid'); return; }
    } else {
      isbn = validateIsbn(document.getElementById('cc-isbn').value.trim());
      if (isbn === null) { errEl.textContent = t('err.isbn_invalid'); return; }
      asin = validateAsin(document.getElementById('cc-asin').value.trim());
      if (asin === null) { errEl.textContent = t('err.asin_invalid'); return; }
    }
    const pages       = parseInt(document.getElementById('cc-pages').value, 10) || null;
    const authors     = document.getElementById('cc-authors').value.trim() || null;
    const description = document.getElementById('cc-description').value.trim() || null;
    const isPublic    = document.getElementById('cc-public').checked;
    const seriesName  = document.getElementById('cc-series').value || null;
    const seriesNum   = document.getElementById('cc-series-num').value.trim() || null;
    try {
      const res  = await apiFetch('/api/books', { method: 'POST', body: JSON.stringify({ name, total_sections: 0, isbn: isbn || null, issn: issn || null, asin: asin || null, pages, authors, description, is_public: isPublic, series_name: seriesName, series_number: seriesNum, is_container: 1 }) });
      const book = await res.json();
      if (_ccCover) {
        try {
          const r = await apiFetch(`/api/books/${book.id}/cover`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: _ccCover });
          if (!r.ok) { _closeAddComp(); await _refreshLibraryUi({ feed: true, covers: true }); showAlert('Anthology created, but cover upload failed. You can retry from Edit Anthology.'); return; }
          _hooks.scheduleRewardProfileRefresh?.();
        } catch (_) { _closeAddComp(); await _refreshLibraryUi({ feed: true, covers: true }); showAlert('Anthology created, but cover upload failed. You can retry from Edit Anthology.'); return; }
      }
      if (_ccPdf) {
        _setButtonsDisabled(['cc-save', 'cc-cancel'], true);
        try { await _uploadPdfWithProgress(`/api/books/${book.id}/pdf`, _ccPdf, 'cc'); _hooks.scheduleRewardProfileRefresh?.(); }
        catch (e) { _closeAddComp(); await _refreshLibraryUi({ feed: true, covers: true }); showAlert(`${t('addbook.anthology_pdf_upload_failed')}${e?.message ? `\n\n${e.message}` : ''}`); return; }
        finally { _setButtonsDisabled(['cc-save', 'cc-cancel'], false); }
      }
      _closeAddComp(); await _refreshLibraryUi({ feed: true, covers: true });
    } catch (_) { errEl.textContent = t('err.create_book'); }
  });
  document.getElementById('open-add-comp-btn').addEventListener('click', openAddComp);

  // Add Series events
  _csrInput   = document.getElementById('csr-name');
  _csrDropdown = document.getElementById('csr-name-dropdown');
  _csrSaveBtn  = document.getElementById('csr-save');

  _csrInput.addEventListener('input', () => {
    _csrSetExisting(null, { preserveDescription: _csrSelectedId == null });
    _csrRenderDropdown(_csrInput.value.trim());
  });
  _csrInput.addEventListener('blur', () => setTimeout(() => _csrDropdown.classList.remove('open'), 150));
  _csrInput.addEventListener('keydown', e => {
    const items = _csrDropdown.querySelectorAll('li');
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); _csrActiveIdx = Math.min(_csrActiveIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _csrActiveIdx = Math.max(_csrActiveIdx - 1, 0); }
    else if (e.key === 'Enter' && _csrActiveIdx >= 0) { e.preventDefault(); _csrSelectItem(items[_csrActiveIdx]); return; }
    else if (e.key === 'Escape') { _csrDropdown.classList.remove('open'); return; }
    else { return; }
    items.forEach((li, i) => li.classList.toggle('ac-active', i === _csrActiveIdx));
    items[_csrActiveIdx]?.scrollIntoView({ block: 'nearest' });
  });
  _csrDropdown.addEventListener('mousedown', e => {
    const li = e.target.closest('li');
    if (!li) return;
    _csrSelectItem(li);
    e.preventDefault();
  });
  document.getElementById('csr-cancel').addEventListener('click', _closeAddSeries);
  document.getElementById('csr-close').addEventListener('click', _closeAddSeries);
  document.getElementById('add-series-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && mousedownOnOverlayRef() === e.currentTarget) _closeAddSeries();
  });
  document.getElementById('csr-save').addEventListener('click', async () => {
    const name  = _csrInput.value.trim();
    const errEl = document.getElementById('csr-error');
    errEl.textContent = '';
    if (isDemoMode) { errEl.textContent = t('addbook.demo_not_supported'); return; }
    if (!name) { errEl.textContent = t('err.name_empty'); return; }
    try {
      if (_csrSelectedOwned) { errEl.textContent = t('addbook.series_already_in_library'); return; }
      if (_csrSelectedId) {
        await apiFetch(`/api/series/${_csrSelectedId}/add?cascade=1`, { method: 'POST' });
        _closeAddSeries(); await _refreshLibraryUi({ feed: true, covers: true });
      } else {
        const description = document.getElementById('csr-description').value.trim() || null;
        const is_public   = document.getElementById('csr-public').checked;
        const res    = await apiFetch('/api/series', { method: 'POST', body: JSON.stringify({ name, description, is_public }) });
        const result = await res.json();
        if (result.existed) {
          await apiFetch(`/api/series/${result.id}/add?cascade=1`, { method: 'POST' });
          const by = result.createdByUsername ? t('addbook.series_already_created_by', { name: result.createdByUsername }) : '';
          errEl.style.color = '#f5a623';
          errEl.textContent = t('addbook.series_exists_added', { name: result.name, by });
          setTimeout(async () => { _closeAddSeries(); await _refreshLibraryUi({ feed: true, covers: true }); }, 2500);
        } else {
          _closeAddSeries(); await _refreshLibraryUi({ feed: true, covers: true });
        }
      }
    } catch (_) { errEl.textContent = t('addbook.failed'); }
  });
  document.getElementById('open-add-series-btn').addEventListener('click', openAddSeries);
}
