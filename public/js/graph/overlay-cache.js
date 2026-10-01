import { state, parseSecId } from '../state.js';
import { graphRuntime } from './runtime.js';

// ── Overlay draw cache ────────────────────────────────────────────────────────
// Rebuilt in syncGraph() (state-change time), consumed in drawOverlays() (per frame).
// Avoids iterating all nodes and calling measureText on every afterDrawing event.
export const _NOTE_FONT      = '10px Segoe UI, system-ui, sans-serif';
export const _NOTE_PAD_X     = 5;
export const _NOTE_PAD_Y     = 3;
export const _NOTE_LINE_H    = 12;
export const _NOTE_FONT_PX   = 10;
const _measureCtx     = document.createElement('canvas').getContext('2d');

// Nodes that need any overlay drawn - only these are passed to getPositions().
// Per-node overlay descriptor: { sec, priority, battle, note, noteLayout? }
// Separate map for pinned-note layout (also a subset of graphRuntime._overlayNodes).
// Cached positions (graph-space coords don't change during pan/zoom, only on drag).

// Same caching strategy as the overlay cache above, for the fog-of-grid halo
// positions - all nodes are candidates here (not just ones with an overlay),
// so it's kept separate rather than reusing graphRuntime._overlayPositions.

export function _buildOverlayCache() {
  graphRuntime._overlayNodeIds  = [];
  graphRuntime._overlayNodes    = [];
  graphRuntime._overlayPosDirty = true;
  graphRuntime._fogPosDirty     = true;
  graphRuntime._noteLabelCache.clear();
  _measureCtx.font = _NOTE_FONT;

  for (const [secId, data] of Object.entries(state.graph)) {
    if (!data.priority && !data.battle && !data.note) continue;
    const sec = parseSecId(secId);
    graphRuntime._overlayNodeIds.push(sec);
    let noteLayout = null;
    if (data.showNote && data.note) {
      const lines = data.note.split('\n');
      const boxW  = Math.max(...lines.map(l => _measureCtx.measureText(l).width)) + _NOTE_PAD_X * 2;
      const boxH  = _NOTE_PAD_Y * 2 + (lines.length - 1) * _NOTE_LINE_H + _NOTE_FONT_PX;
      noteLayout  = { lines, boxW, boxH };
      graphRuntime._noteLabelCache.set(sec, noteLayout);
    }
    graphRuntime._overlayNodes.push({ sec, priority: data.priority, battle: data.battle, note: data.note, noteLayout });
  }
}
