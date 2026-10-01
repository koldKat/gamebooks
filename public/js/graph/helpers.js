import { state, isValidSecId } from '../state.js';

// A saved position is an object ({x, y}), which is always truthy regardless
// of what's inside it - `!pos` alone treats {x: NaN, y: 40} as "already
// positioned" just as readily as a real coordinate. A NaN/Infinity
// coordinate poisons vis-network's physics (pairwise force calculations
// between every node pair), causing chaotic movement across the *whole*
// graph that never self-corrects during the live session - nothing else
// ever re-examines an already-"positioned" node's actual coordinate
// validity. Traced to JSON.stringify silently turning NaN into null on
// save (saveState's JSON.stringify(state)), which is why reloading the
// page "fixed" it: the reloaded value is null, correctly fails a plain
// truthy check, and gets a fresh valid position - not because anything
// about the corruption itself was time-limited.
export function _hasValidPos(pos) {
  return !!pos && Number.isFinite(pos.x) && Number.isFinite(pos.y);
}

// The "start" node to highlight follows whichever run is actually being
// displayed, not always the book's default `state.startSection` - a run
// begun via the alternate-start button (see play.js) has its own path[0],
// which may be a completely different node. Portal-entered runs (path[0]
// is just wherever the portal dropped the player, see play.js/open-world.js
// `portalEntry`) are NOT an alt-start and should still defer to the book's
// real start section.
export function _effectiveStartSec(displayPt) {
  if (displayPt?.path?.length && isValidSecId(displayPt.path[0]) && !displayPt.portalEntry) return displayPt.path[0];
  return isValidSecId(state.startSection) ? state.startSection : 1;
}

export function naturalCompareIds(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}
