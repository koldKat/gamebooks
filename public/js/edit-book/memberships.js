import { apiFetch } from '../core/state.js';
import { t } from '../i18n.js';
import { getCachedBooks, _refreshBooksListOnly } from '../books.js';
import { showAlert } from '../play.js';
import { escapeHtml } from '../core/util.js';
import { _sortedByName } from './selectors.js';
import { editState } from './state.js';

export function _renderAlsoAppearsIn(bookId, primaryParentId) {
  const session = editState._bookSession;
  const list = document.getElementById('edit-book-also-appears-list');
  const sel  = document.getElementById('edit-book-also-appears-select');
  if (!list || !sel) return;
  const books   = getCachedBooks() || [];
  const thisBook = books.find(b => b.id === bookId);
  const memberIds = new Set(thisBook?.extra_anthology_ids || []);

  const orders = thisBook?.extra_anthology_orders || {};
  list.innerHTML = '';
  for (const id of memberIds) {
    const anthology = books.find(b => b.id === id);
    if (!anthology) continue;
    const chip = document.createElement('span');
    chip.className = 'also-appears-chip';
    const currentOrder = orders[id] ?? '';
    chip.innerHTML = `<span class="also-appears-chip-name">${escapeHtml(anthology.name)}</span>` +
      `<input type="text" inputmode="numeric" class="also-appears-chip-order" maxlength="3" value="${escapeHtml(String(currentOrder))}" placeholder="${t('ph.order_num_short')}">` +
      `<button type="button" data-anthology-id="${id}" aria-label="${t('editbook.remove')}">✕</button>`;
    chip.querySelector('.also-appears-chip-order').addEventListener('change', async e => {
      const newOrder = e.target.value.trim() ? parseInt(e.target.value, 10) : null;
      try {
        const res = await apiFetch(`/api/books/${id}/anthology-members`, {
          method: 'POST', body: JSON.stringify({ book_id: bookId, book_order: newOrder }),
        });
        if (!res.ok) return void showAlert(t('editbook.add_anthology_failed'));
        if (thisBook) thisBook.extra_anthology_orders = { ...(thisBook.extra_anthology_orders || {}), [id]: newOrder };
        _refreshBooksListOnly?.();
      } catch { showAlert(t('editbook.add_anthology_failed')); }
    });
    chip.querySelector('button').addEventListener('click', async () => {
      try {
        const res = await apiFetch(`/api/books/${id}/anthology-members/${bookId}`, { method: 'DELETE' });
        if (!res.ok) return void showAlert(t('editbook.remove_anthology_failed'));
        memberIds.delete(id);
        if (thisBook) thisBook.extra_anthology_ids = [...memberIds];
        if (session === editState._bookSession) _renderAlsoAppearsIn(bookId, primaryParentId);
        _refreshBooksListOnly?.();
      } catch { showAlert(t('editbook.remove_anthology_failed')); }
    });
    list.appendChild(chip);
  }

  const available = _sortedByName(books.filter(b =>
    b.is_container && b.id !== bookId && b.id !== primaryParentId && !memberIds.has(b.id)
  ));
  sel.innerHTML = `<option value="">${t('editbook.add_anthology')}</option>`;
  for (const a of available) {
    const opt = document.createElement('option');
    opt.value = String(a.id);
    opt.textContent = a.name;
    sel.appendChild(opt);
  }
}
