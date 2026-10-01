import { state } from '../state.js';
import { network, visNodes, graphRuntime } from './runtime.js';
import { GRID_SIZE } from './viewport.js';
import { _NOTE_FONT, _NOTE_PAD_X, _NOTE_PAD_Y, _NOTE_LINE_H } from './overlay-cache.js';

// Fixed radius (graph units) a "fog of grid" halo extends around each node -
// fixed rather than scaled to node spacing, same reasoning as GRID_SIZE
// itself: one predictable constant instead of another speculative setting.
const FOG_RADIUS = 125;

// Drawn on 'beforeDrawing' (under nodes/edges), in world coordinates so it
// pans/zooms with the graph instead of sitting fixed on screen.
export function drawGrid(ctx) {
  if (!network || (!state.showGrid && !state.fogOfGrid)) return;
  const container = document.getElementById('graph-container');
  if (!container) return;
  const topLeft     = network.DOMtoCanvas({ x: 0, y: 0 });
  const bottomRight = network.DOMtoCanvas({ x: container.clientWidth, y: container.clientHeight });

  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
  ctx.lineWidth   = 1 / network.getScale();

  // Fog of grid: clip to a circular halo around each node first, so the
  // grid lines drawn afterward only ever show up near a node - mutually
  // exclusive with the always-visible "Show grid" (state.showGrid).
  if (state.fogOfGrid) {
    if (!visNodes) { ctx.restore(); return; }
    const ids = visNodes.getIds();
    if (!ids.length) { ctx.restore(); return; }
    // Same idea as the overlay position cache below - avoid recomputing
    // every node's position and rebuilding a multi-circle clip path on
    // every single beforeDrawing frame (fired continuously during pan/zoom)
    // when nothing has actually moved.
    if (graphRuntime._fogDraggingActive || graphRuntime._fogPosDirty) {
      graphRuntime._fogPositions = network.getPositions(ids);
      graphRuntime._fogPosDirty  = false;
    }
    ctx.beginPath();
    for (const id of ids) {
      const p = graphRuntime._fogPositions[id];
      if (!p) continue;
      ctx.moveTo(p.x + FOG_RADIUS, p.y);
      ctx.arc(p.x, p.y, FOG_RADIUS, 0, Math.PI * 2);
    }
    ctx.clip();
  }

  const startX = Math.floor(topLeft.x / GRID_SIZE) * GRID_SIZE;
  const startY = Math.floor(topLeft.y / GRID_SIZE) * GRID_SIZE;
  ctx.beginPath();
  for (let x = startX; x <= bottomRight.x; x += GRID_SIZE) {
    ctx.moveTo(x, topLeft.y);
    ctx.lineTo(x, bottomRight.y);
  }
  for (let y = startY; y <= bottomRight.y; y += GRID_SIZE) {
    ctx.moveTo(topLeft.x, y);
    ctx.lineTo(bottomRight.x, y);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawOverlays(ctx) {
  if (!graphRuntime._overlayNodeIds.length) return;

  // Graph-space coords are stable across pan/zoom; only refresh when nodes moved.
  // During an active drag of an overlay node, always fetch (skip caching).
  if (graphRuntime._overlayDraggingActive) {
    graphRuntime._overlayPositions = network.getPositions(graphRuntime._overlayNodeIds);
  } else if (graphRuntime._overlayPosDirty) {
    graphRuntime._overlayPositions = network.getPositions(graphRuntime._overlayNodeIds);
    graphRuntime._overlayPosDirty  = false;
  }
  const pos = graphRuntime._overlayPositions;

  ctx.lineCap = 'butt'; // reset to default before we begin

  for (const node of graphRuntime._overlayNodes) {
    const p = pos[node.sec];
    if (!p) continue;

    // ── Priority indicator (triangle, top-left) ───────────────────
    if (node.priority) {
      const hi = node.priority === 'high';
      const cx = p.x - 9, cy = p.y - 9, r = 5;
      ctx.beginPath();
      if (hi) {
        ctx.moveTo(cx,     cy - r);
        ctx.lineTo(cx + r, cy + r * 0.65);
        ctx.lineTo(cx - r, cy + r * 0.65);
      } else {
        ctx.moveTo(cx,     cy + r);
        ctx.lineTo(cx + r, cy - r * 0.65);
        ctx.lineTo(cx - r, cy - r * 0.65);
      }
      ctx.closePath();
      ctx.fillStyle   = hi ? '#4ade80' : '#f87171';
      ctx.fill();
      ctx.strokeStyle = hi ? '#14532d' : '#991b1b';
      ctx.lineWidth   = 0.8;
      ctx.stroke();
    }

    // ── Battle indicator (cross, bottom-right) ────────────────────
    if (node.battle) {
      const cx = p.x + 9, cy = p.y + 9, r = 4;
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth   = 1.5;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // ── Note indicator (book icon, top-right) ─────────────────────
    if (node.note) {
      const bx = p.x + 6, by = p.y - 13, bw = 6, bh = 8;
      ctx.fillStyle   = '#16a34a';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth   = 0.8;
      ctx.beginPath();
      ctx.moveTo(bx + 2, by + 1);
      ctx.lineTo(bx + 2, by + bh - 1);
      ctx.stroke();
    }

    // ── Pinned note text ──────────────────────────────────────────
    if (node.noteLayout) {
      const { lines, boxW, boxH } = node.noteLayout;
      const bx = p.x + 18, by = p.y - boxH / 2;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 3);
      ctx.fill();
      ctx.strokeStyle = '#374151';
      ctx.lineWidth   = 0.6;
      ctx.stroke();
      ctx.font         = _NOTE_FONT;
      ctx.textBaseline = 'top';
      ctx.fillStyle    = '#d1d5db';
      for (let i = 0; i < lines.length; i++)
        ctx.fillText(lines[i], bx + _NOTE_PAD_X, by + _NOTE_PAD_Y + i * _NOTE_LINE_H);
    }
  }
}
