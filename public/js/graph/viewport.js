import { state } from '../core/state.js';
import { network, graphRuntime } from './runtime.js';

// Bound saved zoom so accidental extreme zoom-outs cannot persist.
export const MIN_VIEWPORT_SCALE = 0.3;
export const MAX_VIEWPORT_SCALE = 3;
export function clampViewportScale(scale) {
  return Math.min(MAX_VIEWPORT_SCALE, Math.max(MIN_VIEWPORT_SCALE, scale));
}
// Use a stricter zoom floor on entry than during manual zooming.
export const RESTORE_MIN_VIEWPORT_SCALE = 0.6;

// Share world-space spacing between grid drawing and snapping.
export const GRID_SIZE = 40;

// Keep grid cells large enough for reliable touch snapping.
const SNAP_MIN_SCREEN_PX = 28;
export function minSnapScale() { return SNAP_MIN_SCREEN_PX / GRID_SIZE; }

// Enforce the floor on zoom and when snapping is enabled.
// Restore the last valid center and pan anchor to prevent sideways drift.

export function enforceSnapZoomFloor() {
  if (!network || !state.snapToGrid) return;
  const floor = minSnapScale();
  if (network.getScale() < floor) {
    // Pass the center explicitly rather than relying on moveTo defaults.
    const pos = graphRuntime._lastAboveFloorViewPos ?? network.getViewPosition();
    network.moveTo({ scale: floor, position: pos });
    // Seed the anchor for sessions that start at the zoom floor.
    graphRuntime._lastAboveFloorViewPos = pos;
  } else {
    graphRuntime._lastAboveFloorViewPos = network.getViewPosition();
  }
}
