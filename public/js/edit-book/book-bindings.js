import { editState } from './state.js';
import { apiFetch } from '../state.js';
import { t } from '../i18n.js';
import { showAlert } from '../play.js';
import { compressImage, setPreviewImgBlob } from '../util.js';
import { formatFileSize, _acceptPdfSelection, _setPdfInlineLabel } from './uploads.js';

export function initBookBindings() {

  // Edit book file inputs
  document.getElementById('edit-book-cover-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const session = editState._bookSession;
    let blob;
    try { blob = await compressImage(file, 256 * 1024, 900); } catch { showAlert('Could not read that image - try a different file.'); return; }
    if (!blob || session !== editState._bookSession) return;
    editState._pendingCoverBlob = blob;
    const coverImg = document.getElementById('edit-book-cover-img');
    const coverPh  = document.getElementById('edit-book-cover-placeholder');
    setPreviewImgBlob(coverImg, blob); coverImg.style.display = 'block';
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
      editState._pendingPdfFile = null;
      return;
    }
    editState._pendingPdfFile = file;
    _setPdfInlineLabel(document.getElementById('edit-book-pdf-name'), `${file.name} (${formatFileSize(file.size)})`);
  });
  document.getElementById('edit-book-pdf-remove').addEventListener('click', async () => {
    if (!editState._editBookId) return;
    const bookId = editState._editBookId;
    const session = editState._bookSession;
    try {
      const res = await apiFetch(`/api/books/${bookId}/pdf`, { method: 'DELETE' });
      if (!res.ok) throw new Error('PDF removal failed');
    } catch {
      if (editState._bookSession === session) document.getElementById('edit-book-error').textContent = t('err.save');
      return;
    }
    editState._hooks.onPdfChanged?.(bookId, null, null);
    if (editState._bookSession !== session) return;
    document.getElementById('edit-book-pdf-current').style.display = 'none';
    editState._pendingPdfFile = null;
    document.getElementById('edit-book-pdf-name').textContent = '';
    // Immediate mutation (not part of Save) - same stale-card reason as the
    // upload path above.
  });


}
