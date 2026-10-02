import { editState } from './state.js';
import { isDemoMode, apiFetch } from '../core/state.js';
import { t } from '../i18n.js';
import { pauseCoversAutoRefresh, resumeCoversAutoRefresh } from '../covers.js';
import { _setButtonsDisabled, _uploadPdfWithProgress } from './uploads.js';
import { validateIsbn, validateIssn, validateAsin } from './validators.js';

export function bindBookActions({ pubTypeEl, minSections, showDiscoverableSections, discoverableHint, initialSections, initialDiscoverableSections, onSave, closeEditBookModal }) {
  const session = editState._bookSession;
  const bookId = editState._editBookId;
  const isCurrent = () => session === editState._bookSession && document.getElementById('edit-book-modal-overlay').classList.contains('active');
  // Clone buttons to drop previous listeners
  ['edit-book-save', 'edit-book-cancel', 'edit-book-cover-btn'].forEach(id => {
    const el  = document.getElementById(id);
    const neo = el.cloneNode(true);
    el.parentNode.replaceChild(neo, el);
  });
  _setButtonsDisabled(['edit-book-save', 'edit-book-cancel'], false);

  document.getElementById('edit-book-cancel').addEventListener('click', closeEditBookModal);
  document.getElementById('edit-book-close').onclick = closeEditBookModal;

  document.getElementById('edit-book-cover-btn').addEventListener('click', () => {
    document.getElementById('edit-book-cover-file').value = '';
    document.getElementById('edit-book-cover-file').click();
  });

  pubTypeEl.onchange = () => {
    const isMag = pubTypeEl.value === 'magazine';
    document.getElementById('edit-book-fields-book').style.display     = isMag ? 'none' : '';
    document.getElementById('edit-book-fields-magazine').style.display = isMag ? ''     : 'none';
    document.getElementById('edit-book-isbn-hint').textContent = '';
  };

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

    // A cover upload and a PDF upload in the same save are two separate
    // server mutations, each broadcasting its own covers_changed SSE event -
    // pause the panel's auto-refresh here so it doesn't visibly reload once
    // per step, then resume once both are settled (see matching comment in
    // add-book.js's Add Book handler).
    pauseCoversAutoRefresh();

    const cover = editState._pendingCoverBlob;
    const pdf = editState._pendingPdfFile;
    if (cover && bookId) {
      try {
        const coverRes  = await apiFetch(`/api/books/${bookId}/cover`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body:    cover,
        });
        if (!coverRes.ok) throw new Error('Cover upload failed');
        const coverData = await coverRes.json();
        if (isCurrent() && coverData.coverUrl) editState._hooks.setCurrentBookCover?.(coverData.coverUrl);
        editState._hooks.scheduleRewardProfileRefresh?.();
      } catch (_) {
        resumeCoversAutoRefresh();
        if (isCurrent()) errEl.textContent = t('editbook.cover_upload_failed');
        return;
      }
    }
    if (!isCurrent()) { resumeCoversAutoRefresh(); return; }

    if (pdf && bookId) {
      _setButtonsDisabled(['edit-book-save', 'edit-book-cancel'], true);
      try {
        const pdfData = await _uploadPdfWithProgress(`/api/books/${bookId}/pdf`, pdf, 'edit-book', isCurrent);
        // A book's first-ever PDF awards XP server-side, but nothing else in
        // this flow would ever prompt the client to notice - the XP bar was
        // only catching up whenever some unrelated refresh (SSE badge event,
        // periodic poll) happened to fire next, which felt inconsistent/silent.
        editState._hooks.scheduleRewardProfileRefresh?.();
        // The My Books card reads pdf_path only when the list renders, and a
        // PDF-only save takes the no-re-render path in the panel's onSave -
        // without this the card's PDF badge (and the ✎ modal's own stale
        // data-pdf) would stay as-was until some unrelated full refresh.
        editState._hooks.onPdfChanged?.(bookId, pdfData?.pdfUrl ? pdfData.pdfUrl.split('/').pop() : null, pdf.size);
      } catch (e) {
        resumeCoversAutoRefresh();
        if (isCurrent()) errEl.textContent = e?.message || t('editbook.pdf_upload_failed');
        return;
      } finally {
        if (isCurrent()) _setButtonsDisabled(['edit-book-save', 'edit-book-cancel'], false);
      }
    }

    resumeCoversAutoRefresh();
    if (!isCurrent()) return;

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

  document.getElementById('edit-book-name-input').onkeydown = e => {
    if (e.key === 'Enter')  document.getElementById('edit-book-sections-input').focus();
    if (e.key === 'Escape') closeEditBookModal();
  };
  document.getElementById('edit-book-sections-input').onkeydown = e => {
    if (e.key === 'Enter')  document.getElementById('edit-book-isbn-input').focus();
    if (e.key === 'Escape') closeEditBookModal();
  };
  document.getElementById('edit-book-isbn-input').onkeydown = e => {
    if (e.key === 'Enter')  document.getElementById('edit-book-save').click();
    if (e.key === 'Escape') closeEditBookModal();
  };
  document.getElementById('edit-book-asin-input').onkeydown = e => {
    if (e.key === 'Enter')  document.getElementById('edit-book-save').click();
    if (e.key === 'Escape') closeEditBookModal();
  };
  document.getElementById('edit-book-issn-input').onkeydown = e => {
    if (e.key === 'Enter')  document.getElementById('edit-book-save').click();
    if (e.key === 'Escape') closeEditBookModal();
  };
}
