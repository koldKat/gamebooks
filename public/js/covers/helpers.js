import { naturalCompareByName } from '../core/sort.js';

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
