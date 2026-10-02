import { isDemoMode, apiFetch } from '../core/state.js';
import { t } from '../i18n.js';
import { naturalCompare, naturalCompareByName } from '../core/sort.js';
import { getCachedBooks } from '../books.js';

export function _sortedByName(items) {
  return [...items].sort(naturalCompareByName);
}

export function _populateParentBookSelect(selectId, selectedId = null, excludeBookId = null) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = `<option value="">${t('editbook.none')}</option>`;
  const books = _sortedByName((getCachedBooks() || []).filter(b => b.is_container && b.id !== excludeBookId));
  const counts = new Map();
  books.forEach(book => counts.set(book.name, (counts.get(book.name) || 0) + 1));
  books.forEach(book => {
    const label = counts.get(book.name) > 1 ? `${book.name} (#${book.id})` : book.name;
    const opt = document.createElement('option');
    opt.value = String(book.id);
    opt.textContent = label;
    if (book.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

export function _populateSeriesSelect(selectId, selectedName) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = `<option value="">${t('editbook.none')}</option>`;
  // Skip authenticated series requests in demo mode to avoid session-expiry handling.
  if (isDemoMode) return;
  apiFetch('/api/series').then(async r => {
    if (!r.ok) return;
    const list = (await r.json()).sort((a, b) => naturalCompare(a.name, b.name));
    const counts = new Map();
    list.forEach(series => counts.set(series.name, (counts.get(series.name) || 0) + 1));
    list.forEach(s => {
      const o = document.createElement('option');
      o.value = s.name;
      o.textContent = counts.get(s.name) > 1 ? `${s.name} (#${s.id})` : s.name;
      if (s.name === selectedName) o.selected = true;
      sel.appendChild(o);
    });
    if (selectedName && !list.find(s => s.name === selectedName)) {
      const o = document.createElement('option');
      o.value = selectedName;
      o.textContent = selectedName;
      o.selected = true;
      sel.appendChild(o);
    }
  }).catch(() => {});
}
