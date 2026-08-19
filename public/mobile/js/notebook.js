// notebook.js - Mobile's plain per-book notebook.
//
// Shares the exact same server-backed data as desktop's notebook (same
// GET/PUT /api/books/:id/notebook endpoint, same text) - not a separate
// mobile copy. Deliberately does NOT port desktop's "pin to play area"
// toggle (notes.js's notesPinned/notes-display overlay) - that's a
// graph-view concept with nothing to pin to here, so this is just the
// plain editable notebook, always full-screen when open.

import { state, currentBookId, apiFetch } from '../../js/state.js?v=14';
import { showAlert } from '../../js/confirm.js?v=6';
import { t } from '../../js/i18n.js?v=73';
import { escapeHtml } from '../../js/util.js?v=89';
import { showToast } from './toast.js?v=1';

let _overlay = null;

function _ensureDom() {
  if (_overlay) return _overlay;
  const overlay = document.createElement('div');
  overlay.id = 'm-notebook-overlay';
  overlay.className = 'm-overlay';
  overlay.innerHTML = `
    <div class="m-notebook-modal">
      <div class="m-notebook-hdr">
        <span>${t('notes.notebook_title')}</span>
        <button id="m-notebook-close" class="m-icon-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <textarea id="m-notebook-input" class="m-notebook-input" placeholder="${escapeHtml(t('ph.notebook'))}" spellcheck="true"></textarea>
      <div class="m-notebook-ftr">
        <button id="m-notebook-cancel" class="m-btn-secondary">${t('btn.cancel')}</button>
        <button id="m-notebook-save" class="m-btn-primary">${t('btn.save')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  _overlay = overlay;

  document.getElementById('m-notebook-close').addEventListener('click', _close);
  document.getElementById('m-notebook-cancel').addEventListener('click', _close);
  document.getElementById('m-notebook-save').addEventListener('click', _save);
  overlay.addEventListener('click', e => { if (e.target === overlay) _close(); });

  return overlay;
}

function _close() {
  _overlay?.classList.remove('active');
}

async function _save() {
  const bookId = currentBookId;
  if (!bookId) return;
  const text = document.getElementById('m-notebook-input').value;
  const ptIdx = typeof state.activePtIndex === 'number' ? state.activePtIndex : -1;
  let xpAwarded = false;
  try {
    const res = await apiFetch(`/api/books/${bookId}/notebook`, {
      method: 'PUT',
      body: JSON.stringify({ text, ptIdx }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      showAlert(j.error || t('notes.save_failed'));
      return;
    }
    xpAwarded = !!(await res.json()).xpAwarded;
  } catch (_) {
    showAlert(t('notes.save_failed'));
    return;
  }
  _close();
  if (xpAwarded) showToast(t('notes.notebook_saved_xp'));
}

export async function openNotebook(bookId) {
  const overlay = _ensureDom();
  const input = document.getElementById('m-notebook-input');
  input.value = '';
  try {
    const res = await apiFetch(`/api/books/${bookId}/notebook`);
    if (res.ok) input.value = (await res.json()).text ?? '';
  } catch (_) { /* leave blank on failure, same as desktop's fallback */ }
  overlay.classList.add('active');
}
