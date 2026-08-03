// export.js - Book and full-library export/backup downloads
// Graph snapshots (graph.svg) are generated entirely server-side (see buildGraphSvg in
// server/export.js) from each book's saved positions/colors - no rendering happens here.

import { state, currentBookId, apiFetch } from './state.js?v=11';
import { showAlert } from './play.js?v=68';
import { t } from './i18n.js?v=32';

function _downloadBlob(blob, cd, fallbackFilename) {
  const matchUtf8  = cd.match(/filename\*=UTF-8''([^;\s]+)/i);
  const matchBasic = cd.match(/filename="([^"]+)"/);
  const filename   = matchUtf8 ? decodeURIComponent(matchUtf8[1]) : (matchBasic ? matchBasic[1] : fallbackFilename);
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href     = url;
  a.download = filename;
  a.click();
  // Delay revoke - revoking immediately can cancel the download before it starts
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function exportAll() {
  const btn = document.getElementById('download-backup-btn');
  const origText = btn?.textContent ?? t('export.all_default');
  if (btn) { btn.disabled = true; btn.textContent = t('export.exporting'); }
  try {
    const date = new Date().toISOString().slice(0, 10);
    const res  = await apiFetch('/api/export/all');
    if (!res.ok) { showAlert(t('export.failed')); return; }
    const blob = await res.blob();
    _downloadBlob(blob, res.headers.get('Content-Disposition') || '', `gamebooks-export-${date}.zip`);
  } catch (_) {
    showAlert(t('export.failed'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
}

export async function exportBook() {
  const btn = document.getElementById('export-book-btn');
  const origText = btn?.textContent ?? t('export.book_default');
  if (btn) { btn.disabled = true; btn.textContent = t('export.exporting'); }

  try {
    const res = await apiFetch(`/api/export/book/${currentBookId}`, { method: 'POST' });
    if (!res.ok) { showAlert(t('export.failed')); return; }

    const safeName = (state.bookName || 'book').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || 'book';
    const blob = await res.blob();
    _downloadBlob(blob, res.headers.get('Content-Disposition') || '', `${safeName}.zip`);
  } catch (_) {
    showAlert(t('export.failed'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
}
