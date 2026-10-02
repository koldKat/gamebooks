import { state, parseSecId } from '../core/state.js';
import { graphRuntime } from './runtime.js';

// Build overlay measurements on state changes, not every drawing frame.
export const _NOTE_FONT      = '10px Segoe UI, system-ui, sans-serif';
export const _NOTE_PAD_X     = 5;
export const _NOTE_PAD_Y     = 3;
export const _NOTE_LINE_H    = 12;
export const _NOTE_FONT_PX   = 10;
const _measureCtx     = document.createElement('canvas').getContext('2d');

// Cache overlay descriptors and drag-sensitive positions.
// Keep fog positions separate because fog can involve nodes without overlays.

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
