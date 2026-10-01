import { editState } from './state.js';
import { state, isDemoMode, apiFetch } from '../state.js';
import { t } from '../i18n.js';
import { getCachedBooks, _refreshBooksListOnly } from '../books.js';
import { showAlert } from '../play.js';
import { _setPdfCurrentLink, _setModalUploadProgress, _adminPdfHref } from './uploads.js';
import { _populateParentBookSelect, _populateSeriesSelect } from './selectors.js';
import { _renderAlsoAppearsIn } from './memberships.js';
import { initBookRating } from './book-rating.js';
import { bindBookActions } from './book-actions.js';

export function openEditBookModal({ bookId, initialName, initialSections, initialIsbn = '', initialIssn = '', initialAsin = '', initialCoverUrl = null, initialPdfPath = null, initialPdfSize = null, initialPages = '', initialAuthors = '', initialDescription = '', initialDiscoverableSections = null, showDiscoverableSections = false, discoverableHint = 0, minSections = 1, initialIsPublic = false, initialSeriesName = '', initialSeriesNumber = '', initialIsContainer = false, initialParentBookId = null, initialBookOrder = null, onSave }) {
  ++editState._bookSession;
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
  editState._editBookId       = bookId;
  editState._pendingCoverBlob = null;
  editState._pendingPdfFile   = null;

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
    // Wired once (not per modal-open, unlike _syncChildUi's own listener below)
    // to avoid stacking a new closure-captured bookId onto this persistent
    // input every time the modal reopens for a different book - reads
    // editState._editBookId live instead, same pattern as the Add button just below.
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
  }
  _syncChildUi();
  _parentInput.onchange = () => { _hasParent = !!_parentInput.value; _syncChildUi(); };

  document.getElementById('edit-book-modal-overlay').classList.add('active');
  document.getElementById('edit-book-name-input').focus();

  initBookRating(bookId);

  bindBookActions({ pubTypeEl, minSections, showDiscoverableSections, discoverableHint, initialSections, initialDiscoverableSections, onSave, closeEditBookModal });

}

export function closeEditBookModal() {
  document.getElementById('edit-book-modal-overlay').classList.remove('active');
}
