import { editState } from './state.js';
import { state, isDemoMode, apiFetch } from '../core/state.js';
import { t } from '../i18n.js';
import { getCachedBooks, _refreshBooksListOnly } from '../books.js';
import { showAlert } from '../play.js';
import { _setPdfCurrentLink, _setModalUploadProgress, _adminPdfHref, _setEpubCurrentLink } from './uploads.js';
import { _populateParentBookSelect, _populateSeriesSelect } from './selectors.js';
import { _renderAlsoAppearsIn } from './memberships.js';
import { initBookRating } from './book-rating.js';
import { bindBookActions } from './book-actions.js';

export function openEditBookModal({ bookId, initialName, initialSections, initialMaxSectionNumber = null, minMaxSectionNumber = 1, initialIsbn = '', initialIssn = '', initialAsin = '', initialCoverUrl = null, initialPdfPath = null, initialPdfSize = null, initialEpubPath = null, initialEpubSize = null, initialPages = '', initialAuthors = '', initialDescription = '', initialDiscoverableSections = null, showDiscoverableSections = false, discoverableHint = 0, minSections = 1, initialIsPublic = false, initialSeriesName = '', initialSeriesNumber = '', initialIsContainer = false, initialParentBookId = null, initialBookOrder = null, onSave }) {
  ++editState._bookSession;
  // Close the forum before opening an editor so it cannot cover the edit dialog.
  document.getElementById('forum-modal-overlay')?.classList.remove('active');
  // Reset the public dialog's temporary z-index without clearing its content.
  const pubOverlay = document.getElementById('public-modal-overlay');
  if (pubOverlay) pubOverlay.style.zIndex = '';
  editState._editBookId       = bookId;
  editState._pendingCoverBlob = null;
  editState._pendingPdfFile   = null;
  editState._pendingEpubFile  = null;

  document.getElementById('edit-book-name-input').value          = initialName;
  document.getElementById('edit-book-sections-input').value      = initialSections;
  document.getElementById('edit-book-max-section-input').value = String(initialMaxSectionNumber ?? initialSections);
  document.getElementById('edit-book-isbn-input').value          = initialIsbn || '';
  document.getElementById('edit-book-asin-input').value          = initialAsin || '';
  document.getElementById('edit-book-issn-input').value          = initialIssn || '';
  document.getElementById('edit-book-isbn-hint').textContent     = '';
  document.getElementById('edit-book-error').textContent         = '';
  document.getElementById('edit-book-authors-input').value       = initialAuthors || '';
  document.getElementById('edit-book-pages-input').value         = initialPages || '';
  document.getElementById('edit-book-description-input').value   = initialDescription || '';
  document.getElementById('edit-book-public-toggle').checked     = !!initialIsPublic;

  document.getElementById('edit-book-public-toggle').disabled = !!editState._hooks.resolveIsModerator?.() && !editState._hooks.resolveIsAdmin?.();

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

  const isAdmin    = !!editState._hooks.resolveIsAdmin?.();
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

  const epubRow     = document.getElementById('edit-book-epub-row');
  const epubCurrent = document.getElementById('edit-book-epub-current');
  const epubLink    = document.getElementById('edit-book-epub-link');
  const epubName    = document.getElementById('edit-book-epub-name');
  document.getElementById('edit-book-epub-file').value = '';
  epubName.textContent = '';
  _setModalUploadProgress('edit-book', null, 'epub');
  epubRow.style.display = ((isAdmin || !!initialEpubPath) && !initialParentBookId) ? '' : 'none';
  if (initialEpubPath) {
    epubLink.href = _adminPdfHref(initialEpubPath);
    _setEpubCurrentLink(epubLink, initialEpubSize);
    epubCurrent.style.display = '';
  } else {
    epubCurrent.style.display = 'none';
  }

  document.getElementById('edit-book-series-number-input').value = initialSeriesNumber || '';
  if (!isDemoMode) _populateSeriesSelect('edit-book-series-select', initialSeriesName || null);

  const _parentInput = document.getElementById('edit-book-parent-input');
  _populateParentBookSelect('edit-book-parent-input', initialParentBookId, bookId);
  document.getElementById('edit-book-order-input').value = initialBookOrder != null ? String(initialBookOrder) : '';

  const _alsoAppearsRow = document.getElementById('edit-book-also-appears-row');
  if (_alsoAppearsRow) _alsoAppearsRow.style.display = initialIsContainer ? 'none' : '';
  if (!initialIsContainer) _renderAlsoAppearsIn(bookId, initialParentBookId);
  if (!editState._alsoAppearsAddWired) {
    editState._alsoAppearsAddWired = true;
    // Wire once and read the current edit ID, rather than retaining a book ID from each open.
    _parentInput.addEventListener('change', () => {
      _renderAlsoAppearsIn(editState._editBookId, _parentInput.value ? +_parentInput.value : null);
    });
    document.getElementById('edit-book-also-appears-add-btn')?.addEventListener('click', async () => {
      const sel        = document.getElementById('edit-book-also-appears-select');
      const orderInput = document.getElementById('edit-book-also-appears-order-input');
      const anthologyId = sel.value ? +sel.value : null;
      const bookOrder    = orderInput?.value.trim() ? parseInt(orderInput.value, 10) : null;
      if (editState._editBookId == null) return;
      if (!anthologyId) return void showAlert(t('editbook.select_anthology_first'));
      const memberBookId = editState._editBookId;
      const session = editState._bookSession;
      try {
        const res = await apiFetch(`/api/books/${anthologyId}/anthology-members`, {
          method: 'POST', body: JSON.stringify({ book_id: memberBookId, book_order: bookOrder }),
        });
        if (!res.ok) return void showAlert(t('editbook.add_anthology_failed'));
        const book = (getCachedBooks() || []).find(b => b.id === memberBookId);
        if (book) {
          book.extra_anthology_ids = [...new Set([...(book.extra_anthology_ids || []), anthologyId])];
          book.extra_anthology_orders = { ...(book.extra_anthology_orders || {}), [anthologyId]: bookOrder };
        }
        if (session === editState._bookSession) {
          if (orderInput) orderInput.value = '';
          const currentParentId = document.getElementById('edit-book-parent-input')?.value || null;
          _renderAlsoAppearsIn(memberBookId, currentParentId ? +currentParentId : null);
        }
        _refreshBooksListOnly?.();
      } catch { showAlert(t('editbook.add_anthology_failed')); }
    });
  }

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
    if (epubRow)         epubRow.style.display         = (isAdmin && !isChild) ? '' : 'none';
  }
  _syncChildUi();
  _parentInput.onchange = () => { _hasParent = !!_parentInput.value; _syncChildUi(); };

  document.getElementById('edit-book-modal-overlay').classList.add('active');
  document.getElementById('edit-book-name-input').focus();

  initBookRating(bookId);

  bindBookActions({ pubTypeEl, minSections, minMaxSectionNumber, showDiscoverableSections, discoverableHint, initialSections, initialDiscoverableSections, onSave, closeEditBookModal });

}

export function closeEditBookModal() {
  document.getElementById('edit-book-modal-overlay').classList.remove('active');
}
