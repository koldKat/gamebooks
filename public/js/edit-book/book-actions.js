import { editState } from './state.js';
import { isDemoMode, apiFetch } from '../core/state.js';
import { t } from '../i18n.js';
import { pauseCoversAutoRefresh, resumeCoversAutoRefresh } from '../covers.js';
import { _setButtonsDisabled, _uploadPdfWithProgress, _uploadEpubWithProgress } from './uploads.js';
import { validateIsbn, validateIssn, validateAsin } from './validators.js';

export function bindBookActions({ pubTypeEl, minSections, minMaxSectionNumber, showDiscoverableSections, discoverableHint, initialSections, initialDiscoverableSections, onSave, closeEditBookModal }) {
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

    // Block real API saves for demo book IDs.
    if (isDemoMode) { errEl.textContent = t('addbook.demo_not_supported'); return; }
    if (!name) { errEl.textContent = t('err.name_empty'); return; }
    if (!(sections >= 1)) { errEl.textContent = t('err.sections_invalid'); return; }
    if (sections < minSections) { errEl.textContent = t('err.sections_min', { min: minSections }); return; }

    const maxRaw = document.getElementById('edit-book-max-section-input').value.trim();
    const maxSectionNumber = maxRaw ? Number(maxRaw) : sections;
    const minMax = Math.max(sections, minMaxSectionNumber);
    if ((maxRaw && !/^\d+$/.test(maxRaw)) || !Number.isSafeInteger(maxSectionNumber) || maxSectionNumber < minMax) { errEl.textContent = t('err.max_section', { min: minMax }); return; }
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

    // Pause catalog refreshes while media mutations settle.
    pauseCoversAutoRefresh();

    const cover = editState._pendingCoverBlob;
    const pdf = editState._pendingPdfFile;
    const epub = editState._pendingEpubFile;
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
        // Request reward refresh after PDF upload so its XP award appears immediately.
        editState._hooks.scheduleRewardProfileRefresh?.();
        // Patch PDF state on every card even when a PDF-only save skips list rendering.
        editState._hooks.onPdfChanged?.(bookId, pdfData?.pdfUrl ? pdfData.pdfUrl.split('/').pop() : null, pdf.size);
      } catch (e) {
        resumeCoversAutoRefresh();
        if (isCurrent()) errEl.textContent = e?.message || t('editbook.pdf_upload_failed');
        return;
      } finally {
        if (isCurrent()) _setButtonsDisabled(['edit-book-save', 'edit-book-cancel'], false);
      }
    }

    if (!isCurrent()) { resumeCoversAutoRefresh(); return; }

    if (epub && bookId) {
      _setButtonsDisabled(['edit-book-save', 'edit-book-cancel'], true);
      try {
        const epubData = await _uploadEpubWithProgress(`/api/books/${bookId}/epub`, epub, 'edit-book', isCurrent);
        editState._hooks.scheduleRewardProfileRefresh?.();
        editState._hooks.onEpubChanged?.(bookId, epubData?.epubUrl ? epubData.epubUrl.split('/').pop() : null, epub.size);
      } catch (e) {
        resumeCoversAutoRefresh();
        if (isCurrent()) errEl.textContent = e?.message || t('editbook.epub_upload_failed');
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
    _setButtonsDisabled(['edit-book-save', 'edit-book-cancel'], true);
    try {
      await onSave(name, sections, isbn, issn, asin, pages, authors, description, discoverableSections, isPublic, seriesName, seriesNumber, isContainer, parentId, bookOrder, maxSectionNumber);
    } catch (error) {
      if (isCurrent()) errEl.textContent = error?.message || t('err.save');
      return;
    } finally {
      if (isCurrent()) _setButtonsDisabled(['edit-book-save', 'edit-book-cancel'], false);
    }
    if (isCurrent()) closeEditBookModal();
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
