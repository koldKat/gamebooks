import { naturalCompareByName } from '../core/sort.js';

// Keep public destinations crawlable while ordinary clicks retain modal navigation.
export function publicEntryLinks(body) {
  body.querySelectorAll('button.book-modal-parent-btn, button.book-modal-series-btn, button.book-modal-child-row').forEach(button => {
    const series = button.classList.contains('book-modal-series-btn');
    const id = Number(series ? button.dataset.seriesId : button.dataset.bookId);
    if (!Number.isSafeInteger(id) || id < 1) return;
    const anchor = document.createElement('a');
    for (const attr of button.attributes) if (attr.name !== 'type') anchor.setAttribute(attr.name, attr.value);
    anchor.href = `/${series ? 'series' : button.matches('.book-modal-parent-btn,.anthology-name-btn') ? 'anthology' : 'book'}/${id}`;
    anchor.innerHTML = button.innerHTML;
    button.replaceWith(anchor);
  });
}

export function handlePublicEntryClick(event) {
  if (event.currentTarget.tagName !== 'A') return true;
  if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
  event.preventDefault();
  return true;
}

export function _sortedByName(items) {
  return [...items].sort(naturalCompareByName);
}

export function _isMobile() { return window.innerWidth <= 768; }
export function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
