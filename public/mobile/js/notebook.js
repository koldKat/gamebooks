// Full-screen notebook sharing desktop's server-backed text; no pinned overlay.

import { state, currentBookId, apiFetch } from '../../js/core/state.js';
import { showAlert } from '../../js/ui-helpers/confirm.js';
import { t } from '../../js/i18n.js';
import { escapeHtml } from '../../js/core/util.js';
import { showToast } from './toast.js';

let _overlay = null;
let _loadedBookId = null;
let _request = 0;

function _ready(bookId) {
  _loadedBookId = bookId;
  document.getElementById('m-notebook-input').disabled = bookId == null;
  document.getElementById('m-notebook-save').disabled = bookId == null;
}

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
  _request++;
  _overlay?.classList.remove('active');
}

async function _save() {
  const bookId = currentBookId;
  if (!bookId || _loadedBookId !== bookId || document.getElementById('m-notebook-input').disabled) return;
  const request = ++_request;
  const text = document.getElementById('m-notebook-input').value;
  _ready(null);
  const ptIdx = typeof state.activePtIndex === 'number' ? state.activePtIndex : -1;
  let xpAwarded = false;
  try {
    const res = await apiFetch(`/api/books/${bookId}/notebook`, {
      method: 'PUT',
      body: JSON.stringify({ text, ptIdx }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      if (currentBookId === bookId && request === _request) {
        _ready(bookId);
        showAlert(j.error || t('notes.save_failed'));
      }
      return;
    }
    xpAwarded = !!(await res.json()).xpAwarded;
  } catch (_) {
    if (currentBookId === bookId && request === _request) {
      _ready(bookId);
      showAlert(t('notes.save_failed'));
    }
    return;
  }
  if (currentBookId !== bookId || request !== _request) return;
  _close();
  if (xpAwarded) showToast(t('notes.notebook_saved_xp'));
}

export async function openNotebook(bookId) {
  const overlay = _ensureDom();
  if (currentBookId !== bookId) return;
  const request = ++_request;
  const input = document.getElementById('m-notebook-input');
  _ready(null);
  input.value = '';
  overlay.classList.add('active');
  try {
    const res = await apiFetch(`/api/books/${bookId}/notebook`);
    if (!res.ok) throw new Error('Notebook unavailable');
    const data = await res.json();
    if (currentBookId !== bookId || request !== _request) return;
    input.value = data.text ?? '';
    _ready(bookId);
  } catch (_) {
    if (currentBookId === bookId && request === _request) showAlert(t('notes.load_failed'));
  }
}
