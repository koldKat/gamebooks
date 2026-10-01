import { editState } from './state.js';
import { apiFetch } from '../state.js';
import { t } from '../i18n.js';
import { showAlert, showConfirm } from '../play.js';
import { compressImage, setPreviewImgBlob } from '../util.js';
import { formatFileSize, _acceptPdfSelection, _setPdfInlineLabel, _setPdfCurrentLink, _setModalUploadProgress, _setButtonsDisabled, _uploadPdfWithProgress, _adminPdfHref } from './uploads.js';
import { validateIsbn, validateIssn, validateAsin } from './validators.js';
import { _populateSeriesSelect } from './selectors.js';

export function openEditCompModal({ bookId, initialName, initialIsbn = '', initialIssn = '', initialAsin = '', initialCoverUrl = null, initialPdfPath = null, initialPdfSize = null, initialPages = '', initialAuthors = '', initialDescription = '', initialSeriesName = '', initialSeriesNumber = '', initialIsPublic = false, onSave }) {
  const session = ++editState._anthologySession;
  const isCurrent = () => session === editState._anthologySession && document.getElementById('edit-comp-overlay').classList.contains('active');
  editState._eccBookId = bookId; editState._eccCover = null; editState._eccPdf = null;
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
  document.getElementById('ecc-pdf-row').style.display = (editState._hooks.resolveIsAdmin?.() || !!initialPdfPath) ? '' : 'none';
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
  _setButtonsDisabled(['ecc-save', 'ecc-cancel'], false);
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
    const cover = editState._eccCover;
    const pdf = editState._eccPdf;
    if (cover && bookId) {
      try {
        const r = await apiFetch(`/api/books/${bookId}/cover`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: cover });
        if (!r.ok) { if (isCurrent()) errEl.textContent = t('editbook.cover_upload_failed'); return; }
        editState._hooks.scheduleRewardProfileRefresh?.();
      } catch (_) { if (isCurrent()) errEl.textContent = t('editbook.cover_upload_failed'); return; }
    }
    if (!isCurrent()) return;
    if (pdf && bookId) {
      _setButtonsDisabled(['ecc-save', 'ecc-cancel'], true);
      try {
        const pdfData = await _uploadPdfWithProgress(`/api/books/${bookId}/pdf`, pdf, 'ecc', isCurrent);
        editState._hooks.scheduleRewardProfileRefresh?.();
        editState._hooks.onPdfChanged?.(bookId, pdfData?.pdfUrl ? pdfData.pdfUrl.split('/').pop() : null, pdf.size);
      } catch (e) { if (isCurrent()) errEl.textContent = e?.message || t('editbook.pdf_upload_failed'); return; }
      finally { if (isCurrent()) _setButtonsDisabled(['ecc-save', 'ecc-cancel'], false); }
    }
    if (!isCurrent()) return;
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

export function initAnthologyBindings(mousedownOnOverlayRef) {
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
    const session = editState._anthologySession;
    let blob;
    try { blob = await compressImage(file, 256 * 1024, 900); } catch { showAlert('Could not read that image - try a different file.'); return; }
    if (!blob || session !== editState._anthologySession) return;
    editState._eccCover = blob;
    const img = document.getElementById('ecc-cover-img');
    const ph  = document.getElementById('ecc-cover-placeholder');
    setPreviewImgBlob(img, blob); img.style.display = 'block'; ph.style.display = 'none';
  });
  document.getElementById('ecc-pdf-btn').addEventListener('click', () => {
    document.getElementById('ecc-pdf-file').value = '';
    document.getElementById('ecc-pdf-file').click();
  });
  document.getElementById('ecc-pdf-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!_acceptPdfSelection(file, { inputId: 'ecc-pdf-file', labelId: 'ecc-pdf-name', errorId: 'ecc-error' })) {
      editState._eccPdf = null; return;
    }
    editState._eccPdf = file;
    _setPdfInlineLabel(document.getElementById('ecc-pdf-name'), `${file.name} (${formatFileSize(file.size)})`);
  });
  document.getElementById('ecc-pdf-remove').addEventListener('click', () => {
    if (!editState._eccBookId) return;
    const bookId = editState._eccBookId;
    const session = editState._anthologySession;
    return showConfirm(t('editbook.remove_pdf_confirm'), async () => {
      try {
        const r = await apiFetch(`/api/books/${bookId}/pdf`, { method: 'DELETE' });
        if (!r.ok) throw new Error('PDF removal failed');
        editState._hooks.onPdfChanged?.(bookId, null, null);
        if (session !== editState._anthologySession) return;
        editState._eccPdf = null;
        _setPdfCurrentLink(document.getElementById('ecc-pdf-link'), null);
        document.getElementById('ecc-pdf-current').style.display = 'none';
        document.getElementById('ecc-pdf-name').textContent = '';
      } catch (_) {
        if (session === editState._anthologySession) document.getElementById('ecc-error').textContent = t('err.save');
      }
    });
  });


}
