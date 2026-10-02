import { state, isValidSecId } from '../core/state.js';

// Require finite coordinates; NaN/Infinity can corrupt physics across the entire graph.
export function _hasValidPos(pos) {
  return !!pos && Number.isFinite(pos.x) && Number.isFinite(pos.y);
}

// Highlight the displayed run's alternate start, but not a portal-entry section as a new book start.
export function _effectiveStartSec(displayPt) {
  if (displayPt?.path?.length && isValidSecId(displayPt.path[0]) && !displayPt.portalEntry) return displayPt.path[0];
  return isValidSecId(state.startSection) ? state.startSection : 1;
}

export function naturalCompareIds(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}
