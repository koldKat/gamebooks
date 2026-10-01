import { state } from '../state.js';
import { network, graphRuntime } from './runtime.js';

// Bounds for persisted zoom level - keeps an accidental pinch/scroll zoom-out
// (e.g. from a child mashing the trackpad) from getting saved and then
// permanently re-applied on every future load, leaving the chart stuck as a dot.
export const MIN_VIEWPORT_SCALE = 0.3;
export const MAX_VIEWPORT_SCALE = 3;
export function clampViewportScale(scale) {
  return Math.min(MAX_VIEWPORT_SCALE, Math.max(MIN_VIEWPORT_SCALE, scale));
}
// A tighter floor used only when *restoring* a saved zoom on entry
// (_focusNodeAfterLoad in open-world.js), not for manual zooming during an
// active session. MIN_VIEWPORT_SCALE alone (0.3) was too permissive here -
// any accidental zoom-out during a session, even briefly, gets debounce-
// saved via the 'zoom' listener below and then force-reapplied via
// network.focus() on every future entry into that book, "sticking" the view
// at a tiny, hard-to-read scale indefinitely. Manual in-session zooming can
// still go below this floor (down to MIN_VIEWPORT_SCALE) - this only affects
// what gets restored automatically on load.
export const RESTORE_MIN_VIEWPORT_SCALE = 0.6;

// World-space spacing (graph units, not screen pixels) - fixed rather than
// user-configurable, and shared by both the grid overlay and snap-to-grid so
// snapped nodes always land on a line the player can actually see.
export const GRID_SIZE = 40;

// Below this many on-screen pixels per grid cell, ordinary touch imprecision
// (a finger's drop point is nowhere near as exact as a mouse cursor) is
// bigger than the cell itself - a drag meant to return a node to its exact
// snapped spot lands one cell to either side just as often as on target,
// which reads as "snapping to the middle between two grid lines." Enforced
// as a live zoom floor only while snapToGrid is on (see enforceSnapZoomFloor
// below) - MIN_VIEWPORT_SCALE above is a much looser absolute bound that
// still allows this.
const SNAP_MIN_SCREEN_PX = 28;
export function minSnapScale() { return SNAP_MIN_SCREEN_PX / GRID_SIZE; }

// Called on every 'zoom' event (below) and once right after snapToGrid is
// switched on (boot.js) - the latter covers the case where the graph was
// already zoomed out past the floor before the toggle, which the zoom
// listener alone would never catch since no further zooming may happen.
//
// Reverting a sub-floor zoom pins the view to the last AT-OR-ABOVE-FLOOR
// center, not the network's live one. vis zooms each wheel tick around the
// cursor: its zoom() recomputes the translation so the pointer's canvas point
// stays fixed and only THEN emits 'zoom' - so by the time this handler runs,
// the center has already crept one tick toward the pointer. Pinning that
// crept center every tick made the view slide steadily sideways (toward the
// cursor) on every wheel tick below the floor instead of holding still.
// Canvas coords, refreshed on above-floor zooms and on view-drag end (pure
// pans fire no 'zoom' event). Reset per graph in initGraph().

export function enforceSnapZoomFloor() {
  if (!network || !state.snapToGrid) return;
  const floor = minSnapScale();
  if (network.getScale() < floor) {
    // position explicit (not omitted) - no other moveTo() call exists
    // elsewhere in this codebase to lean on for "omitting position keeps the
    // current center" being vis-network's actual default, so pin it via
    // getViewPosition() instead of assuming.
    const pos = graphRuntime._lastAboveFloorViewPos ?? network.getViewPosition();
    network.moveTo({ scale: floor, position: pos });
    // Seed the anchor with the pinned position - a user who starts AT the
    // floor and only ever wheels down never triggers an above-floor 'zoom'
    // event, so without this the anchor would stay null and every tick would
    // pin the freshly crept center (the sideways-slide bug) forever.
    graphRuntime._lastAboveFloorViewPos = pos;
  } else {
    graphRuntime._lastAboveFloorViewPos = network.getViewPosition();
  }
}
