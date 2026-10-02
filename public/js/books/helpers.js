import { naturalCompareByName } from '../core/sort.js';

export function _sortedByName(items) { return [...items].sort(naturalCompareByName); }
export function _isMobile() { return window.innerWidth <= 768; }
